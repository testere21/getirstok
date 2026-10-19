/**
 * Okunmamış bir DPS raporunu indirip Soğukkuyu siparişlerini gün dokümanlarına yazar.
 * Sadece sunucuda çalışır (exceljs + bayi token'ı).
 */
import { parseDepoIciSure } from "./dpsReportParse";
import {
  DpsReportApiError,
  downloadDpsReport,
  isSogukkuyuOnlyReport,
  listDpsReports,
  requireFranchiseToken,
  type DpsReportSummary,
} from "./getirDpsReportService";
import {
  INITIAL_PICKER_NAMES,
  groupByDay,
  pickerKey,
  planDayUpdates,
  selectReportOrders,
  toStoredOrder,
  type PickerEntry,
  type StoredPickerOrder,
} from "./pickerStatsMerge";
import { fetchPickerMetrics } from "./getirPickerMetricsService";
import {
  clampMetricsRange,
  needsMetricsFetch,
  pickerMetricsRetentionCutoff,
} from "./pickerMetrics";
import {
  MAX_RANGE_DAYS,
  addDaysYmd,
  daysInRange,
  istanbulTodayYmd,
  type YmdRange,
} from "./pickerStatsPeriod";
import {
  deletePickerMetricsBefore,
  patchPickerStatsState,
  readPickerMetricDaysRange,
  readPickerRatingRange,
  readPickerStatsDay,
  readPickerStatsState,
  scanLatestPickerStatsDay,
  writePickerMetricDay,
  writePickerRatingRange,
  writePickerStatsDayOrders,
  type PickerStatsState,
} from "./pickerStatsStore";

/** Bir çağrıda Getir'e en fazla bu kadar istek (Netlify süre sınırı) */
const METRICS_TASKS_PER_CALL = 6;
const METRICS_CONCURRENCY = 3;

export interface PickerStatsSyncResult {
  /** Bu çağrıda işlenen rapor sayısı (0 veya 1) */
  processed: number;
  /** Hâlâ okunmamış rapor sayısı */
  remaining: number;
  report: {
    id: string;
    startDate: string | null;
    endDate: string | null;
    sogukkuyuOnly: boolean;
    orders: number;
    kept: number;
    ordersWritten: number;
    daysWritten: number;
    noRecords: boolean;
    fileGone: boolean;
  } | null;
  /** Bu raporla listeye otomatik eklenen toplayıcılar */
  newPickers: string[];
}

function initialPickers(now: string): Record<string, PickerEntry> {
  const pickers: Record<string, PickerEntry> = {};
  for (const name of INITIAL_PICKER_NAMES) {
    pickers[pickerKey(name)] = { name, active: true, source: "manual", firstSeenAt: now };
  }
  return pickers;
}

export interface PickerMetricsSyncResult {
  /** Bu çağrıda Getir'den çekilen günler */
  fetchedDays: string[];
  /** Bu çağrıda aralığın yıldız ortalaması çekildi mi */
  ratingFetched: boolean;
  /** Hâlâ çekilecek gün sayısı */
  remaining: number;
}

/**
 * Aralığın günlük SKU / problemli kayıtlarını ve (çok günlüyse) yıldız ortalamasını
 * tamamlar. Kaydı olan gün/aralık sadece `refreshSince` verilirse ve kesinleşmemişse
 * yeniden çekilir. Panel `remaining` 0 olana kadar tekrar çağırır.
 */
export async function syncPickerMetrics(
  range: YmdRange,
  refreshSince: string | null
): Promise<PickerMetricsSyncResult> {
  const today = istanbulTodayYmd();
  const { from, to } = clampMetricsRange(range, today);
  const days = daysInRange({ from, to });

  const [existing, rating] = await Promise.all([
    readPickerMetricDaysRange(from, to),
    from === to ? Promise.resolve(null) : readPickerRatingRange(from, to),
  ]);
  const pendingDays = days.filter((d) => needsMetricsFetch(existing.get(d), d, refreshSince));
  const ratingPending = from !== to && needsMetricsFetch(rating, to, refreshSince);
  if (pendingDays.length === 0 && !ratingPending) {
    return { fetchedDays: [], ratingFetched: false, remaining: 0 };
  }

  const token = await requireFranchiseToken();
  const batchDays = pendingDays.slice(0, METRICS_TASKS_PER_CALL - (ratingPending ? 1 : 0));
  const tasks: (() => Promise<void>)[] = batchDays.map((ymd) => async () => {
    const pickers = await fetchPickerMetrics(ymd, ymd, token);
    await writePickerMetricDay(ymd, { pickers, fetchedAt: new Date().toISOString() });
  });
  if (ratingPending) {
    tasks.push(async () => {
      const pickers = await fetchPickerMetrics(from, to, token);
      const ratings: Record<string, number> = {};
      for (const [key, m] of Object.entries(pickers)) if (m.rating != null) ratings[key] = m.rating;
      await writePickerRatingRange({ from, to, ratings, fetchedAt: new Date().toISOString() });
    });
  }
  for (let i = 0; i < tasks.length; i += METRICS_CONCURRENCY) {
    await Promise.all(tasks.slice(i, i + METRICS_CONCURRENCY).map((run) => run()));
  }

  try {
    const removed = await deletePickerMetricsBefore(pickerMetricsRetentionCutoff(today));
    if (removed > 0) console.log("[Toplayıcı metrikleri] 5 aydan eski kayıt silindi:", removed);
  } catch (cleanupError) {
    console.warn("[Toplayıcı metrikleri] Eski kayıt temizliği başarısız:", cleanupError);
  }
  return {
    fetchedDays: batchDays,
    ratingFetched: ratingPending,
    remaining: pendingDays.length - batchDays.length,
  };
}

/** Eskiden yeniye: daha yeni rapor, aynı siparişte eskisinin üstüne yazsın */
function pendingReports(reports: DpsReportSummary[], state: PickerStatsState): DpsReportSummary[] {
  return reports
    .filter((r) => !state.processedReports[r.id])
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
}

/**
 * Her çağrıda en fazla bir rapor işler (Netlify süre sınırı). Panel `remaining` 0 olana
 * kadar tekrar çağırır. Aynı rapor ikinci kez çağrılsa da sonuç değişmez.
 */
export async function syncNextDpsReport(): Promise<PickerStatsSyncResult> {
  const now = new Date().toISOString();
  const token = await requireFranchiseToken();
  const [reports, state] = await Promise.all([listDpsReports(token), readPickerStatsState()]);

  if (Object.keys(state.pickers).length === 0) {
    state.pickers = initialPickers(now);
    await patchPickerStatsState({ pickers: state.pickers });
  }

  const pending = pendingReports(reports, state);
  const report = pending[0];
  if (!report) {
    // `latestDay` alanından önce yazılmış veri için bir kerelik doldurma
    const latestDay =
      state.latestDay ??
      (await scanLatestPickerStatsDay(addDaysYmd(istanbulTodayYmd(), -MAX_RANGE_DAYS)));
    await patchPickerStatsState({ lastSyncAt: now, ...(latestDay ? { latestDay } : {}) });
    return { processed: 0, remaining: 0, report: null, newPickers: [] };
  }

  const sogukkuyuOnly = isSogukkuyuOnlyReport(report);

  let file: ArrayBuffer;
  try {
    file = await downloadDpsReport(report, token);
  } catch (error) {
    if (!(error instanceof DpsReportApiError) || error.code !== "FILE_GONE") throw error;
    // Getir dosyayı silmiş (8 gün): bir daha denenmesin, sıradaki rapora geçilsin
    await patchPickerStatsState({
      processedReports: {
        [report.id]: {
          at: now,
          startDate: report.startDate,
          endDate: report.endDate,
          sogukkuyuOnly,
          orders: 0,
          kept: 0,
          fileGone: true,
        },
      },
      lastSyncAt: now,
    });
    return {
      processed: 1,
      remaining: pending.length - 1,
      report: {
        id: report.id,
        startDate: report.startDate,
        endDate: report.endDate,
        sogukkuyuOnly,
        orders: 0,
        kept: 0,
        ordersWritten: 0,
        daysWritten: 0,
        noRecords: false,
        fileGone: true,
      },
      newPickers: [],
    };
  }

  const parsed = await parseDepoIciSure(file);
  const { kept, newPickers } = selectReportOrders(parsed.orders, {
    sogukkuyuOnly,
    knownPickerKeys: new Set(Object.keys(state.pickers)),
  });

  const reportCreatedAt = report.createdAt ?? now;
  let ordersWritten = 0;
  let daysWritten = 0;
  let latestDay = state.latestDay;
  for (const [ymd, dayOrders] of groupByDay(kept)) {
    if (!latestDay || ymd > latestDay) latestDay = ymd;
    const incoming: Record<string, StoredPickerOrder> = {};
    for (const o of dayOrders) incoming[o.orderId] = toStoredOrder(o, report.id, reportCreatedAt);
    const existing = await readPickerStatsDay(ymd);
    const updates = planDayUpdates(existing.orders, incoming);
    const count = Object.keys(updates).length;
    if (count === 0) continue;
    await writePickerStatsDayOrders(ymd, updates);
    ordersWritten += count;
    daysWritten++;
  }

  const addedPickers: Record<string, PickerEntry> = {};
  for (const p of newPickers) {
    addedPickers[p.key] = { name: p.name, active: true, source: "auto", firstSeenAt: now };
  }

  // Rapor en son işaretlenir: arada hata olursa sonraki çağrı aynı raporu baştan dener
  await patchPickerStatsState({
    processedReports: {
      [report.id]: {
        at: now,
        startDate: report.startDate,
        endDate: report.endDate,
        sogukkuyuOnly,
        orders: parsed.orders.length,
        kept: kept.length,
        noRecords: parsed.noRecords,
      },
    },
    ...(newPickers.length > 0 ? { pickers: addedPickers } : {}),
    ...(latestDay ? { latestDay } : {}),
    lastSyncAt: now,
  });

  return {
    processed: 1,
    remaining: pending.length - 1,
    report: {
      id: report.id,
      startDate: report.startDate,
      endDate: report.endDate,
      sogukkuyuOnly,
      orders: parsed.orders.length,
      kept: kept.length,
      ordersWritten,
      daysWritten,
      noRecords: parsed.noRecords,
      fileGone: false,
    },
    newPickers: newPickers.map((p) => p.name),
  };
}

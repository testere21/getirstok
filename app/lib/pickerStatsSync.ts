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
import { MAX_RANGE_DAYS, addDaysYmd, istanbulTodayYmd } from "./pickerStatsPeriod";
import {
  patchPickerStatsState,
  readPickerStatsDay,
  readPickerStatsState,
  scanLatestPickerStatsDay,
  writePickerStatsDayOrders,
  type PickerStatsState,
} from "./pickerStatsStore";

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

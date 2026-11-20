"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  FileText,
  Gauge,
  Loader2,
  RefreshCw,
  Star,
  UserPlus,
  Users,
} from "lucide-react";
import {
  aggregatePickerStats,
  pickerWarehouseId,
  sortPickerStats,
  type PickerRangeMetrics,
  type PickerSortKey,
  type PickerStatRow,
  type SortDirection,
  type StoredPickerOrder,
} from "@/app/lib/pickerStatsMerge";
import {
  daysInRange,
  formatYmdShort,
  isYmd,
  istanbulTodayYmd,
  normalizeRange,
  presetRange,
  type YmdRange,
} from "@/app/lib/pickerStatsPeriod";
import {
  readPickerMetricDaysRange,
  readPickerRatingRange,
  readPickerStatsDaysRange,
  readPickerStatsState,
  type PickerStatsState,
} from "@/app/lib/pickerStatsStore";
import { clampMetricsRange } from "@/app/lib/pickerMetrics";
import {
  FRANCHISE_WAREHOUSES,
  FRANCHISE_WAREHOUSE_IDS,
  SOGUKKUYU_WAREHOUSE_ID,
  warehouseName,
} from "@/app/lib/franchiseWarehouses";
import { useSelectedWarehouseId } from "@/app/lib/selectedWarehouse";
import { PickerManageModal } from "./PickerManageModal";
import { PickerPrimReportModal } from "./PickerPrimReportModal";
import { PickerDailyModal, type PickerDailyRow } from "./PickerDailyModal";
import { DpsPanel } from "./DpsPanel";

const SORT_KEYS: readonly PickerSortKey[] = [
  "total",
  "sku",
  "green",
  "red",
  "greenRate",
  "problematic",
  "rating",
];

const RANGE_STORAGE_KEY = "getirstok.pickerStats.range";
const SORT_STORAGE_KEY = "getirstok.pickerStats.sort";

/** "all" veya depo id */
type WarehouseFilter = string;

function dayCacheKey(warehouseId: string, ymd: string): string {
  return `${warehouseId}|${ymd}`;
}
/** Bir sekme açılışında en fazla bu kadar rapor işlenir (sonsuz döngüye karşı) */
const MAX_SYNC_CALLS = 30;

type SyncStatus =
  | { kind: "idle" }
  | { kind: "running"; done: number; total: number | null }
  | { kind: "done"; processed: number }
  | { kind: "error"; message: string };

interface SyncResponse {
  success: boolean;
  error?: string;
  remaining?: number;
  report?: { ordersWritten: number } | null;
  newPickers?: string[];
}

interface MetricsSyncResponse {
  success: boolean;
  error?: string;
  fetchedDays?: string[];
  ratingFetched?: boolean;
  remaining?: number;
}

/** Bir aralık için en fazla bu kadar metrik çağrısı (her çağrı birkaç gün çeker) */
const MAX_METRICS_SYNC_CALLS = 25;

function formatPercent(rate: number | null): string {
  return rate == null ? "—" : `%${Math.round(rate * 100)}`;
}

function formatRating(rating: number | null): string {
  return rating == null
    ? "—"
    : rating.toLocaleString("tr-TR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

function formatRatio(ratio: number | null): string {
  return ratio == null ? "—" : ratio.toLocaleString("tr-TR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function rangeLabel(range: YmdRange, today: string): string {
  const year = today.slice(0, 4);
  if (range.from === range.to) return formatYmdShort(range.from, year);
  return `${formatYmdShort(range.from, year)} – ${formatYmdShort(range.to, year)}`;
}

/** Son seçilen aralık; yoksa son 7 gün */
function readStoredRange(): YmdRange {
  const fallback = presetRange("last7", istanbulTodayYmd());
  if (typeof window === "undefined") return fallback;
  try {
    const v = JSON.parse(window.localStorage.getItem(RANGE_STORAGE_KEY) ?? "null");
    if (typeof v?.from === "string" && typeof v?.to === "string" && isYmd(v.from) && isYmd(v.to)) {
      return { from: v.from, to: v.to };
    }
  } catch {
    /* bozuk kayıt: varsayılan */
  }
  return fallback;
}

function readStoredSort(): { key: PickerSortKey; direction: SortDirection } {
  const fallback = { key: "total" as PickerSortKey, direction: "desc" as SortDirection };
  if (typeof window === "undefined") return fallback;
  try {
    const v = JSON.parse(window.localStorage.getItem(SORT_STORAGE_KEY) ?? "null");
    if (SORT_KEYS.includes(v?.key) && (v?.direction === "asc" || v?.direction === "desc")) {
      return v;
    }
  } catch {
    /* bozuk kayıt: varsayılan */
  }
  return fallback;
}

function GreenBar({ rate }: { rate: number | null }) {
  const pct = rate == null ? 0 : Math.round(rate * 100);
  return (
    <div className="flex items-center gap-2">
      <div
        className={`hidden h-2 w-24 overflow-hidden rounded-full sm:block ${
          rate == null ? "bg-zinc-200 dark:bg-zinc-700" : "bg-red-200 dark:bg-red-900/50"
        }`}
        aria-hidden
      >
        {rate != null && (
          <div className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400" style={{ width: `${pct}%` }} />
        )}
      </div>
      <span className="w-10 text-right tabular-nums">{formatPercent(rate)}</span>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "green" | "red";
}) {
  const toneClass =
    tone === "green"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "red"
        ? "text-red-700 dark:text-red-400"
        : "text-zinc-900 dark:text-zinc-50";
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-2 py-2.5 sm:px-3 dark:border-zinc-700 dark:bg-zinc-800/60">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function ToplayiciPerformansiPanel() {
  const [today, setToday] = useState(() => istanbulTodayYmd());
  const [selectedRange, setSelectedRange] = useState<YmdRange>(readStoredRange);
  const [sort, setSort] = useState(readStoredSort);

  const [state, setState] = useState<PickerStatsState | null>(null);
  const [dayCache, setDayCache] = useState<Map<string, Record<string, StoredPickerOrder>>>(() => new Map());
  const [loadingDays, setLoadingDays] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [dayError, setDayError] = useState<string | null>(null);
  const latestDay = state?.latestDay ?? null;
  const loadError = metaError ?? dayError;
  const [sync, setSync] = useState<SyncStatus>({ kind: "idle" });
  const [newPickers, setNewPickers] = useState<string[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [dailyPickerKey, setDailyPickerKey] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const syncingRef = useRef(false);
  /** Senkron sürerken kişi eklenirse, bitince bir tur daha (işaretlenen raporlar için) */
  const resyncRequestedRef = useRef(false);
  const autoSyncStartedRef = useRef(false);

  /** Gün → bayi paneli metrikleri; `null`: o gün henüz Getir'den çekilmemiş */
  const [metricDayCache, setMetricDayCache] = useState<
    Map<string, Record<string, PickerRangeMetrics> | null>
  >(() => new Map());
  /** `${from}_${to}` → yıldız ortalamaları; `null`: aralık henüz çekilmemiş */
  const [ratingCache, setRatingCache] = useState<Map<string, Record<string, number> | null>>(
    () => new Map()
  );
  const [metricsSyncing, setMetricsSyncing] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const metricsSyncingRef = useRef(false);
  /** Senkron sürerken aralık değişirse / Güncelle'ye basılırsa bitince bir tur daha */
  const metricsPendingRef = useRef<{ range: YmdRange; refreshSince: string | null } | null>(null);

  // Depo filtresi ana ekrandaki seçimi izler; "Tüm depolar" yalnızca bu sekmede geçici seçilebilir
  const panelWarehouseId = useSelectedWarehouseId();
  const [warehouseFilter, setWarehouseFilter] = useState<WarehouseFilter>(panelWarehouseId);
  useEffect(() => {
    setWarehouseFilter(panelWarehouseId);
  }, [panelWarehouseId]);
  const selectedWarehouseIds = useMemo<readonly string[]>(
    () => (warehouseFilter === "all" ? FRANCHISE_WAREHOUSE_IDS : [warehouseFilter]),
    [warehouseFilter]
  );

  const range = useMemo(() => normalizeRange(selectedRange), [selectedRange]);
  const rangeDays = useMemo(() => daysInRange(range), [range]);
  const metricsRange = useMemo(() => clampMetricsRange(range, today), [range, today]);
  const metricsKey = `${metricsRange.from}_${metricsRange.to}`;
  const metricDays = useMemo(() => daysInRange(metricsRange), [metricsRange]);
  const singleDayMetrics = metricsRange.from === metricsRange.to;

  useEffect(() => {
    window.localStorage.setItem(RANGE_STORAGE_KEY, JSON.stringify(selectedRange));
  }, [selectedRange]);
  useEffect(() => {
    window.localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort));
  }, [sort]);

  // Panel gece açık kalırsa "bugün" kaysın
  useEffect(() => {
    const id = window.setInterval(() => setToday(istanbulTodayYmd()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const refreshMeta = useCallback(async () => {
    setState(await readPickerStatsState());
  }, []);

  useEffect(() => {
    refreshMeta().catch(() =>
      setMetaError("Toplayıcı listesi okunamadı. Sayfayı yenileyip tekrar deneyin.")
    );
  }, [refreshMeta]);

  // Sadece önbellekte olmayan depo-günler okunur (dönem/depo değiştirince aynı gün tekrar okunmaz)
  useEffect(() => {
    const missingByWarehouse = selectedWarehouseIds
      .map((warehouseId) => ({
        warehouseId,
        days: rangeDays.filter((d) => !dayCache.has(dayCacheKey(warehouseId, d))),
      }))
      .filter((m) => m.days.length > 0);
    if (missingByWarehouse.length === 0) return;
    let cancelled = false;
    setLoadingDays(true);
    Promise.all(
      missingByWarehouse.map(async ({ warehouseId, days }) => ({
        warehouseId,
        days,
        found: await readPickerStatsDaysRange(warehouseId, days[0], days[days.length - 1]),
      }))
    )
      .then((results) => {
        if (cancelled) return;
        setDayCache((prev) => {
          const next = new Map(prev);
          for (const { warehouseId, days, found } of results) {
            for (const d of days) next.set(dayCacheKey(warehouseId, d), found.get(d) ?? {});
          }
          return next;
        });
        setDayError(null);
      })
      .catch(() => {
        if (!cancelled) setDayError("İstatistikler okunamadı. Sayfayı yenileyip tekrar deneyin.");
      })
      .finally(() => {
        if (!cancelled) setLoadingDays(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedWarehouseIds, rangeDays, dayCache]);

  // Günlük metrik kayıtları Firestore'dan (önbellekte olmayan günler)
  useEffect(() => {
    const missing = metricDays.filter((d) => !metricDayCache.has(d));
    if (missing.length === 0) return;
    let cancelled = false;
    readPickerMetricDaysRange(missing[0], missing[missing.length - 1])
      .then((found) => {
        if (cancelled) return;
        setMetricDayCache((prev) => {
          const next = new Map(prev);
          for (const d of missing) next.set(d, found.get(d)?.pickers ?? null);
          return next;
        });
      })
      .catch(() => {
        if (!cancelled) setMetricsError("Kayıtlı SKU / problemli sipariş verisi okunamadı.");
      });
    return () => {
      cancelled = true;
    };
  }, [metricDays, metricDayCache]);

  // Çok günlü aralığın yıldız ortalaması Firestore'dan
  useEffect(() => {
    if (singleDayMetrics || ratingCache.has(metricsKey)) return;
    let cancelled = false;
    readPickerRatingRange(metricsRange.from, metricsRange.to)
      .then((found) => {
        if (!cancelled) setRatingCache((prev) => new Map(prev).set(metricsKey, found?.ratings ?? null));
      })
      .catch(() => {
        if (!cancelled) setMetricsError("Kayıtlı yıldız ortalaması okunamadı.");
      });
    return () => {
      cancelled = true;
    };
  }, [singleDayMetrics, metricsKey, metricsRange, ratingCache]);

  /**
   * Eksik günleri/yıldızı Getir'den tamamlatır. `refreshSince` sadece "Güncelle"de verilir;
   * o zaman kesinleşmemiş (son 2 gün) kayıtlar da yenilenir.
   */
  const runMetricsSync = useCallback(
    async (target: YmdRange, refreshSince: string | null): Promise<void> => {
      if (metricsSyncingRef.current) {
        const prev = metricsPendingRef.current;
        metricsPendingRef.current = { range: target, refreshSince: refreshSince ?? prev?.refreshSince ?? null };
        return;
      }
      metricsSyncingRef.current = true;
      setMetricsSyncing(true);
      const key = `${target.from}_${target.to}`;
      try {
        for (let i = 0; i < MAX_METRICS_SYNC_CALLS; i++) {
          const res = await fetch("/api/picker-stats/metrics", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...target, refreshSince }),
          });
          const data = (await res.json().catch(() => null)) as MetricsSyncResponse | null;
          if (!res.ok || !data?.success) throw new Error(data?.error ?? "Bayi paneli metrikleri alınamadı.");
          const fetched = data.fetchedDays ?? [];
          if (fetched.length > 0) {
            setMetricDayCache((prev) => {
              const next = new Map(prev);
              for (const d of fetched) next.delete(d);
              return next;
            });
          }
          if (data.ratingFetched) {
            setRatingCache((prev) => {
              const next = new Map(prev);
              next.delete(key);
              return next;
            });
          }
          if (!data.remaining) break;
        }
        setMetricsError(null);
      } catch (error) {
        setMetricsError(error instanceof Error ? error.message : "Bayi paneli metrikleri alınamadı.");
      } finally {
        metricsSyncingRef.current = false;
        setMetricsSyncing(false);
        const pending = metricsPendingRef.current;
        metricsPendingRef.current = null;
        if (pending) void runMetricsSyncRef.current(pending.range, pending.refreshSince);
      }
    },
    []
  );
  const runMetricsSyncRef = useRef(runMetricsSync);
  useEffect(() => {
    runMetricsSyncRef.current = runMetricsSync;
  }, [runMetricsSync]);

  // Aralık değişince sadece hiç çekilmemiş günler/yıldız Getir'den istenir
  useEffect(() => {
    void runMetricsSync(metricsRange, null);
  }, [metricsRange, runMetricsSync]);

  const runSync = useCallback(async (): Promise<void> => {
    if (syncingRef.current) {
      resyncRequestedRef.current = true;
      return;
    }
    syncingRef.current = true;
    resyncRequestedRef.current = false;
    setSync({ kind: "running", done: 0, total: null });
    let done = 0;
    let total: number | null = null;
    let wrote = false;
    const found: string[] = [];
    try {
      for (let i = 0; i < MAX_SYNC_CALLS; i++) {
        const res = await fetch("/api/picker-stats/sync", { method: "POST" });
        const data = (await res.json().catch(() => null)) as SyncResponse | null;
        if (!res.ok || !data?.success) {
          throw new Error(data?.error ?? "Raporlar okunamadı.");
        }
        if (data.newPickers?.length) found.push(...data.newPickers);
        if (!data.report) break;
        done++;
        if (data.report.ordersWritten > 0) wrote = true;
        total ??= done + (data.remaining ?? 0);
        setSync({ kind: "running", done, total });
        if (!data.remaining) break;
      }
      setSync({ kind: "done", processed: done });
    } catch (error) {
      setSync({ kind: "error", message: error instanceof Error ? error.message : "Raporlar okunamadı." });
    } finally {
      syncingRef.current = false;
      if (found.length > 0) setNewPickers((prev) => [...new Set([...prev, ...found])]);
      if (wrote) setDayCache(new Map());
      refreshMeta()
        .then(() => setMetaError(null))
        .catch(() => setMetaError("Toplayıcı listesi okunamadı. Sayfayı yenileyip tekrar deneyin."));
      if (resyncRequestedRef.current) void runSyncRef.current();
    }
  }, [refreshMeta]);
  const runSyncRef = useRef(runSync);
  useEffect(() => {
    runSyncRef.current = runSync;
  }, [runSync]);

  const onPickerListChanged = useCallback(() => {
    refreshMeta().catch(() =>
      setMetaError("Toplayıcı listesi okunamadı. Sayfayı yenileyip tekrar deneyin.")
    );
  }, [refreshMeta]);

  const onPickerAdded = useCallback(
    (reprocess: number) => {
      if (reprocess > 0) void runSync();
    },
    [runSync]
  );

  // Sekme açılınca yeni raporlar kendiliğinden okunur (Getir dosyaları 8 gün sonra siliyor)
  useEffect(() => {
    if (autoSyncStartedRef.current) return;
    autoSyncStartedRef.current = true;
    void runSync();
  }, [runSync]);

  const rows = useMemo<PickerStatRow[]>(() => {
    if (!state) return [];
    const days = selectedWarehouseIds
      .flatMap((warehouseId) => rangeDays.map((d) => dayCache.get(dayCacheKey(warehouseId, d))))
      .filter((d): d is Record<string, StoredPickerOrder> => !!d);
    const metricDayRecords = metricDays
      .map((d) => metricDayCache.get(d))
      .filter((d): d is Record<string, PickerRangeMetrics> => !!d);
    let ratings: Record<string, number> | undefined;
    if (singleDayMetrics) {
      ratings = {};
      for (const [key, m] of Object.entries(metricDayRecords[0] ?? {})) {
        if (m.rating != null) ratings[key] = m.rating;
      }
    } else {
      ratings = ratingCache.get(metricsKey) ?? undefined;
    }
    return sortPickerStats(
      aggregatePickerStats(days, state.pickers, {
        includeInactive: showInactive,
        warehouseIds: new Set(selectedWarehouseIds),
        metricDays: metricDayRecords,
        ratings,
      }),
      sort.key,
      sort.direction
    );
  }, [
    state,
    selectedWarehouseIds,
    rangeDays,
    dayCache,
    metricDays,
    metricDayCache,
    singleDayMetrics,
    ratingCache,
    metricsKey,
    sort,
    showInactive,
  ]);

  const inactiveCount = useMemo(
    () =>
      state
        ? Object.values(state.pickers).filter(
            (p) => !p.active && selectedWarehouseIds.includes(pickerWarehouseId(p))
          ).length
        : 0,
    [state, selectedWarehouseIds]
  );

  const totals = useMemo(() => {
    const t = rows.reduce(
      (acc, r) => ({
        total: acc.total + r.total,
        sku: acc.sku + r.sku,
        problematic: acc.problematic + r.problematic,
        green: acc.green + r.green,
        red: acc.red + r.red,
      }),
      { total: 0, sku: 0, problematic: 0, green: 0, red: 0 }
    );
    return { ...t, greenRate: t.total > 0 ? t.green / t.total : null };
  }, [rows]);

  const dataReady =
    state != null &&
    selectedWarehouseIds.every((warehouseId) => rangeDays.every((d) => dayCache.has(dayCacheKey(warehouseId, d))));
  const showWarehouseColumn = warehouseFilter === "all";

  /** Ada tıklanınca: aynı gün verisinden kişinin günlük dökümü (ek okuma yok) */
  const dailyPicker = dailyPickerKey ? rows.find((r) => r.key === dailyPickerKey) ?? null : null;
  const dailyPickerRows: PickerDailyRow[] = dailyPicker
    ? rangeDays.map((ymd) => {
        const orders = dayCache.get(dayCacheKey(dailyPicker.warehouseId, ymd)) ?? {};
        let total = 0;
        let green = 0;
        for (const o of Object.values(orders)) {
          if (o.p !== dailyPicker.key) continue;
          total++;
          if (o.c === "g") green++;
        }
        const metrics = metricDayCache.get(ymd);
        return {
          ymd,
          total,
          green,
          red: total - green,
          sku: metrics == null ? null : (metrics[dailyPicker.key]?.sku ?? 0),
          noReport: !latestDay || ymd > latestDay,
        };
      })
    : [];
  /** Güncelle sırasında kayıtlı değerler gösterilmeye devam eder */
  const metricsReady =
    metricDays.every((d) => metricDayCache.get(d) != null) &&
    (singleDayMetrics || ratingCache.get(metricsKey) != null);
  const metricCell = (value: string) => (metricsReady ? value : metricsSyncing ? "…" : "—");
  const rangeAfterData = latestDay != null && range.from > latestDay;

  const onHeaderSort = (key: PickerSortKey) => {
    setSort((prev) =>
      prev.key === key ? { key, direction: prev.direction === "desc" ? "asc" : "desc" } : { key, direction: "desc" }
    );
  };

  const sortIndicator = (key: PickerSortKey) =>
    sort.key === key ? (sort.direction === "desc" ? " ↓" : " ↑") : "";

  return (
    <div className="flex flex-col gap-4">
      {/* Başlık + senkron */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          <Users className="size-5 text-teal-600 dark:text-teal-400" aria-hidden />
          Toplayıcı Performansı
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 dark:text-zinc-400" aria-live="polite">
            {sync.kind === "running"
              ? sync.total
                ? `Raporlar okunuyor (${sync.done}/${sync.total})…`
                : "Yeni raporlar kontrol ediliyor…"
              : sync.kind === "done" && sync.processed > 0
                ? `${sync.processed} yeni rapor okundu`
                : state?.lastSyncAt
                  ? `Son kontrol: ${formatDateTime(state.lastSyncAt)}`
                  : ""}
          </span>
          <button
            type="button"
            onClick={() => setManageOpen(true)}
            disabled={!state}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            <Users className="size-4" aria-hidden />
            Toplayıcılar
          </button>
          <button
            type="button"
            onClick={() => {
              const refreshSince = new Date().toISOString();
              void runSync().then(() => runMetricsSync(metricsRange, refreshSince));
            }}
            disabled={sync.kind === "running" || metricsSyncing}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            <RefreshCw
              className={`size-4 ${sync.kind === "running" || metricsSyncing ? "animate-spin" : ""}`}
              aria-hidden
            />
            Güncelle
          </button>
        </div>
      </div>

      {sync.kind === "error" && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Yeni raporlar okunamadı: {sync.message} Tablo eldeki verilerle gösteriliyor.
          </span>
        </div>
      )}
      {metricsError && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            SKU, problemli sipariş ve yıldız bilgisi güncellenemedi: {metricsError}
            {metricsReady ? " Kayıtlı son değerler gösteriliyor." : ""}
          </span>
        </div>
      )}
      {loadError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{loadError}</span>
        </div>
      )}
      {newPickers.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm text-teal-900 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-200">
          <UserPlus className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {newPickers.length > 6
              ? `${newPickers.length} yeni toplayıcı bulundu ve depolarıyla listeye eklendi (${newPickers.slice(0, 6).join(", ")}…). Depoları Toplayıcılar penceresinden kontrol edebilirsin.`
              : `Yeni toplayıcı bulundu ve listeye eklendi: ${newPickers.join(", ")}`}
          </span>
        </div>
      )}

      {/* Depo + rapor */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="radiogroup"
          aria-label="Depo"
          className="inline-flex flex-wrap rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800"
        >
          {[{ id: "all", name: "Tüm depolar" }, ...FRANCHISE_WAREHOUSES].map((w) => (
            <button
              key={w.id}
              type="button"
              role="radio"
              aria-checked={warehouseFilter === w.id}
              onClick={() => setWarehouseFilter(w.id)}
              className={`min-h-[34px] rounded-md px-3 text-sm font-medium transition ${
                warehouseFilter === w.id
                  ? "bg-white text-teal-700 shadow-sm dark:bg-zinc-900 dark:text-teal-400"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              {w.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          disabled={warehouseFilter === "all" || !dataReady}
          title={warehouseFilter === "all" ? "Rapor için bir depo seç" : "Seçili depo ve tarih aralığı için prim raporu"}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-violet-700 px-3 text-sm font-medium text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FileText className="size-4" aria-hidden />
          Rapor al
        </button>
      </div>

      {/* Tarih aralığı */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
            Başlangıç
            <input
              type="date"
              value={selectedRange.from}
              max={today}
              onChange={(e) => isYmd(e.target.value) && setSelectedRange((r) => ({ ...r, from: e.target.value }))}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </label>
          <label className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
            Bitiş
            <input
              type="date"
              value={selectedRange.to}
              max={today}
              onChange={(e) => isYmd(e.target.value) && setSelectedRange((r) => ({ ...r, to: e.target.value }))}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </label>
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5" aria-hidden />
            {rangeLabel(range, today)} · {rangeDays.length} gün
          </span>
          {latestDay && <span>Veri {formatYmdShort(latestDay, today.slice(0, 4))} tarihine kadar</span>}
        </p>
      </div>

      {/* Özet */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Toplam sipariş" value={dataReady ? String(totals.total) : "…"} tone="neutral" />
        <SummaryCard label="Toplam SKU" value={dataReady ? metricCell(String(totals.sku)) : "…"} tone="neutral" />
        <SummaryCard label="Yeşil" value={dataReady ? String(totals.green) : "…"} tone="green" />
        <SummaryCard label="Kırmızı" value={dataReady ? String(totals.red) : "…"} tone="red" />
        <SummaryCard label="Yeşil oranı" value={dataReady ? formatPercent(totals.greenRate) : "…"} tone="neutral" />
        <SummaryCard
          label="Problemli sipariş"
          value={dataReady ? metricCell(String(totals.problematic)) : "…"}
          tone="neutral"
        />
      </div>

      {/* Tablo */}
      {!dataReady || (loadingDays && rows.length === 0) ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500 dark:text-zinc-400">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Yükleniyor…
        </div>
      ) : (
        <>
          {totals.total === 0 && (
            <p className="rounded-lg border border-dashed border-zinc-300 px-3 py-3 text-center text-sm text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
              {rangeAfterData
                ? `Bu dönem için henüz sipariş raporu yok. Elde ${formatYmdShort(latestDay!, today.slice(0, 4))} tarihine kadar sipariş verisi var; bayi panelinde yeni DPS raporu istendiğinde burada görünür. SKU, problemli sipariş ve yıldız rapordan bağımsız gelir.`
                : "Bu dönemde kayıtlı sipariş yok. SKU, problemli sipariş ve yıldız rapordan bağımsız gelir."}
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
            <table className="w-full text-sm sm:min-w-[46rem]">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                <tr>
                  <th scope="col" className="hidden w-10 px-2 py-2.5 sm:px-3 font-medium sm:table-cell">#</th>
                  <th scope="col" className="px-2 py-2.5 sm:px-3 font-medium">Toplayıcı</th>
                  {(
                    [
                      ["total", "Sipariş"],
                      ["sku", "SKU"],
                      ["green", "Yeşil"],
                      ["red", "Kırmızı"],
                      ["greenRate", "Yeşil %"],
                      ["problematic", "Problemli"],
                      ["rating", "Yıldız"],
                    ] as const
                  ).map(([key, label]) => (
                    <th
                      key={key}
                      scope="col"
                      aria-sort={sort.key === key ? (sort.direction === "desc" ? "descending" : "ascending") : "none"}
                      className="px-2 py-2.5 sm:px-3 text-right font-medium"
                    >
                      <button
                        type="button"
                        onClick={() => onHeaderSort(key)}
                        title={`"${label}" sütununa göre sırala (tekrar tıklayınca yön değişir)`}
                        className={`uppercase tracking-wide transition hover:text-zinc-900 dark:hover:text-zinc-100 ${
                          sort.key === key ? "text-zinc-900 dark:text-zinc-100" : ""
                        }`}
                      >
                        {label}
                        {sortIndicator(key)}
                      </button>
                    </th>
                  ))}
                  <th scope="col" className="hidden px-2 py-2.5 sm:px-3 text-right font-medium sm:table-cell">
                    Ort. uyum
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
                {rows.map((r, i) => (
                  <tr
                    key={r.key}
                    className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/60 ${r.active ? "" : "opacity-60"}`}
                  >
                    <td className="hidden px-2 py-2.5 sm:px-3 tabular-nums text-zinc-400 sm:table-cell">{i + 1}</td>
                    <td className="px-2 py-2.5 sm:px-3 font-medium text-zinc-900 dark:text-zinc-100">
                      <button
                        type="button"
                        onClick={() => setDailyPickerKey(r.key)}
                        title="Günlük dökümü göster"
                        className="text-left underline-offset-2 transition hover:text-teal-700 hover:underline dark:hover:text-teal-400"
                      >
                        {r.name}
                      </button>
                      {!r.active && (
                        <span className="ml-1.5 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                          Pasif
                        </span>
                      )}
                      {showWarehouseColumn && (
                        <span className="mt-0.5 block text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                          {warehouseName(r.warehouseId)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 sm:px-3 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                      {r.total}
                    </td>
                    <td className="px-2 py-2.5 sm:px-3 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                      {metricCell(String(r.sku))}
                    </td>
                    <td className="px-2 py-2.5 sm:px-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                      {r.green}
                    </td>
                    <td className="px-2 py-2.5 sm:px-3 text-right tabular-nums text-red-700 dark:text-red-400">{r.red}</td>
                    <td className="px-2 py-2.5 sm:px-3 text-right text-zinc-700 dark:text-zinc-300">
                      <div className="flex justify-end">
                        <GreenBar rate={r.greenRate} />
                      </div>
                    </td>
                    <td
                      className={`px-2 py-2.5 sm:px-3 text-right tabular-nums ${
                        metricsReady && r.problematic > 0
                          ? "font-medium text-amber-700 dark:text-amber-400"
                          : "text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      {metricCell(String(r.problematic))}
                    </td>
                    <td className="px-2 py-2.5 sm:px-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {metricsReady && r.rating != null ? (
                        <span className="inline-flex items-center gap-1">
                          <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
                          {formatRating(r.rating)}
                        </span>
                      ) : (
                        metricCell("—")
                      )}
                    </td>
                    <td className="hidden px-2 py-2.5 sm:px-3 text-right tabular-nums text-zinc-600 sm:table-cell dark:text-zinc-400">
                      {formatRatio(r.avgRatio)}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-3 py-6 text-center text-zinc-500 dark:text-zinc-400">
                      Toplayıcı listesi boş.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {inactiveCount > 0 && (
            <label className="flex items-center gap-2 self-start text-sm text-zinc-600 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="size-4 rounded border-zinc-300 accent-teal-600"
              />
              Pasifleri göster ({inactiveCount})
            </label>
          )}
        </>
      )}

      {dailyPicker && (
        <PickerDailyModal
          name={dailyPicker.name}
          subtitle={`${warehouseName(dailyPicker.warehouseId)} · ${rangeLabel(range, today)} · günlük`}
          year={today.slice(0, 4)}
          rows={dailyPickerRows}
          skuLoading={metricsSyncing}
          onClose={() => setDailyPickerKey(null)}
        />
      )}

      {reportOpen && warehouseFilter !== "all" && (
        <PickerPrimReportModal
          rows={rows.filter((r) => r.active && r.total > 0)}
          title={`${warehouseName(warehouseFilter)} · ${rangeLabel(range, today)}`}
          onClose={() => setReportOpen(false)}
        />
      )}

      {manageOpen && state && (
        <PickerManageModal
          pickers={state.pickers}
          defaultWarehouseId={warehouseFilter === "all" ? SOGUKKUYU_WAREHOUSE_ID : warehouseFilter}
          onClose={() => setManageOpen(false)}
          onChanged={onPickerListChanged}
          onAdded={onPickerAdded}
          onMoved={() => setDayCache(new Map())}
        />
      )}
    </div>
  );
}

type StatsSubTab = "toplayici" | "dps";

const SUB_TAB_STORAGE_KEY = "getirstok.stats.subTab";

const SUB_TABS: { id: StatsSubTab; label: string; icon: typeof Users }[] = [
  { id: "toplayici", label: "Toplayıcı Performansı", icon: Users },
  { id: "dps", label: "DPS", icon: Gauge },
];

function readStoredSubTab(): StatsSubTab {
  if (typeof window === "undefined") return "toplayici";
  return window.localStorage.getItem(SUB_TAB_STORAGE_KEY) === "dps" ? "dps" : "toplayici";
}

export function IstatistiklerTabContent() {
  const [subTab, setSubTab] = useState<StatsSubTab>(readStoredSubTab);
  const panelWarehouseId = useSelectedWarehouseId();

  useEffect(() => {
    window.localStorage.setItem(SUB_TAB_STORAGE_KEY, subTab);
  }, [subTab]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div
        role="tablist"
        aria-label="İstatistik türü"
        className="inline-flex self-start rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800"
      >
        {SUB_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`stats-subtab-${id}`}
            aria-selected={subTab === id}
            aria-controls={`stats-subpanel-${id}`}
            onClick={() => setSubTab(id)}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-3 text-sm font-medium transition ${
              subTab === id
                ? "bg-white text-teal-700 shadow-sm dark:bg-zinc-900 dark:text-teal-400"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`stats-subpanel-${subTab}`} aria-labelledby={`stats-subtab-${subTab}`}>
        {subTab === "dps" ? (
          // key: depo değişince seçili depoya ait puanlar/grafik sıfırdan yüklenir
          <DpsPanel key={panelWarehouseId} warehouseId={panelWarehouseId} />
        ) : (
          <ToplayiciPerformansiPanel />
        )}
      </div>
    </div>
  );
}

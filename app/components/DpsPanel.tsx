"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CalendarDays, Gauge, Loader2, Trophy } from "lucide-react";
import { DPS_SECTION_LABELS, type DpsSection, type DpsSectionKey } from "@/app/lib/dpsParse";
import { dpsDateLimits } from "@/app/lib/dpsRange";
import { getDpsScore, type StoredDpsScore } from "@/app/lib/dpsStore";
import { daysInRange, formatYmdShort, isYmd, istanbulTodayYmd, type YmdRange } from "@/app/lib/pickerStatsPeriod";
import { DpsTrendChart, type TrendSeries } from "./DpsTrendChart";

const RANGE_STORAGE_KEY = "getirstok.dps.range";
/** Tarih kutusuna elle yazarken her tuşta Getir'e gidilmesin, ara aralıklar kaydedilmesin */
const FETCH_DEBOUNCE_MS = 800;
const SECTIONS: DpsSectionKey[] = ["bayi", "kurye", "depocu"];
/** Günlük puanlar Getir'den aynı anda en fazla bu kadar gün çekilir (her biri 3–6 sn) */
const DAILY_CONCURRENCY = 3;
const SERIES_COLORS = ["#0d9488", "#f59e0b", "#6366f1", "#ef4444", "#0ea5e9", "#84cc16"];
const BAYI_COLOR = "#7c3aed";

/** Gün → o günün puanları; "empty": Getir o günü hesaplamamış */
type DailyEntry = StoredDpsScore | "empty";

/**
 * Bayi kartında zaten görünen, kurye/depocuya ait olmayan kriterler bu kartlarda gösterilmez.
 * Getir bölüm puanını bunlarla birlikte hesaplıyor; puan ve kayıt değişmez, sadece liste.
 */
const HIDDEN_CRITERIA: Record<DpsSectionKey, ReadonlySet<string>> = {
  bayi: new Set(),
  kurye: new Set(["RED_BASKET"]),
  depocu: new Set(["PROBLEMATIC_ORDER"]),
};

/** Her durum hangi aralığa ait olduğunu taşır; ekrandaki aralıkla eşleşmiyorsa "yükleniyor" */
type LoadState = { key: string } & (
  | { kind: "loading"; fromGetir: boolean }
  | { kind: "ready"; score: StoredDpsScore; source: "cache" | "getir" | null }
  | { kind: "empty" }
  | { kind: "error"; message: string }
);

export function formatDpsNumber(value: number | null, digits = 2): string {
  return value == null
    ? "—"
    : value.toLocaleString("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Puan 0–100: 90+ yeşil, 70–90 sarı, altı kırmızı */
export function dpsPointTone(point: number | null): "green" | "amber" | "red" | "none" {
  if (point == null) return "none";
  if (point >= 90) return "green";
  if (point >= 70) return "amber";
  return "red";
}

const TONE_BAR: Record<ReturnType<typeof dpsPointTone>, string> = {
  green: "bg-emerald-500 dark:bg-emerald-400",
  amber: "bg-amber-400 dark:bg-amber-400",
  red: "bg-red-500 dark:bg-red-400",
  none: "bg-zinc-300 dark:bg-zinc-600",
};

export function GradeBadge({ grade, size = "md" }: { grade: string | null; size?: "sm" | "md" }) {
  const letter = grade?.charAt(0) ?? "";
  const tone =
    letter === "A"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
      : letter === "B"
        ? "bg-lime-100 text-lime-800 dark:bg-lime-900/50 dark:text-lime-300"
        : letter === "C"
          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
          : letter === "D"
            ? "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300"
            : letter
              ? "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300"
              : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400";
  const sizeClass = size === "sm" ? "min-w-[1.75rem] px-1.5 py-0.5 text-xs" : "min-w-[2.5rem] px-2 py-1 text-base";
  return (
    <span className={`inline-flex items-center justify-center rounded-md font-bold tabular-nums ${sizeClass} ${tone}`}>
      {grade ?? "—"}
    </span>
  );
}

function readStoredRange(fallback: YmdRange, limits: { min: string; max: string }): YmdRange {
  if (typeof window === "undefined") return fallback;
  try {
    const v = JSON.parse(window.localStorage.getItem(RANGE_STORAGE_KEY) ?? "null");
    if (isYmd(v?.from) && isYmd(v?.to) && v.from >= limits.min && v.to <= limits.max && v.from <= v.to) {
      return { from: v.from, to: v.to };
    }
  } catch {
    /* bozuk kayıt: varsayılan */
  }
  return fallback;
}

function visibleCriteria(sectionKey: DpsSectionKey, section: DpsSection) {
  return section.criteria.filter((c) => !HIDDEN_CRITERIA[sectionKey].has(c.key));
}

function SectionCard({
  sectionKey,
  section,
  chart,
}: {
  sectionKey: DpsSectionKey;
  section: DpsSection;
  chart?: ReactNode;
}) {
  const title = DPS_SECTION_LABELS[sectionKey];
  const auditSum = section.audits.reduce((s, a) => s + (a.point ?? 0), 0);
  const criteria = visibleCriteria(sectionKey, section);
  return (
    <section className="flex flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <div>
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{title}</h3>
          <p className="text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            {formatDpsNumber(section.point)}
          </p>
          {auditSum > 0 && (
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Kriterler {formatDpsNumber(section.performancePoint)} + Denetim {formatDpsNumber(auditSum)}
            </p>
          )}
        </div>
        <GradeBadge grade={section.letterGrade} />
      </header>

      <ul className="flex flex-1 flex-col gap-2.5 px-4 py-3">
        {criteria.map((c) => (
          <li key={c.key}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-zinc-700 dark:text-zinc-300">{c.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {formatDpsNumber(c.point)}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" aria-hidden>
              <div
                className={`h-full rounded-full ${TONE_BAR[dpsPointTone(c.point)]}`}
                style={{ width: `${Math.max(0, Math.min(100, c.point ?? 0))}%` }}
              />
            </div>
            <p className="mt-0.5 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
              Ağırlık %{formatDpsNumber(c.weight, c.weight != null && Number.isInteger(c.weight) ? 0 : 2)}
              {c.performance != null && <> · Performans %{formatDpsNumber(c.performance)}</>}
            </p>
          </li>
        ))}
      </ul>

      {section.audits.length > 0 && (
        <footer className="flex flex-col gap-1 border-t border-zinc-100 px-4 py-2.5 text-sm dark:border-zinc-800">
          {section.audits.map((a) => (
            <div key={a.key} className="flex items-baseline justify-between gap-2">
              <span className="text-zinc-600 dark:text-zinc-400">{a.label}</span>
              <span className="tabular-nums text-zinc-900 dark:text-zinc-100">
                {(a.point ?? 0) > 0 ? `+${formatDpsNumber(a.point)}` : formatDpsNumber(a.point)}
                {a.performance ? (
                  <span className="ml-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    (%{formatDpsNumber(a.performance, 0)})
                  </span>
                ) : null}
              </span>
            </div>
          ))}
        </footer>
      )}
      {chart && (
        <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <h4 className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Günlük gidişat</h4>
          {chart}
        </div>
      )}
    </section>
  );
}

export function DpsPanel() {
  const [today, setToday] = useState(() => istanbulTodayYmd());
  const limits = useMemo(() => dpsDateLimits(today), [today]);
  const [range, setRange] = useState<YmdRange>(() =>
    readStoredRange({ from: limits.max, to: limits.max }, limits)
  );
  const [loaded, setLoaded] = useState<LoadState | null>(null);
  const rangeKey = `${range.from}_${range.to}`;
  const state: LoadState =
    loaded && loaded.key === rangeKey ? loaded : { key: rangeKey, kind: "loading", fromGetir: false };

  useEffect(() => {
    const id = window.setInterval(() => setToday(istanbulTodayYmd()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(RANGE_STORAGE_KEY, JSON.stringify(range));
  }, [range]);

  const rangeError =
    range.from > range.to
      ? "Başlangıç tarihi bitişten sonra olamaz."
      : range.to > limits.max
        ? "En son dün seçilebilir; Getir bugünün puanını gün bitince hesaplıyor."
        : range.from < limits.min
          ? "En fazla 5 ay öncesi seçilebilir."
          : null;

  useEffect(() => {
    if (rangeError) return;
    const key = `${range.from}_${range.to}`;
    let cancelled = false;
    let slowHint: number | undefined;
    const timer = window.setTimeout(() => {
      // Kayıtlıysa anında gelir; değilse Getir birkaç saniye hesaplar
      slowHint = window.setTimeout(() => {
        if (!cancelled) setLoaded({ key, kind: "loading", fromGetir: true });
      }, 600);
      getDpsScore(range.from, range.to, { ranked: range.from === range.to })
        .then((result) => {
          if (cancelled) return;
          setLoaded(
            result.empty || !result.score
              ? { key, kind: "empty" }
              : { key, kind: "ready", score: result.score, source: result.source }
          );
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setLoaded({
            key,
            kind: "error",
            message: error instanceof Error ? error.message : "DPS puanları alınamadı.",
          });
        })
        .finally(() => window.clearTimeout(slowHint));
    }, FETCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearTimeout(slowHint);
    };
  }, [range.from, range.to, rangeError]);

  // ── Günlük grafik: aralıktaki her gün ayrı kayıt (yoksa Getir'den çekilip kaydedilir) ──
  const [daily, setDaily] = useState<Map<string, DailyEntry>>(() => new Map());
  const [dailyError, setDailyError] = useState<{ key: string; message: string } | null>(null);
  const dailyRef = useRef(daily);
  useEffect(() => {
    dailyRef.current = daily;
  }, [daily]);
  const chartDays = useMemo(() => (rangeError ? [] : daysInRange(range)), [range, rangeError]);
  const showChart = chartDays.length >= 2;

  useEffect(() => {
    if (!showChart) return;
    const key = `${range.from}_${range.to}`;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setDailyError(null);
      const missing = chartDays.filter((d) => !dailyRef.current.has(d));
      for (let i = 0; i < missing.length && !cancelled; i += DAILY_CONCURRENCY) {
        try {
          const results = await Promise.all(
            missing.slice(i, i + DAILY_CONCURRENCY).map(async (d) => {
              const r = await getDpsScore(d, d);
              return [d, r.empty || !r.score ? "empty" : r.score] as const;
            })
          );
          setDaily((prev) => {
            const next = new Map(prev);
            for (const [d, entry] of results) next.set(d, entry);
            return next;
          });
        } catch (error) {
          if (!cancelled) {
            setDailyError({ key, message: error instanceof Error ? error.message : "Günlük puanlar alınamadı." });
          }
          return;
        }
      }
    }, FETCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [range.from, range.to, chartDays, showChart]);

  const dailyLoaded = chartDays.filter((d) => daily.has(d)).length;
  const dailyReady = showChart && dailyLoaded === chartDays.length;
  const dailyErrorMessage = dailyError?.key === `${range.from}_${range.to}` ? dailyError.message : null;

  const rangeScore = state.kind === "ready" ? state.score : null;
  const chartSeries = ((): Record<DpsSectionKey, TrendSeries[]> | null => {
    if (!dailyReady) return null;
    const entries = chartDays.map((d) => {
      const e = daily.get(d);
      return e && e !== "empty" ? e : null;
    });
    if (!entries.some((e) => e != null)) return null;
    /** Kriter listesi: kartın sırası + bazı günlerde olup kartta olmayanlar (günden güne değişebiliyor) */
    const criteriaSeries = (key: DpsSectionKey): TrendSeries[] => {
      const labels = new Map<string, string>();
      for (const s of [rangeScore, ...entries]) {
        if (!s) continue;
        for (const c of visibleCriteria(key, s[key])) if (!labels.has(c.key)) labels.set(c.key, c.label);
      }
      return [...labels].map(([criterionKey, label], i) => ({
        key: criterionKey,
        label,
        color: SERIES_COLORS[i % SERIES_COLORS.length],
        values: entries.map((e) => e?.[key].criteria.find((x) => x.key === criterionKey)?.point ?? null),
      }));
    };
    return {
      bayi: [
        { key: "point", label: "Bayi DPS", color: BAYI_COLOR, values: entries.map((e) => e?.bayi.point ?? null) },
      ],
      kurye: criteriaSeries("kurye"),
      depocu: criteriaSeries("depocu"),
    };
  })();

  const year = today.slice(0, 4);
  const dayCount = rangeError ? 0 : daysInRange(range).length;

  const chartFor = (key: DpsSectionKey): ReactNode => {
    if (!showChart) return null;
    if (dailyErrorMessage) {
      return <p className="text-xs text-red-600 dark:text-red-400">Günlük puanlar alınamadı: {dailyErrorMessage}</p>;
    }
    if (!dailyReady) {
      return (
        <p className="flex items-center gap-1.5 py-6 text-xs text-zinc-500 dark:text-zinc-400">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Günlük puanlar yükleniyor ({dailyLoaded}/{chartDays.length})…
        </p>
      );
    }
    if (!chartSeries) {
      return <p className="text-xs text-zinc-500">Bu günler için Getir puan hesaplamamış.</p>;
    }
    return (
      <DpsTrendChart
        days={chartDays}
        series={chartSeries[key]}
        year={year}
        storageKey={`getirstok.dps.chartHidden.${key}`}
      />
    );
  };
  const rangeText =
    range.from === range.to
      ? formatYmdShort(range.from, year)
      : `${formatYmdShort(range.from, year)} – ${formatYmdShort(range.to, year)}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
            Başlangıç
            <input
              type="date"
              value={range.from}
              min={limits.min}
              max={limits.max}
              onChange={(e) => isYmd(e.target.value) && setRange((r) => ({ ...r, from: e.target.value }))}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </label>
          <label className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
            Bitiş
            <input
              type="date"
              value={range.to}
              min={limits.min}
              max={limits.max}
              onChange={(e) => isYmd(e.target.value) && setRange((r) => ({ ...r, to: e.target.value }))}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </label>
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5" aria-hidden />
            {rangeText}
            {dayCount > 0 && ` · ${dayCount} gün`}
          </span>
          {state.kind === "ready" && (
            <span>
              {state.source === "getir"
                ? "Getir'den yeni çekildi ve kaydedildi"
                : `Kayıtlı veri · çekilme: ${new Date(state.score.fetchedAt).toLocaleString("tr-TR", {
                    timeZone: "Europe/Istanbul",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`}
            </span>
          )}
        </p>
      </div>

      {rangeError ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{rangeError}</span>
        </div>
      ) : state.kind === "loading" ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500 dark:text-zinc-400">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {state.fromGetir ? "Getir'den hesaplanıyor (birkaç saniye sürebilir)…" : "Yükleniyor…"}
        </div>
      ) : state.kind === "error" ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{state.message}</span>
        </div>
      ) : state.kind === "empty" ? (
        <p className="rounded-lg border border-dashed border-zinc-300 px-3 py-6 text-center text-sm text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
          Getir bu tarihlerin DPS puanını henüz hesaplamamış. Biraz sonra tekrar bakın.
        </p>
      ) : (
        <>
          {state.score.rank != null && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800/60">
              <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100">
                <Trophy className="size-4 text-amber-500" aria-hidden />
                {state.score.rank}. sıra
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {state.score.neighbors
                  .filter((n) => !n.isUs)
                  .map((n) => `${n.rank}. ${n.name} (${formatDpsNumber(n.point)})`)
                  .join(" · ")}
              </span>
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-3">
            {SECTIONS.map((key) => (
              <SectionCard key={key} sectionKey={key} section={state.score[key]} chart={chartFor(key)} />
            ))}
          </div>
          <p className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            <Gauge className="size-3.5" aria-hidden />
            Bölüm puanı = kriter puanlarının ağırlıklı toplamı + denetim puanları
          </p>
        </>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatYmdShort } from "@/app/lib/pickerStatsPeriod";

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
  /** Günlerle aynı sırada; o gün değer yoksa null (çizgi orada kesilir) */
  values: (number | null)[];
}

interface DpsTrendChartProps {
  days: string[];
  series: TrendSeries[];
  year: string;
  /** Gizlenen metrikler bu anahtarla tarayıcıda hatırlanır */
  storageKey?: string;
}

function readHidden(storageKey: string | undefined): Set<string> {
  if (!storageKey || typeof window === "undefined") return new Set();
  try {
    const v = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

const HEIGHT = 180;
const PAD = { top: 10, right: 10, bottom: 22, left: 34 };
const MAX_X_LABELS = 6;

function formatValue(v: number | null): string {
  return v == null ? "—" : v.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Değişim net görünsün diye ölçek verinin aralığına göre; 0–100 dışına taşmaz, en az 4 puan aralık */
function yDomain(series: TrendSeries[]): [number, number] {
  const values = series.flatMap((s) => s.values).filter((v): v is number => v != null);
  if (values.length === 0) return [0, 100];
  let min = Math.min(...values);
  let max = Math.max(...values);
  const span = Math.max(max - min, 4);
  min = Math.max(0, min - span * 0.15);
  max = Math.min(100, max + span * 0.15);
  if (max - min < 4) max = Math.min(100, min + 4);
  return [Math.floor(min), Math.ceil(max)];
}

function niceTicks(min: number, max: number): number[] {
  const span = max - min;
  const step = span <= 8 ? 2 : span <= 20 ? 5 : span <= 50 ? 10 : 20;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(v);
  return ticks;
}

export function DpsTrendChart({ days, series: allSeries, year, storageKey }: DpsTrendChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => readHidden(storageKey));
  const series = useMemo(() => allSeries.filter((s) => !hidden.has(s.key)), [allSeries, hidden]);

  const toggleSeries = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (storageKey) window.localStorage.setItem(storageKey, JSON.stringify([...next]));
      return next;
    });
  const showAll = () => {
    setHidden(new Set());
    if (storageKey) window.localStorage.removeItem(storageKey);
  };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const [yMin, yMax] = useMemo(() => yDomain(series), [series]);
  const ticks = useMemo(() => niceTicks(yMin, yMax), [yMin, yMax]);
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (days.length <= 1 ? innerW / 2 : (i / (days.length - 1)) * innerW);
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * innerH;

  /** Değer olmayan günde çizgi kesilir */
  const paths = series.map((s) => {
    let d = "";
    let pen = false;
    s.values.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  });

  const labelEvery = Math.max(1, Math.ceil(days.length / MAX_X_LABELS));
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (days.length <= 1) return setHover(0);
    const i = Math.round(((px - PAD.left) / (innerW || 1)) * (days.length - 1));
    setHover(Math.max(0, Math.min(days.length - 1, i)));
  };

  const hoverLeft = hover == null ? 0 : x(hover);
  const tooltipOnLeft = hover != null && hoverLeft > width / 2;

  return (
    <div className="flex flex-col gap-2">
      <div ref={wrapRef} className="relative w-full" style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            className="touch-none select-none overflow-visible"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
            role="img"
            aria-label={`${series.map((s) => s.label).join(", ")} günlük grafiği`}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(t)}
                  y2={y(t)}
                  className="stroke-zinc-100 dark:stroke-zinc-800"
                />
                <text
                  x={PAD.left - 6}
                  y={y(t)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-zinc-400 text-[10px] tabular-nums"
                >
                  {t}
                </text>
              </g>
            ))}
            {days.map((d, i) =>
              i % labelEvery === 0 || i === days.length - 1 ? (
                <text
                  key={d}
                  x={x(i)}
                  y={HEIGHT - 6}
                  textAnchor={i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"}
                  className="fill-zinc-400 text-[10px]"
                >
                  {formatYmdShort(d, year)}
                </text>
              ) : null
            )}
            {hover != null && (
              <line
                x1={hoverLeft}
                x2={hoverLeft}
                y1={PAD.top}
                y2={PAD.top + innerH}
                className="stroke-zinc-300 dark:stroke-zinc-600"
                strokeDasharray="3 3"
              />
            )}
            {series.map((s, si) => (
              <g key={s.key}>
                <path d={paths[si]} fill="none" stroke={s.color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
                {s.values.map((v, i) =>
                  v != null && (days.length <= 20 || hover === i) ? (
                    <circle
                      key={i}
                      cx={x(i)}
                      cy={y(v)}
                      r={hover === i ? 4 : 2.5}
                      fill={hover === i ? s.color : "white"}
                      stroke={s.color}
                      strokeWidth={1.75}
                    />
                  ) : null
                )}
              </g>
            ))}
          </svg>
        )}
        {series.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400">
            Tüm metrikler gizli; aşağıdan birini seç.
          </p>
        )}
        {hover != null && series.length > 0 && (
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-[9rem] whitespace-nowrap rounded-lg border border-zinc-200 bg-white/95 px-2.5 py-1.5 text-xs shadow-md dark:border-zinc-700 dark:bg-zinc-900/95"
            style={tooltipOnLeft ? { right: width - hoverLeft + 8 } : { left: hoverLeft + 8 }}
          >
            <p className="mb-0.5 font-semibold text-zinc-700 dark:text-zinc-200">{formatYmdShort(days[hover], year)}</p>
            {series.map((s) => (
              <p key={s.key} className="flex items-center justify-between gap-3 tabular-nums">
                <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                  <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
                  {s.label}
                </span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">{formatValue(s.values[hover])}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      {allSeries.length > 1 && (
        <ul className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[11px]">
          {allSeries.map((s) => {
            const off = hidden.has(s.key);
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => toggleSeries(s.key)}
                  aria-pressed={!off}
                  title={off ? `${s.label} göster` : `${s.label} gizle`}
                  className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                    off ? "text-zinc-400 line-through dark:text-zinc-500" : "text-zinc-600 dark:text-zinc-300"
                  }`}
                >
                  <span
                    className="h-0.5 w-3 rounded-full"
                    style={{ backgroundColor: off ? "#d4d4d8" : s.color }}
                    aria-hidden
                  />
                  {s.label}
                </button>
              </li>
            );
          })}
          {hidden.size > 0 && (
            <li>
              <button
                type="button"
                onClick={showAll}
                className="rounded-md px-1.5 py-0.5 font-medium text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/40"
              >
                Tümünü göster
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

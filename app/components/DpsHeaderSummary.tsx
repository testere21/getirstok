"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Trophy } from "lucide-react";
import { DPS_SECTION_LABELS, type DpsSectionKey } from "@/app/lib/dpsParse";
import { getDpsScore, type StoredDpsScore } from "@/app/lib/dpsStore";
import { addDaysYmd, formatYmdShort, istanbulTodayYmd } from "@/app/lib/pickerStatsPeriod";
import { GradeBadge, formatDpsNumber } from "./DpsPanel";

/** Getir dünü henüz hesaplamadıysa / hata olduysa sayfa açıkken bu aralıkla tekrar denenir */
const RETRY_MS = 30 * 60 * 1000;
const SECTIONS: DpsSectionKey[] = ["bayi", "kurye", "depocu"];
const SHORT_LABEL: Record<DpsSectionKey, string> = { bayi: "Bayi", kurye: "Kurye", depocu: "Depocu" };

type SummaryState =
  | { day: string; kind: "ready"; score: StoredDpsScore }
  | { day: string; kind: "empty" }
  | { day: string; kind: "error"; message: string };

function yesterdayYmd(): string {
  return addDaysYmd(istanbulTodayYmd(), -1);
}

function RankBadge({ score }: { score: StoredDpsScore }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (score.rank == null) return null;
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Dünün DPS sıralaması — etraftaki depoları görmek için tıklayın"
        className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-sm font-bold tabular-nums text-amber-800 shadow-sm ring-1 ring-amber-200 transition hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800"
      >
        <Trophy className="size-3.5" aria-hidden />
        {score.rank}. sıra
      </button>
      {open && score.neighbors.length > 0 && (
        <div
          role="dialog"
          aria-label="Sıralamada etraftaki depolar"
          className="absolute left-1/2 top-full z-40 mt-1.5 w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border border-zinc-200 bg-white p-2 text-sm shadow-lg sm:left-auto sm:right-0 sm:translate-x-0 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <p className="px-1 pb-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Bayi DPS sıralaması (dün)</p>
          <ol>
            {score.neighbors.map((n) => (
              <li
                key={`${n.rank}-${n.name}`}
                className={`flex items-center justify-between gap-2 rounded px-1.5 py-1 tabular-nums ${
                  n.isUs ? "bg-teal-50 font-semibold text-teal-800 dark:bg-teal-950/40 dark:text-teal-300" : "text-zinc-700 dark:text-zinc-300"
                }`}
              >
                <span className="min-w-0 truncate">
                  {n.rank}. {n.name}
                </span>
                <span>{formatDpsNumber(n.point)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/** Ana ekran başlığının karşısında: dünün Bayi / Kurye / Depocu DPS puanı + sıra */
export function DpsHeaderSummary() {
  const [day, setDay] = useState(yesterdayYmd);
  const [state, setState] = useState<SummaryState | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  // Gece yarısı geçince "dün" kayar
  useEffect(() => {
    const id = window.setInterval(() => setDay(yesterdayYmd()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getDpsScore(day, day, { ranked: true })
      .then((result) => {
        if (cancelled) return;
        setState(
          result.empty || !result.score ? { day, kind: "empty" } : { day, kind: "ready", score: result.score }
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ day, kind: "error", message: error instanceof Error ? error.message : "DPS alınamadı." });
      });
    return () => {
      cancelled = true;
    };
  }, [day, retryTick]);

  const current = state?.day === day ? state : null;
  const needsRetry = current?.kind === "empty" || current?.kind === "error";
  useEffect(() => {
    if (!needsRetry) return;
    const id = window.setTimeout(() => setRetryTick((t) => t + 1), RETRY_MS);
    return () => window.clearTimeout(id);
  }, [needsRetry, retryTick]);

  const dayLabel = `Dün · ${formatYmdShort(day)}`;

  if (!current) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500" aria-live="polite">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Dünün DPS puanı yükleniyor…
      </div>
    );
  }

  if (current.kind !== "ready") {
    return (
      <p
        className="text-xs text-zinc-500 dark:text-zinc-400"
        title={current.kind === "error" ? current.message : undefined}
      >
        {dayLabel} ·{" "}
        {current.kind === "empty" ? "DPS henüz hesaplanmadı" : "DPS alınamadı (bayi panelini bir kez açın)"}
      </p>
    );
  }

  const { score } = current;
  return (
    // Mobilde: üstte gün + sıra, altta üç puan eşit sütunlarda; geniş ekranda hepsi tek satır
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2" aria-label={`${dayLabel} DPS puanları`}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 sm:pr-1 dark:text-zinc-400">
        {dayLabel}
      </span>
      <div className="order-last grid w-full grid-cols-3 gap-1.5 sm:order-none sm:contents">
        {SECTIONS.map((key) => (
          <span
            key={key}
            className="flex min-w-0 flex-col items-start gap-0.5 rounded-lg bg-white/90 px-2 py-1.5 text-sm shadow-sm ring-1 ring-zinc-200/80 sm:inline-flex sm:flex-row sm:items-center sm:gap-1.5 sm:py-1 dark:bg-zinc-900/80 dark:ring-zinc-700"
            title={`${DPS_SECTION_LABELS[key]}: ${formatDpsNumber(score[key].point)}`}
          >
            <span className="text-[11px] text-zinc-500 sm:text-xs dark:text-zinc-400">{SHORT_LABEL[key]}</span>
            <span className="inline-flex items-center gap-1">
              <span className="font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                {formatDpsNumber(score[key].point, 1)}
              </span>
              <GradeBadge grade={score[key].letterGrade} size="sm" />
            </span>
          </span>
        ))}
      </div>
      <div className="ml-auto sm:ml-0">
        <RankBadge score={score} />
      </div>
    </div>
  );
}

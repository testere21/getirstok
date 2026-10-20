"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, X } from "lucide-react";
import type { PickerStatRow } from "@/app/lib/pickerStatsMerge";

/** Hedef süre üstü (yeşil) sipariş başına kazanç, hedef süre altı (kırmızı) başına kayıp (TL) */
const PRIM_PER_ORDER = 2;

interface PickerPrimReportModalProps {
  /** Seçili deponun, seçili aralıktaki aktif toplayıcıları */
  rows: PickerStatRow[];
  /** "Soğukkuyu · 12 Eki – 18 Eki" (sadece seçim adımında görünür; rapor tablosu resimdeki gibi sade) */
  title: string;
  onClose: () => void;
}

function formatTl(n: number): string {
  return n.toLocaleString("tr-TR");
}

/** Ekran kenarından bırakılan boşluk (px, iki yan toplamı) */
const FIT_MARGIN = 24;

/**
 * İçeriği kendi doğal boyutunda çizip ekrana sığmıyorsa orantılı küçültür (telefonda
 * tablonun tamamı tek ekran görüntüsüne girsin, görünüm aynı kalsın).
 */
function FitToWidth({ children }: { children: React.ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ scale: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const measure = () => {
      const width = inner.offsetWidth;
      const height = inner.offsetHeight;
      const scale = Math.min(1, (window.innerWidth - FIT_MARGIN) / width);
      setFit((prev) =>
        prev && prev.scale === scale && prev.width === width && prev.height === height
          ? prev
          : { scale, width, height }
      );
    };
    // İlk ölçüm de gözlemciden gelir (efekt içinde doğrudan state yazılmasın)
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div
      className="shrink-0"
      style={fit ? { width: fit.width * fit.scale, height: fit.height * fit.scale } : { visibility: "hidden" }}
    >
      <div
        ref={innerRef}
        className="w-max"
        style={{ transform: `scale(${fit?.scale ?? 1})`, transformOrigin: "top left" }}
      >
        {children}
      </div>
    </div>
  );
}

export function PickerPrimReportModal({ rows, title, onClose }: PickerPrimReportModalProps) {
  const [step, setStep] = useState<"select" | "report">("select");
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const candidates = useMemo(
    () => [...rows].sort((a, b) => a.name.localeCompare(b.name, "tr")),
    [rows]
  );
  const reportRows = useMemo(
    () =>
      candidates
        .filter((r) => !excluded.has(r.key))
        .map((r) => {
          const belowFee = r.red * PRIM_PER_ORDER;
          const aboveFee = r.green * PRIM_PER_ORDER;
          return { ...r, belowFee, aboveFee, prim: aboveFee - belowFee };
        })
        .sort((a, b) => b.prim - a.prim || a.name.localeCompare(b.name, "tr")),
    [candidates, excluded]
  );

  const toggle = (key: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (step === "report") {
    return (
      <div
        className="fixed inset-0 z-[80] overflow-auto bg-zinc-200"
        role="dialog"
        aria-modal="true"
        aria-label="Prim raporu"
      >
        <div className="flex min-h-full flex-col items-center gap-3 px-3 py-3 sm:justify-center sm:p-6">
          <div className="flex gap-2 self-end sm:absolute sm:right-4 sm:top-4">
            <button
              type="button"
              onClick={() => setStep("select")}
              className="min-h-[36px] rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
            >
              Kişileri düzenle
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-zinc-800 px-3 text-sm font-medium text-white shadow-sm hover:bg-zinc-700"
            >
              <X className="size-4" aria-hidden />
              Kapat
            </button>
          </div>
          <FitToWidth>
            {/* Ekran görüntüsü alınacak alan: haftalık prim tablosunun aynısı */}
            <table
              className="border-collapse bg-white text-black"
              style={{ fontFamily: "Calibri, Carlito, Arial, sans-serif" }}
            >
              <thead>
                <tr>
                  {[
                    "AD SOYAD",
                    "TOPLAM SİPARİŞ",
                    "HEDEF SÜRE ALTI SİPARİŞ SAYISI",
                    "HEDEF SÜRE ÜSTÜ SİPARİŞ SAYISI",
                    "HEDEF SÜRE ALTI ÜCRET",
                    "HEDEF SÜRE ÜSTÜ ÜCRET",
                    "TOPLAM PRİM KAZANÇ",
                  ].map((label, i) => (
                    <th
                      key={label}
                      scope="col"
                      className={`border border-black px-3 py-2 text-center align-middle text-[22px] font-bold leading-tight text-white ${
                        i === 0 ? "min-w-[22rem]" : "w-[8.5rem]"
                      }`}
                      style={{ backgroundColor: "#7030A0" }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reportRows.map((r) => (
                  <tr key={r.key} className="text-[22px] font-bold leading-snug">
                    <td className="whitespace-nowrap border border-black px-2 py-0.5 text-left">
                      {r.name.toLocaleUpperCase("tr-TR")}
                    </td>
                    <td className="border border-black px-2 py-0.5 text-center tabular-nums">{formatTl(r.total)}</td>
                    <td
                      className="border border-black px-2 py-0.5 text-center tabular-nums text-white"
                      style={{ backgroundColor: "#FF0000" }}
                    >
                      {formatTl(r.red)}
                    </td>
                    <td
                      className="border border-black px-2 py-0.5 text-center tabular-nums"
                      style={{ backgroundColor: "#92D050" }}
                    >
                      {formatTl(r.green)}
                    </td>
                    <td className="border border-black px-2 py-0.5 text-center tabular-nums">{formatTl(r.belowFee)}</td>
                    <td className="border border-black px-2 py-0.5 text-center tabular-nums">{formatTl(r.aboveFee)}</td>
                    <td className="border border-black px-2 py-0.5 text-center tabular-nums">{formatTl(r.prim)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </FitToWidth>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prim-report-title"
    >
      <button type="button" onClick={onClose} className="absolute inset-0 bg-black/50" aria-label="Kapat" />
      <div className="relative flex max-h-[85vh] w-full max-w-md flex-col rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <div>
            <h3 id="prim-report-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Prim raporu
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
            aria-label="Kapat"
          >
            <X className="size-5" />
          </button>
        </div>
        <p className="px-4 pt-3 text-sm text-zinc-600 dark:text-zinc-300">
          Raporda görünmeyecek kişilerin işaretini kaldır.
        </p>
        <ul className="flex-1 divide-y divide-zinc-100 overflow-y-auto px-4 py-1 dark:divide-zinc-800">
          {candidates.map((r) => (
            <li key={r.key}>
              <label className="flex cursor-pointer items-center gap-3 py-2.5">
                <input
                  type="checkbox"
                  checked={!excluded.has(r.key)}
                  onChange={() => toggle(r.key)}
                  className="size-4 rounded border-zinc-300 accent-teal-600"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {r.name}
                </span>
                <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{r.total} sipariş</span>
              </label>
            </li>
          ))}
          {candidates.length === 0 && (
            <li className="py-6 text-center text-sm text-zinc-500">Bu dönemde siparişi olan toplayıcı yok.</li>
          )}
        </ul>
        <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={reportRows.length === 0}
            onClick={() => setStep("report")}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-teal-600 px-3 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-500 dark:text-zinc-900"
          >
            <FileText className="size-4" aria-hidden />
            Raporu oluştur ({reportRows.length})
          </button>
        </div>
      </div>
    </div>
  );
}

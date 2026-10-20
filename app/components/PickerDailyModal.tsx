"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { formatYmdShort } from "@/app/lib/pickerStatsPeriod";

export interface PickerDailyRow {
  ymd: string;
  total: number;
  green: number;
  red: number;
  /** null: o günün SKU'su henüz yüklenmedi / çekilmedi */
  sku: number | null;
  /** O gün için henüz DPS raporu okunmamış (sipariş sayıları bilinmiyor) */
  noReport: boolean;
}

interface PickerDailyModalProps {
  name: string;
  subtitle: string;
  year: string;
  rows: PickerDailyRow[];
  /** SKU yükleniyorsa boş hücrelerde "…" gösterilir */
  skuLoading: boolean;
  onClose: () => void;
}

const WEEKDAYS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

function weekday(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function percent(green: number, total: number): string {
  return total > 0 ? `%${Math.round((green / total) * 100)}` : "—";
}

export function PickerDailyModal({ name, subtitle, year, rows, skuLoading, onClose }: PickerDailyModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const totals = rows.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      green: acc.green + r.green,
      red: acc.red + r.red,
      sku: r.sku == null || acc.sku == null ? null : acc.sku + r.sku,
    }),
    { total: 0, green: 0, red: 0, sku: 0 as number | null }
  );
  const skuText = (sku: number | null) => (sku != null ? String(sku) : skuLoading ? "…" : "—");

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="picker-daily-title"
    >
      <button type="button" onClick={onClose} className="absolute inset-0 bg-black/50" aria-label="Kapat" />
      <div className="relative flex max-h-[85vh] w-full max-w-xl flex-col rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <div>
            <h3 id="picker-daily-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {name}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
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
        <div className="overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Gün</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Sipariş</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">SKU</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Yeşil</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Kırmızı</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Yeşil %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((r) => {
                const idle = r.total === 0;
                return (
                  <tr key={r.ymd} className={idle ? "text-zinc-400 dark:text-zinc-500" : ""}>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className={idle ? "" : "font-medium text-zinc-900 dark:text-zinc-100"}>
                        {formatYmdShort(r.ymd, year)}
                      </span>
                      <span className="ml-1.5 text-xs text-zinc-400">{weekday(r.ymd)}</span>
                      {r.noReport && <span className="ml-1.5 text-[11px] text-amber-600">rapor yok</span>}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${idle ? "" : "font-semibold text-zinc-900 dark:text-zinc-100"}`}>
                      {r.noReport ? "—" : r.total}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{skuText(r.sku)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${idle ? "" : "text-emerald-700 dark:text-emerald-400"}`}>
                      {r.noReport ? "—" : r.green}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${idle ? "" : "text-red-700 dark:text-red-400"}`}>
                      {r.noReport ? "—" : r.red}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.noReport ? "—" : percent(r.green, r.total)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 border-t border-zinc-200 bg-zinc-50 font-semibold text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">
              <tr>
                <td className="px-3 py-2">Toplam</td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.total}</td>
                <td className="px-3 py-2 text-right tabular-nums">{skuText(totals.sku)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{totals.green}</td>
                <td className="px-3 py-2 text-right tabular-nums text-red-700 dark:text-red-400">{totals.red}</td>
                <td className="px-3 py-2 text-right tabular-nums">{percent(totals.green, totals.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

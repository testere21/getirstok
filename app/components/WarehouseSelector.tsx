"use client";

import { FRANCHISE_WAREHOUSES } from "@/app/lib/franchiseWarehouses";

interface WarehouseSelectorProps {
  value: string;
  onChange: (warehouseId: string) => void;
  /** Mobilde tam genişlik, seçenekler eşit paylaşır (geniş ekranda içeriği kadar) */
  stretch?: boolean;
}

/** Ana ekran depo seçici (Soğukkuyu / Bostanlı) */
export function WarehouseSelector({ value, onChange, stretch = false }: WarehouseSelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Depo"
      className={`rounded-xl bg-white/80 p-1 shadow-sm ring-1 ring-violet-200 dark:bg-zinc-900/70 dark:ring-violet-800 ${
        stretch ? "flex w-full sm:inline-flex sm:w-auto sm:self-start lg:self-auto" : "inline-flex"
      }`}
    >
      {FRANCHISE_WAREHOUSES.map((w) => {
        const selected = value === w.id;
        return (
          <button
            key={w.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => {
              if (!selected) onChange(w.id);
            }}
            className={`min-h-10 rounded-lg px-3 text-sm font-semibold transition motion-reduce:transition-none sm:min-h-9 sm:px-5 ${
              stretch ? "flex-1 sm:flex-none" : ""
            } ${
              selected
                ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm"
                : "text-zinc-600 hover:bg-violet-50 hover:text-violet-700 dark:text-zinc-300 dark:hover:bg-violet-950/40 dark:hover:text-violet-300"
            }`}
          >
            {w.name}
          </button>
        );
      })}
    </div>
  );
}

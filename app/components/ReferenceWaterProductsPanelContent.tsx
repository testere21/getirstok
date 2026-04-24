"use client";

import { useMemo } from "react";
import { BarcodeImage } from "./BarcodeImage";
import {
  resolveReferenceWaterProducts,
  type ReferenceWaterCatalogProduct,
} from "@/app/lib/referenceWaterProducts";

type Props = {
  catalogProducts: readonly ReferenceWaterCatalogProduct[];
};

/** Kart varyantları — Tailwind JIT için tam sınıf adları */
const CARD_VARIANTS = [
  {
    article:
      "border-sky-200/90 bg-gradient-to-br from-sky-50 via-white to-cyan-50 ring-sky-300/35 dark:border-sky-500/40 dark:from-sky-950/55 dark:via-slate-900/95 dark:to-cyan-950/45 dark:ring-sky-400/25",
    barcodeWrap:
      "border-sky-200/60 bg-gradient-to-b from-sky-100/90 to-cyan-50/70 dark:border-sky-600/40 dark:from-sky-950/60 dark:to-cyan-950/35",
    title: "text-sky-950 dark:text-sky-100",
    subtitle: "text-sky-700/85 dark:text-sky-300/90",
  },
  {
    article:
      "border-cyan-200/90 bg-gradient-to-br from-cyan-50 via-white to-teal-50 ring-cyan-300/35 dark:border-cyan-500/40 dark:from-cyan-950/50 dark:via-slate-900/95 dark:to-teal-950/40 dark:ring-cyan-400/25",
    barcodeWrap:
      "border-cyan-200/60 bg-gradient-to-b from-cyan-100/85 to-teal-50/65 dark:border-cyan-600/40 dark:from-cyan-950/55 dark:to-teal-950/35",
    title: "text-cyan-950 dark:text-cyan-100",
    subtitle: "text-cyan-800/85 dark:text-cyan-300/90",
  },
  {
    article:
      "border-teal-200/90 bg-gradient-to-br from-teal-50 via-white to-emerald-50 ring-teal-300/35 dark:border-teal-500/35 dark:from-teal-950/50 dark:via-slate-900/95 dark:to-emerald-950/35 dark:ring-teal-400/22",
    barcodeWrap:
      "border-teal-200/60 bg-gradient-to-b from-teal-100/80 to-emerald-50/60 dark:border-teal-600/35 dark:from-teal-950/55 dark:to-emerald-950/30",
    title: "text-teal-950 dark:text-teal-100",
    subtitle: "text-teal-800/85 dark:text-teal-300/90",
  },
  {
    article:
      "border-indigo-200/85 bg-gradient-to-br from-indigo-50 via-white to-sky-50 ring-indigo-200/40 dark:border-indigo-500/35 dark:from-indigo-950/45 dark:via-slate-900/95 dark:to-sky-950/40 dark:ring-indigo-400/22",
    barcodeWrap:
      "border-indigo-200/55 bg-gradient-to-b from-indigo-100/75 to-sky-50/65 dark:border-indigo-600/35 dark:from-indigo-950/50 dark:to-sky-950/35",
    title: "text-indigo-950 dark:text-indigo-100",
    subtitle: "text-indigo-800/85 dark:text-indigo-300/90",
  },
] as const;

/** Referans ürün paneli — renkli iki sütunlu kartlar + barkod */
export function ReferenceWaterProductsPanelContent({ catalogProducts }: Props) {
  const rows = useMemo(
    () => resolveReferenceWaterProducts(catalogProducts),
    [catalogProducts]
  );

  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-6">
      {rows.map((row, index) => {
        const v = CARD_VARIANTS[index % CARD_VARIANTS.length];
        return (
          <li key={row.barcode}>
            <article
              className={`flex h-full flex-col gap-2.5 rounded-2xl border p-3.5 shadow-md shadow-sky-900/8 ring-1 transition-[box-shadow,transform] motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-lg motion-safe:hover:shadow-sky-600/15 dark:shadow-black/25 dark:motion-safe:hover:shadow-cyan-500/10 ${v.article}`}
            >
              <div className="min-w-0">
                <p
                  className={`text-[13px] font-semibold leading-snug tracking-tight ${v.title}`}
                >
                  {row.shortLabel}
                </p>
                {row.catalogFullName != null &&
                  row.catalogFullName !== row.shortLabel && (
                    <p
                      className={`mt-1 line-clamp-2 text-[11px] leading-relaxed ${v.subtitle}`}
                    >
                      {row.catalogFullName}
                    </p>
                  )}
              </div>
              <div
                className={`mt-auto max-w-full overflow-x-auto rounded-xl border p-2.5 ${v.barcodeWrap}`}
              >
                <BarcodeImage barcode={row.barcode} height={58} width={1.8} />
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}

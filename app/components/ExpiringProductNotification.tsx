"use client";

import { useEffect } from "react";
import Image from "next/image";
import { AlertTriangle, Barcode, BellRing, Calendar, Package, X } from "lucide-react";
import type { ExpiringProductWithId } from "@/app/lib/types";

interface CatalogProduct {
  name: string;
  barcode: string;
  barcodes?: string[];
  imageUrl?: string;
  productId?: string;
}

interface ExpiringProductNotificationProps {
  products: ExpiringProductWithId[];
  onClose: () => void;
  catalogProducts?: CatalogProduct[];
}

/** "2026-12-03" → "3 Ara 2026"; tanınmayan biçim olduğu gibi gösterilir */
function formatDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return value;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

function normalizeImageUrl(url?: string): string | undefined {
  if (!url) return undefined;
  return url.startsWith("http://") ? url.replace("http://", "https://") : url;
}

/** Bugün çıkılması gereken ürünlerin penceresi: mobilde alttan açılan sayfa, geniş ekranda ortada pencere */
export function ExpiringProductNotification({
  products,
  onClose,
  catalogProducts = [],
}: ExpiringProductNotificationProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (products.length === 0) return null;

  const getProductImage = (barcode: string): string | undefined => {
    const b = barcode.trim();
    const found = catalogProducts.find(
      (p) => p.barcode === b || (p.barcodes ?? []).some((x) => x.trim() === b)
    );
    return normalizeImageUrl(found?.imageUrl);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-zinc-950/55 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="expiring-notification-title"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl motion-safe:animate-[expiring-sheet-up_0.3s_ease-out] sm:max-w-lg sm:rounded-3xl sm:motion-safe:animate-[expiring-dialog-pop_0.25s_ease-out] dark:bg-zinc-900"
      >
        {/* Üst bölüm */}
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-orange-500 via-orange-600 to-red-600 px-5 pb-4 pt-3 text-white sm:pt-4">
          <div
            className="pointer-events-none absolute -right-10 -top-14 size-40 rounded-full bg-white/15 blur-2xl"
            aria-hidden
          />
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/40 sm:hidden" aria-hidden />
          <div className="relative flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30">
              <BellRing className="skt-alert-bell size-6" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h3 id="expiring-notification-title" className="text-lg font-bold leading-tight">
                Bugün çıkılacak ürünler
              </h3>
              <p className="mt-0.5 text-sm font-medium text-white/90">
                {products.length === 1 ? "Raftan çıkarılması gereken 1 ürün" : `Raftan çıkarılması gereken ${products.length} ürün`}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25 active:scale-95"
              aria-label="Pencereyi kapat"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
        </div>

        {/* Ürün listesi */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-50 p-4 dark:bg-zinc-950/50">
          <ul className="space-y-3">
            {products.map((product) => {
              const image = getProductImage(product.barcode);
              return (
                <li
                  key={product.id}
                  className="rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-sm dark:border-zinc-700 dark:bg-zinc-800/60"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-600">
                      {image ? (
                        <Image
                          src={image}
                          alt={product.productName}
                          fill
                          className="object-contain p-1"
                          sizes="64px"
                        />
                      ) : (
                        <span className="flex size-full items-center justify-center bg-zinc-100 text-zinc-400 dark:bg-zinc-700/50">
                          <Package className="size-7" aria-hidden />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 break-words text-[15px] font-bold leading-snug text-zinc-900 dark:text-zinc-50">
                        {product.productName}
                      </p>
                      <p className="mt-1 inline-flex items-center gap-1.5 font-mono text-xs tracking-wide text-zinc-500 dark:text-zinc-400">
                        <Barcode className="size-3.5 shrink-0" aria-hidden />
                        <span className="break-all">{product.barcode}</span>
                      </p>
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-700/50">
                      <dt className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        <Calendar className="size-3 shrink-0" aria-hidden />
                        SKT
                      </dt>
                      <dd className="mt-0.5 text-sm font-bold text-zinc-900 dark:text-zinc-50">
                        {formatDate(product.expiryDate)}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-red-50 px-3 py-2 ring-1 ring-red-200 dark:bg-red-950/40 dark:ring-red-800/60">
                      <dt className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
                        <AlertTriangle className="size-3 shrink-0" aria-hidden />
                        Çıkılacak gün
                      </dt>
                      <dd className="mt-0.5 text-sm font-bold text-red-700 dark:text-red-300">
                        {formatDate(product.removalDate)}
                      </dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Alt bölüm */}
        <div className="shrink-0 border-t border-zinc-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-zinc-700 dark:bg-zinc-900">
          <button
            type="button"
            onClick={onClose}
            className="h-12 w-full rounded-xl bg-gradient-to-r from-orange-600 to-red-600 text-base font-bold text-white shadow-md shadow-orange-500/30 transition hover:from-orange-700 hover:to-red-700 active:scale-[0.98]"
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
}

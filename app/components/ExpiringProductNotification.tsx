"use client";

import { X, AlertTriangle, Calendar, Package } from "lucide-react";
import type { ExpiringProductWithId } from "@/app/lib/types";
import Image from "next/image";

interface CatalogProduct {
  name: string;
  barcode: string;
  imageUrl?: string;
  productId?: string;
}

interface ExpiringProductNotificationProps {
  products: ExpiringProductWithId[];
  onClose: () => void;
  catalogProducts?: CatalogProduct[];
}

export function ExpiringProductNotification({
  products,
  onClose,
  catalogProducts = [],
}: ExpiringProductNotificationProps) {
  if (products.length === 0) return null;

  const normalizeImageUrl = (url?: string): string | undefined => {
    if (!url) return undefined;
    if (url.startsWith("http://")) {
      return url.replace("http://", "https://");
    }
    return url;
  };

  // Barkod'a göre ürün resmini bulma helper fonksiyonu
  const getProductImage = (barcode: string): string | undefined => {
    const catalogProduct = catalogProducts.find((p) => p.barcode === barcode);
    return normalizeImageUrl(catalogProduct?.imageUrl);
  };

  return (
    <div className="fixed left-2 right-2 top-2 z-50 sm:left-auto sm:right-4 sm:top-4 sm:w-full sm:max-w-md motion-safe:animate-[expiring-pop_0.35s_ease-out]">
      <div className="rounded-xl border border-orange-300 bg-gradient-to-br from-orange-50 to-orange-100/70 shadow-xl backdrop-blur-sm dark:border-orange-600/80 dark:from-orange-950/70 dark:to-orange-900/60">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-orange-300/60 bg-orange-200/40 px-2.5 py-2 sm:px-4 sm:py-3 dark:border-orange-700/70 dark:bg-orange-900/40 rounded-t-xl">
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1">
            <div className="flex shrink-0 items-center justify-center rounded-full bg-orange-500 p-1 sm:p-2 dark:bg-orange-600">
              <AlertTriangle className="size-3 sm:size-4 text-white" />
            </div>
            <h3 className="text-xs sm:text-base font-bold text-orange-900 dark:text-orange-50 truncate">
              {products.length === 1
                ? "Yaklaşan SKT Uyarısı"
                : `${products.length} Ürün - Yaklaşan SKT Uyarısı`}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-1.5 sm:ml-2 shrink-0 rounded-lg p-1 text-orange-700 transition-all hover:bg-orange-300/50 hover:text-orange-900 active:scale-95 dark:text-orange-300 dark:hover:bg-orange-800/50 dark:hover:text-orange-100"
            aria-label="Bildirimi kapat"
          >
            <X className="size-3.5 sm:size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-64 sm:max-h-80 overflow-y-auto p-2.5 sm:p-4">
          {products.length === 1 ? (
            // Tek ürün için detaylı gösterim
            <div className="space-y-2.5 sm:space-y-3">
              <div className="rounded-lg bg-white/90 p-2.5 sm:p-3 shadow-sm dark:bg-zinc-900/60">
                <div className="flex items-start gap-3 mb-2">
                  {/* Ürün Resmi */}
                  {getProductImage(products[0].barcode) ? (
                    <div className="shrink-0">
                      <div className="relative size-14 sm:size-20 rounded-lg overflow-hidden border border-orange-200 dark:border-orange-700 bg-white">
                        <Image
                          src={getProductImage(products[0].barcode)!}
                          alt={products[0].productName}
                          fill
                          className="object-contain p-1"
                          sizes="(max-width: 640px) 64px, 80px"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="shrink-0 flex items-center justify-center size-16 sm:size-20 rounded-lg border-2 border-orange-200 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20">
                      <Package className="size-6 sm:size-8 text-orange-400 dark:text-orange-500" />
                    </div>
                  )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm sm:text-base font-semibold sm:font-bold text-orange-900 dark:text-orange-50 break-words line-clamp-2">
                      {products[0].productName}
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5 text-[11px] sm:text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-orange-800 dark:text-orange-300 min-w-[80px]">Barkod:</span>
                    <span className="text-orange-700 dark:text-orange-200 font-mono break-all">{products[0].barcode}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="size-3.5 sm:size-4 text-orange-600 dark:text-orange-400 shrink-0" />
                    <span className="font-semibold text-orange-800 dark:text-orange-300 min-w-[80px]">SKT:</span>
                    <span className="text-orange-700 dark:text-orange-200 font-medium">{products[0].expiryDate}</span>
                  </div>
                </div>
              </div>
              
              <div className="rounded-lg bg-gradient-to-r from-red-500 to-red-600 p-2.5 sm:p-3 shadow-md sm:shadow-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] sm:text-sm font-semibold text-white/90 mb-0.5 sm:mb-1">
                      Çıkılması Gereken Tarih
                    </p>
                    <p className="text-sm sm:text-base font-bold text-white tracking-wide">
                      {products[0].removalDate}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1.5 sm:px-3 backdrop-blur-sm">
                    <AlertTriangle className="size-3.5 sm:size-4 text-white" />
                    <span className="text-[11px] sm:text-sm font-bold text-white">Bugün çıkınız!</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Çoklu ürün için liste
            <div className="space-y-2.5 sm:space-y-3">
              <div className="rounded-lg bg-white/90 p-2.5 sm:p-3 shadow-sm dark:bg-zinc-900/60">
                <p className="text-xs sm:text-base font-semibold sm:font-bold text-orange-900 dark:text-orange-50 mb-2 sm:mb-3">
                  Bugün çıkılması gereken {products.length} ürün bulundu:
                </p>
              </div>
              <ul className="space-y-1.5 sm:space-y-2">
                {products.map((product) => (
                  <li
                    key={product.id}
                    className="group rounded-lg border border-orange-200 bg-white/95 p-2.5 sm:p-3 shadow-sm transition-all hover:border-orange-300 hover:shadow-md dark:border-orange-700/60 dark:bg-zinc-900/60 dark:hover:border-orange-600"
                  >
                    <div className="flex items-start gap-2.5 mb-1.5 sm:mb-2">
                      {/* Ürün Resmi */}
                      {getProductImage(product.barcode) ? (
                        <div className="shrink-0">
                          <div className="relative size-10 sm:size-14 rounded-lg overflow-hidden border border-orange-200 dark:border-orange-700 bg-white">
                            <Image
                              src={getProductImage(product.barcode)!}
                              alt={product.productName}
                              fill
                              className="object-contain p-0.5"
                              sizes="(max-width: 640px) 48px, 56px"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="shrink-0 flex items-center justify-center size-10 sm:size-14 rounded-lg border border-orange-200 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20">
                          <Package className="size-4 sm:size-6 text-orange-400 dark:text-orange-500" />
                        </div>
                      )}
                      <p className="text-xs sm:text-sm font-semibold sm:font-bold text-orange-900 dark:text-orange-50 break-words flex-1 line-clamp-2">
                        {product.productName}
                      </p>
                    </div>
                    <div className="space-y-1 text-[10px] sm:text-xs text-orange-700 dark:text-orange-300">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold min-w-[60px]">Barkod:</span>
                        <span className="font-mono break-all">{product.barcode}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="size-3 shrink-0" />
                        <span className="font-semibold min-w-[60px]">SKT:</span>
                        <span>{product.expiryDate}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold min-w-[60px]">Çıkılması:</span>
                        <span className="font-medium">{product.removalDate}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t-2 border-orange-300/50 bg-orange-200/20 px-3 py-2.5 sm:px-4 sm:py-3 dark:border-orange-700/50 dark:bg-orange-900/10 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-gradient-to-r from-orange-600 to-orange-500 px-4 py-2.5 text-sm sm:text-base font-bold text-white shadow-lg transition-all hover:from-orange-700 hover:to-orange-600 hover:shadow-xl active:scale-[0.98] dark:from-orange-500 dark:to-orange-600 dark:hover:from-orange-600 dark:hover:to-orange-700"
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
}


"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChefHat, X } from "lucide-react";
import { BarcodeImage } from "@/app/components/BarcodeImage";
import type { BakeryResolvedRow } from "@/app/lib/bakeryProductBarcodes";
import { getBakeryFullImageUrl } from "@/app/lib/bakeryFullImage";

type Phase = "barcode" | "photo";

function buildPhotoUrlAttempts(
  barcode: string,
  bakeryImageBarcodes: ReadonlySet<string>,
  getDefaultProductImage: (barcode: string) => string | undefined
): string[] {
  const b = barcode.trim();
  const out: string[] = [];
  if (bakeryImageBarcodes.has(b)) {
    out.push(getBakeryFullImageUrl(b));
  }
  const def = getDefaultProductImage(b);
  if (def && !out.includes(def)) out.push(def);
  return out;
}

export function BakeryExitWizard({
  isOpen,
  onClose,
  queue,
  shelfStockByBarcode,
  bakeryImageBarcodes,
  getDefaultProductImage,
}: {
  isOpen: boolean;
  onClose: () => void;
  queue: BakeryResolvedRow[];
  shelfStockByBarcode: Record<string, number | null | undefined>;
  bakeryImageBarcodes: ReadonlySet<string>;
  getDefaultProductImage: (barcode: string) => string | undefined;
}) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("barcode");
  const [photoUrlIdx, setPhotoUrlIdx] = useState(0);
  const [photoLightboxOpen, setPhotoLightboxOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setIndex(0);
    setPhase("barcode");
    setPhotoUrlIdx(0);
    setPhotoLightboxOpen(false);
  }, [isOpen]);

  useEffect(() => {
    setPhotoUrlIdx(0);
    setPhotoLightboxOpen(false);
  }, [index, phase]);

  const row = queue[index];
  const shelf = row != null ? shelfStockByBarcode[row.barcode] : undefined;
  const stockQty = typeof shelf === "number" ? shelf : null;

  const photoUrls = useMemo(() => {
    if (!row) return [];
    return buildPhotoUrlAttempts(
      row.barcode,
      bakeryImageBarcodes,
      getDefaultProductImage
    );
  }, [row, bakeryImageBarcodes, getDefaultProductImage]);

  const handleNext = useCallback(() => {
    if (!row) return;
    setPhotoLightboxOpen(false);
    if (phase === "barcode") {
      setPhase("photo");
      return;
    }
    if (index < queue.length - 1) {
      setIndex((i) => i + 1);
      setPhase("barcode");
    } else {
      onClose();
    }
  }, [row, phase, index, queue.length, onClose]);

  const canGoBack = phase === "photo" || index > 0;

  const handleBack = useCallback(() => {
    if (!canGoBack) return;
    setPhotoLightboxOpen(false);
    if (phase === "photo") {
      setPhase("barcode");
      return;
    }
    if (index > 0) {
      setIndex((i) => i - 1);
      setPhase("photo");
    }
  }, [canGoBack, phase, index]);

  const currentPhotoUrl =
    photoUrls.length > 0 && photoUrlIdx < photoUrls.length
      ? photoUrls[photoUrlIdx]
      : null;

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (photoLightboxOpen) {
          setPhotoLightboxOpen(false);
          return;
        }
        onClose();
      }
      if (photoLightboxOpen) return;
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handleBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, photoLightboxOpen, handleNext, handleBack]);

  if (!isOpen || queue.length === 0 || !row || stockQty === null || stockQty <= 0) {
    return null;
  }

  const stepLabel =
    phase === "barcode"
      ? "Barkod ve raf stoku"
      : "Fırın görseli (yerel veya varsayılan)";

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bakery-exit-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/78 backdrop-blur-md sm:bg-black/48 sm:backdrop-blur-[2px]"
        aria-label="Kapat"
        onClick={onClose}
      />
      <div
        className="relative flex h-[min(90dvh,640px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-900 shadow-2xl ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-700/80 px-3 py-2.5">
          <div className="min-w-0">
            <p id="bakery-exit-title" className="truncate text-sm font-semibold text-zinc-100">
              Fırın çık
            </p>
            <p className="truncate text-xs text-zinc-400">
              {index + 1} / {queue.length} · {stepLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-zinc-600 bg-zinc-800 p-2 text-zinc-300 transition hover:bg-zinc-700"
            aria-label="Kapat"
          >
            <X className="size-5" strokeWidth={2.25} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
          <p className="mb-3 line-clamp-2 shrink-0 text-center text-[15px] font-medium leading-snug text-zinc-100">
            {row.displayName}
          </p>

          <div className="flex min-h-0 flex-1 flex-col">
            {phase === "barcode" ? (
              <div className="flex h-full min-h-0 flex-col justify-center gap-3">
                <div className="rounded-xl border border-zinc-600/80 bg-zinc-800/50 px-3 py-3">
                  <div className="mx-auto flex w-full max-w-[min(100%,380px)] justify-center rounded-lg bg-white px-3 py-2.5 shadow-inner ring-1 ring-zinc-900/10">
                    <BarcodeImage
                      barcode={row.barcode}
                      width={2.25}
                      height={68}
                      className="[&_canvas]:max-h-[102px]"
                    />
                  </div>
                  <p className="mt-2 text-center font-mono text-xs tracking-wide text-zinc-500">
                    {row.barcode}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/40 px-4 py-3 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400/90">
                    Raf stok
                  </p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums text-emerald-300">
                    {stockQty}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-0 flex-col">
                <div className="group relative h-full min-h-0 w-full overflow-hidden rounded-xl border-2 border-zinc-600 bg-zinc-800/80 transition duration-200 hover:border-amber-400 hover:shadow-[0_0_20px_rgba(251,191,36,0.25)]">
                  {!currentPhotoUrl ? (
                    <div className="flex h-full flex-col items-center justify-center text-zinc-500">
                      <ChefHat className="mb-2 size-16 opacity-60" aria-hidden />
                      <span className="text-sm">Görsel yok</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="relative h-full w-full cursor-zoom-in"
                      onClick={() => setPhotoLightboxOpen(true)}
                      aria-label={`${row.displayName} — tam boyut aç`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- dinamik CDN / yerel yollar */}
                      <img
                        key={`${row.barcode}-${photoUrlIdx}`}
                        src={currentPhotoUrl}
                        alt=""
                        className="h-full w-full object-contain p-2 transition duration-200 group-hover:brightness-125"
                        onError={() => setPhotoUrlIdx((i) => i + 1)}
                      />
                      <span className="pointer-events-none absolute inset-0 bg-amber-400/0 transition duration-200 group-hover:bg-amber-400/15" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-zinc-700/80 bg-zinc-900/95 px-4 py-3">
          <button
            type="button"
            onClick={handleBack}
            disabled={!canGoBack}
            className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-xl border border-zinc-600 bg-zinc-800 px-3 py-3 text-sm font-semibold text-zinc-100 transition hover:border-zinc-400 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-zinc-600 disabled:hover:bg-zinc-800"
          >
            <ChevronLeft className="size-5 opacity-90" aria-hidden />
            <span>Geri</span>
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="flex min-w-0 flex-[1.4] items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-3 py-3 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 hover:shadow-amber-500/40 active:scale-[0.99]"
          >
            <span>
              {phase === "barcode"
                ? "İleri — görsel"
                : index < queue.length - 1
                  ? "İleri — sonraki"
                  : "Bitir"}
            </span>
            <ChevronRight className="size-5 opacity-90" aria-hidden />
          </button>
        </div>
      </div>

      {photoLightboxOpen && currentPhotoUrl && (
        <div
          className="fixed inset-0 z-[80] flex flex-col bg-black/92 p-3 sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-label="Tam boyut görsel"
          onClick={() => setPhotoLightboxOpen(false)}
        >
          <div className="flex shrink-0 justify-end pb-2">
            <button
              type="button"
              className="flex size-10 items-center justify-center rounded-full bg-zinc-800 text-zinc-100 ring-1 ring-zinc-600/80 transition hover:bg-zinc-700"
              aria-label="Tam boyutu kapat"
              onClick={(e) => {
                e.stopPropagation();
                setPhotoLightboxOpen(false);
              }}
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div
            className="flex min-h-0 flex-1 items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentPhotoUrl}
              alt={row.displayName}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}

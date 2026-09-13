"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Boxes, Package, X } from "lucide-react";
import { BarcodeImage } from "./BarcodeImage";
import { formatTryPriceTRY } from "@/app/lib/utils";
import type { SayimCandidate, SayimPair } from "@/app/lib/sayimMatch";

interface SayimChangeModalProps {
  /** null ise pencere kapalı */
  pair: SayimPair | null;
  applying: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function sideColor(side: "extra" | "missing"): string {
  return side === "extra" ? "var(--color-extra)" : "var(--color-missing)";
}

/** Getir'deki güncel raf stoğu: yükleniyor / sayı / alınamadı */
function GetirStockChip({
  loading,
  stock,
}: {
  loading: boolean;
  stock: number | null | undefined;
}) {
  const text = loading
    ? "stok yükleniyor…"
    : typeof stock === "number"
      ? `Getir stoğu: ${stock}`
      : "Getir stoğu alınamadı";

  return (
    <span
      className={`mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
        typeof stock === "number" && !loading
          ? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
      }`}
    >
      <Boxes className="size-3 shrink-0" aria-hidden />
      {text}
    </span>
  );
}

/** Tek ürün bloğu: görsel, ad, miktar/tutar, güncel stok ve okutulabilir barkod */
function SayimChangeSide({
  side,
  candidate,
  stockLoading,
  stock,
}: {
  side: "extra" | "missing";
  candidate: SayimCandidate;
  stockLoading: boolean;
  stock: number | null | undefined;
}) {
  const color = sideColor(side);
  return (
    <div
      className="flex flex-col gap-2.5 rounded-xl border-2 bg-white p-3 dark:bg-zinc-900"
      style={{ borderColor: color }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
          style={{ backgroundColor: color }}
        >
          {side === "extra" ? "Fazla" : "Eksik"}
        </span>
        <span className="text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
          {formatTryPriceTRY(candidate.total)}
        </span>
      </div>

      <div className="flex items-start gap-2.5">
        {candidate.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- harici CDN ürün görseli
          <img
            src={candidate.imageUrl}
            alt=""
            className="size-14 shrink-0 rounded-lg border border-zinc-200 object-contain dark:border-zinc-700"
          />
        ) : (
          <span className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
            <Package className="size-6 text-zinc-400" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug text-zinc-900 dark:text-zinc-100">
            {candidate.name || "İsimsiz ürün"}
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
            {candidate.quantity} adet ×{" "}
            {formatTryPriceTRY(candidate.unitPrice)}
          </p>
          <GetirStockChip loading={stockLoading} stock={stock} />
        </div>
      </div>

      {/* Barkod daima beyaz zeminde: karanlık temada da okutulabilsin */}
      <div className="rounded-lg bg-white p-1.5">
        <BarcodeImage barcode={candidate.barcode} height={70} width={2} />
      </div>
    </div>
  );
}

export function SayimChangeModal({
  pair,
  applying,
  onClose,
  onConfirm,
}: SayimChangeModalProps) {
  /** İkinci onay adımı: "Eminim" basılmadan silme yapılmaz */
  const [confirming, setConfirming] = useState(false);
  const [stocks, setStocks] = useState<Record<string, number | null>>({});
  const [stockLoading, setStockLoading] = useState(false);

  const open = pair !== null;
  const extraBarcode = pair?.extra.barcode ?? "";
  const missingBarcode = pair?.missing.barcode ?? "";

  useEffect(() => {
    if (!pair) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !applying) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pair, applying, onClose]);

  // Pencere her açılışta ilk adımdan başlar
  useEffect(() => {
    setConfirming(false);
  }, [open, extraBarcode, missingBarcode]);

  // Güncel raf stoğu: iki barkod için tek istek
  useEffect(() => {
    if (!extraBarcode && !missingBarcode) return;

    const controller = new AbortController();
    setStocks({});
    setStockLoading(true);

    fetch("/api/getir-stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        barcodes: [extraBarcode, missingBarcode].filter(Boolean),
      }),
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data: { stocks?: Record<string, number | null> }) => {
        if (controller.signal.aborted) return;
        setStocks(data?.stocks && typeof data.stocks === "object" ? data.stocks : {});
      })
      .catch(() => {
        if (!controller.signal.aborted) setStocks({});
      })
      .finally(() => {
        if (!controller.signal.aborted) setStockLoading(false);
      });

    return () => controller.abort();
  }, [extraBarcode, missingBarcode]);

  if (!pair) return null;

  const netTone =
    pair.net > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : pair.net < 0
        ? "text-red-600 dark:text-red-400"
        : "text-zinc-700 dark:text-zinc-200";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sayim-change-title"
    >
      <button
        type="button"
        onClick={() => {
          if (!applying) onClose();
        }}
        className="absolute inset-0 bg-black/50"
        aria-label="Kapat"
      />

      <div className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <div>
            <h2
              id="sayim-change-title"
              className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-50"
            >
              <ArrowLeftRight className="size-4 opacity-70" aria-hidden />
              Change&apos;i uygula
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {pair.category} · barkodları okutup panelde değişimi yapabilirsiniz
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            className="rounded-lg p-1 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-40 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
            aria-label="Kapat"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <SayimChangeSide
              side="extra"
              candidate={pair.extra}
              stockLoading={stockLoading}
              stock={stocks[pair.extra.barcode]}
            />
            <SayimChangeSide
              side="missing"
              candidate={pair.missing}
              stockLoading={stockLoading}
              stock={stocks[pair.missing.barcode]}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-100 px-3 py-2.5 dark:bg-zinc-800">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Net etki
            </span>
            <span className={`text-lg font-bold tabular-nums ${netTone}`}>
              {pair.net > 0 ? "+" : ""}
              {formatTryPriceTRY(pair.net)}
            </span>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            Onayladığınızda iki kaydın da miktarı tamamen kapandığı için her
            ikisi de panelden silinecek.
          </p>
        </div>

        <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-700">
          {confirming && (
            <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
              <AlertTriangle className="mt-px size-4 shrink-0" aria-hidden />
              <span>
                Emin misiniz? İki kayıt da panelden silinecek ve bu işlem geri
                alınamaz.
              </span>
            </div>
          )}
          <div className="flex gap-2 px-4 py-3">
            <button
              type="button"
              onClick={() => (confirming ? setConfirming(false) : onClose())}
              disabled={applying}
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              Vazgeç
            </button>
            {confirming ? (
              <button
                type="button"
                onClick={onConfirm}
                disabled={applying}
                className="flex-1 rounded-lg bg-red-600 px-3 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-red-700 disabled:opacity-50"
              >
                {applying ? "Uygulanıyor…" : "Eminim"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={applying}
                className="flex-1 rounded-lg bg-zinc-900 px-3 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Onayla
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

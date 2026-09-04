"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, Loader2, Package, Truck, X } from "lucide-react";
import {
  matchMissingWithTransferProducts,
  sortIncomingProducts,
  summarizeIncomingProducts,
  type MissingMatchInput,
  type SevkiyatMatchRow,
  type TransferMatchInput,
} from "@/app/lib/sevkiyatMatch";

type WizardStep = "date" | "choose" | "result";
type ResultMode = "missing" | "incoming";

function istanbulTodayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
  }).format(new Date());
}

function ProductThumb({
  src,
  alt,
}: {
  src: string | null | undefined;
  alt: string;
}) {
  return src ? (
    <img
      src={src}
      alt={alt}
      className="size-[4.25rem] shrink-0 rounded-xl bg-white object-contain ring-1 ring-zinc-200 dark:ring-zinc-600"
      width={68}
      height={68}
      loading="lazy"
    />
  ) : (
    <div
      className="flex size-[4.25rem] shrink-0 items-center justify-center rounded-xl bg-zinc-100 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-600"
      aria-hidden
    >
      <Package className="size-7 text-zinc-400 dark:text-zinc-500" />
    </div>
  );
}

export function SevkiyatControlWizard({
  isOpen,
  onClose,
  missingItems,
  getProductImage,
}: {
  isOpen: boolean;
  onClose: () => void;
  missingItems: MissingMatchInput[];
  getProductImage?: (barcode: string) => string | undefined;
}) {
  const [step, setStep] = useState<WizardStep>("date");
  const [dateYmd, setDateYmd] = useState(istanbulTodayYmd);
  const [loading, setLoading] = useState(false);
  const [resultMode, setResultMode] = useState<ResultMode | null>(null);
  const [missingRows, setMissingRows] = useState<SevkiyatMatchRow[]>([]);
  const [missingError, setMissingError] = useState<string | null>(null);
  const [missingWarning, setMissingWarning] = useState<string | null>(null);
  const [incomingRows, setIncomingRows] = useState<TransferMatchInput[]>([]);
  const [incomingError, setIncomingError] = useState<string | null>(null);
  const [incomingWarning, setIncomingWarning] = useState<string | null>(null);
  const fetchGenRef = useRef(0);

  const reset = useCallback(() => {
    setStep("date");
    setDateYmd(istanbulTodayYmd());
    setLoading(false);
    setResultMode(null);
    setMissingRows([]);
    setMissingError(null);
    setMissingWarning(null);
    setIncomingRows([]);
    setIncomingError(null);
    setIncomingWarning(null);
    fetchGenRef.current += 1;
  }, []);

  useEffect(() => {
    if (isOpen) reset();
  }, [isOpen, reset]);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  async function withBusy(fn: () => void) {
    if (loading) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 280));
    fn();
    setLoading(false);
  }

  async function fetchProductsForDate(): Promise<{
    ok: boolean;
    products: TransferMatchInput[];
    error: string | null;
    warning: string | null;
  }> {
    const response = await fetch("/api/warehouse-transfer/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: dateYmd }),
    });
    const json = (await response.json()) as {
      products?: TransferMatchInput[];
      error?: string | null;
      warning?: string | null;
    };
    const products = Array.isArray(json.products) ? json.products : [];
    return {
      ok: response.ok,
      products,
      error: json.error || (!response.ok ? "Sevkiyat alınamadı." : null),
      warning: json.warning ?? null,
    };
  }

  async function loadMissingMatches() {
    if (loading) return;
    const gen = ++fetchGenRef.current;
    setLoading(true);
    setResultMode("missing");
    setStep("result");
    setMissingError(null);
    setMissingWarning(null);
    setMissingRows([]);
    try {
      const json = await fetchProductsForDate();
      if (gen !== fetchGenRef.current) return;
      if (!json.ok) {
        setMissingError(json.error || "Sevkiyat alınamadı.");
        return;
      }
      setMissingRows(
        matchMissingWithTransferProducts(missingItems, json.products)
      );
      setMissingWarning(json.warning);
    } catch {
      if (gen !== fetchGenRef.current) return;
      setMissingError("İstek atılamadı. Ağı kontrol edip tekrar deneyin.");
    } finally {
      if (gen === fetchGenRef.current) setLoading(false);
    }
  }

  async function loadIncomingProducts() {
    if (loading) return;
    const gen = ++fetchGenRef.current;
    setLoading(true);
    setResultMode("incoming");
    setStep("result");
    setIncomingError(null);
    setIncomingWarning(null);
    setIncomingRows([]);
    try {
      const json = await fetchProductsForDate();
      if (gen !== fetchGenRef.current) return;
      if (!json.ok) {
        setIncomingError(json.error || "Sevkiyat alınamadı.");
        return;
      }
      setIncomingRows(sortIncomingProducts(json.products));
      setIncomingWarning(json.warning);
    } catch {
      if (gen !== fetchGenRef.current) return;
      setIncomingError("İstek atılamadı. Ağı kontrol edip tekrar deneyin.");
    } finally {
      if (gen === fetchGenRef.current) setLoading(false);
    }
  }

  if (!isOpen) return null;

  const missingEmpty =
    resultMode === "missing" &&
    !loading &&
    !missingError &&
    missingRows.length === 0;
  const incomingEmpty =
    resultMode === "incoming" &&
    !loading &&
    !incomingError &&
    incomingRows.length === 0;
  const incomingSummary = summarizeIncomingProducts(incomingRows);

  return (
    <div
      className="fixed inset-0 z-[76] flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sevkiyat-wizard-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        aria-label="Kapat"
        onClick={close}
      />
      <div
        className="relative flex h-[min(90dvh,680px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-700">
          <div className="min-w-0">
            <p
              id="sevkiyat-wizard-title"
              className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100"
            >
              Sevkiyat kontrol
            </p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {step === "date"
                ? "Tarih seçin"
                : step === "choose"
                  ? dateYmd
                  : resultMode === "missing"
                    ? "Eksik ürünler"
                    : "Gelen ürünler"}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="shrink-0 rounded-xl border border-zinc-300 bg-zinc-50 p-2 text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            aria-label="Kapat"
          >
            <X className="size-5" strokeWidth={2.25} />
          </button>
        </div>

        <div className="relative min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {step === "date" && (
            <div className="flex flex-col gap-4">
              <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Teslimat tarihi
                <input
                  type="date"
                  value={dateYmd}
                  onChange={(e) => setDateYmd(e.target.value)}
                  disabled={loading}
                  className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-base dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </label>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Varsayılan bugün (İstanbul). Getir’deki o günün teslimatları
                kullanılacak.
              </p>
            </div>
          )}

          {step === "choose" && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                disabled={loading}
                onClick={() => void loadMissingMatches()}
                className="min-h-12 rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-left disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800"
              >
                <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  Eksik ürünleri bul
                </span>
                <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                  Paneldeki eksiklerden sevkiyatta da olanlar.
                </span>
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void loadIncomingProducts()}
                className="min-h-12 rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-left disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800"
              >
                <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  Gelen ürünleri bul
                </span>
                <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                  O gün sevkiyattan gelen tüm ürünler.
                </span>
              </button>
            </div>
          )}

          {step === "result" && resultMode === "missing" && (
            <div className="flex flex-col gap-3">
              {missingError ? (
                <div className="space-y-3">
                  <p className="text-sm text-red-700 dark:text-red-400">
                    {missingError}
                  </p>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void loadMissingMatches()}
                    className="min-h-11 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    Tekrar dene
                  </button>
                </div>
              ) : (
                <>
                  {!loading && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {missingItems.length} eksik kayıttan {missingRows.length}
                      ’i sevkiyatta bulundu
                    </p>
                  )}
                  {missingWarning && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      {missingWarning}
                    </p>
                  )}
                  {missingEmpty && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">
                      Bu tarihte eksik listedeki ürünlerden sevkiyatta eşleşen
                      yok.
                    </p>
                  )}
                  {missingRows.length > 0 && (
                    <ul className="space-y-2.5">
                      {missingRows.map((row, i) => {
                        const imageSrc =
                          row.imageUrl ||
                          (row.barcode ? getProductImage?.(row.barcode) : undefined);
                        return (
                          <li
                            key={`${row.barcode || row.displayName}-${i}`}
                            className="flex gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/70"
                          >
                            <ProductThumb src={imageSrc} alt={row.displayName} />
                            <div className="min-w-0 flex-1">
                              <p className="text-[15px] font-medium leading-snug text-zinc-900 dark:text-zinc-50">
                                {row.displayName}
                              </p>
                              <p className="mt-1.5 text-sm font-semibold tabular-nums text-amber-800 dark:text-amber-300">
                                {row.missingQty} eksik
                              </p>
                              {row.palletCodes.length > 0 ? (
                                <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                                  {row.palletCodes.join(", ")} paletinde var
                                </p>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}

          {step === "result" && resultMode === "incoming" && (
            <div className="flex flex-col gap-3">
              {incomingError ? (
                <div className="space-y-3">
                  <p className="text-sm text-red-700 dark:text-red-400">
                    {incomingError}
                  </p>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void loadIncomingProducts()}
                    className="min-h-11 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    Tekrar dene
                  </button>
                </div>
              ) : (
                <>
                  {!loading && incomingRows.length > 0 && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {incomingSummary.skuCount} SKU · toplam miktar{" "}
                      {incomingSummary.totalQty}
                      {incomingSummary.missingQtyCount > 0
                        ? ` · miktarsız ${incomingSummary.missingQtyCount} satır`
                        : ""}
                    </p>
                  )}
                  {incomingWarning && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      {incomingWarning}
                    </p>
                  )}
                  {incomingEmpty && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">
                      Bu tarihte teslimat/ürün yok.
                    </p>
                  )}
                  {incomingRows.length > 0 && (
                    <ul className="space-y-2.5">
                      {incomingRows.map((row, i) => {
                        const name = row.name?.trim() || "İsimsiz";
                        const imageSrc = row.barcode
                          ? getProductImage?.(row.barcode)
                          : undefined;
                        return (
                          <li
                            key={`${row.barcode || row.name || i}-${i}`}
                            className="flex gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/70"
                          >
                            <ProductThumb src={imageSrc} alt={name} />
                            <div className="min-w-0 flex-1">
                              <p className="text-[15px] font-medium leading-snug text-zinc-900 dark:text-zinc-50">
                                {name}
                              </p>
                              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                {row.barcode?.trim() || "Barkod yok"}
                              </p>
                              <p className="mt-1.5 text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
                                {row.quantity != null ? `${row.quantity} adet` : "Miktar yok"}
                              </p>
                              {row.palletCodes.length > 0 ? (
                                <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                                  Palet: {row.palletCodes.join(", ")}
                                </p>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-zinc-900/70">
              <Loader2
                className="size-8 animate-spin text-zinc-700 dark:text-zinc-200"
                aria-label="Yükleniyor"
              />
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-zinc-200 px-3 py-3 dark:border-zinc-700">
          {step === "date" ? (
            <>
              <button
                type="button"
                onClick={close}
                disabled={loading}
                className="min-h-11 flex-1 rounded-xl border border-zinc-300 px-3 text-sm font-medium text-zinc-700 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300"
              >
                İptal
              </button>
              <button
                type="button"
                disabled={loading || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)}
                onClick={() => void withBusy(() => setStep("choose"))}
                className="min-h-11 flex-1 rounded-xl bg-zinc-900 px-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Devam
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setMissingError(null);
                setMissingRows([]);
                setMissingWarning(null);
                setIncomingError(null);
                setIncomingRows([]);
                setIncomingWarning(null);
                setStep(step === "result" ? "choose" : "date");
              }}
              className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-zinc-300 px-4 text-sm font-medium text-zinc-700 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300"
            >
              <ChevronLeft className="size-4" />
              Geri
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function SevkiyatControlOpenButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm sm:w-auto dark:border-zinc-600 dark:bg-zinc-100 dark:text-zinc-900"
    >
      <Truck className="size-4 shrink-0" aria-hidden />
      Sevkiyat kontrol
    </button>
  );
}

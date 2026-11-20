"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  Boxes,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Package,
  PackageCheck,
  PackageSearch,
  Search,
  Truck,
  X,
} from "lucide-react";
import {
  groupIncomingProductsByPallet,
  matchMissingWithTransferProducts,
  palletQuantityFor,
  searchMatchesIncomingProduct,
  sortIncomingProducts,
  sortIncomingProductsByPallet,
  summarizeIncomingProducts,
  type MissingMatchInput,
  type SevkiyatMatchRow,
  type TransferMatchInput,
} from "@/app/lib/sevkiyatMatch";
import { warehouseName } from "@/app/lib/franchiseWarehouses";

type WizardStep = "date" | "choose" | "result";
type ResultMode = "missing" | "incoming";
type IncomingViewMode = "all" | "pallets" | "pallet-detail";
type IncomingSortBy = "name" | "pallet";

function istanbulTodayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
  }).format(new Date());
}

function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatYmdLong(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "Tarih seçilmedi";
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString("tr-TR", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
  });
}

const STEP_ORDER = ["date", "choose", "result"] as const;

/** Uzun listeler önce bu kadar satırla çizilir, kalanı kaydırdıkça eklenir. */
const LIST_PAGE_SIZE = 40;

/** Yazı kutusu değeri: yazarken kısa süre bekler, temizlenince hemen sıfırlanır. */
function useDebouncedText(value: string, delay = 200): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), value === "" ? 0 : delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return value === "" ? "" : debounced;
}

/** Görünen satır sayısı; resetKey (arama/sıralama/adım) değişince başa döner. */
function useProgressiveCount(resetKey: string) {
  const [state, setState] = useState({ key: resetKey, count: LIST_PAGE_SIZE });
  if (state.key !== resetKey) {
    setState({ key: resetKey, count: LIST_PAGE_SIZE });
  }
  const count = state.key === resetKey ? state.count : LIST_PAGE_SIZE;
  const showMore = useCallback(
    () =>
      setState((prev) =>
        prev.key === resetKey
          ? { key: resetKey, count: prev.count + LIST_PAGE_SIZE }
          : prev
      ),
    [resetKey]
  );
  return [count, showMore] as const;
}

/** Listenin sonunda durur; ekrana girince (veya tıklanınca) sonraki parçayı ister. */
function LoadMoreRow({
  remaining,
  onMore,
}: {
  remaining: number;
  onMore: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onMore();
      },
      {
        root: el.closest("[data-sevkiyat-scroll]"),
        rootMargin: "320px",
      }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [onMore, remaining]);
  if (remaining <= 0) return null;
  return (
    <button
      ref={ref}
      type="button"
      onClick={onMore}
      className="mt-2.5 min-h-11 w-full rounded-xl border border-zinc-300 bg-white text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
    >
      Daha fazla göster · {remaining} ürün daha
    </button>
  );
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
  warehouseId,
  getProductImage,
}: {
  isOpen: boolean;
  onClose: () => void;
  missingItems: MissingMatchInput[];
  /** Sevkiyatı çekilecek depo (eksik listesi de bu depoya ait olmalı) */
  warehouseId: string;
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
  const [incomingViewMode, setIncomingViewMode] = useState<IncomingViewMode>("all");
  const [incomingSortBy, setIncomingSortBy] = useState<IncomingSortBy>("name");
  const [incomingSearchQuery, setIncomingSearchQuery] = useState("");
  const [palletsListSearchQuery, setPalletsListSearchQuery] = useState("");
  const [selectedPalletCode, setSelectedPalletCode] = useState<string | null>(null);
  const [palletSearchQuery, setPalletSearchQuery] = useState("");
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
    setIncomingViewMode("all");
    setIncomingSortBy("name");
    setIncomingSearchQuery("");
    setPalletsListSearchQuery("");
    setSelectedPalletCode(null);
    setPalletSearchQuery("");
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
      body: JSON.stringify({ date: dateYmd, warehouseId }),
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
      setIncomingViewMode("all");
      setIncomingSortBy("name");
      setIncomingSearchQuery("");
      setPalletsListSearchQuery("");
      setSelectedPalletCode(null);
      setPalletSearchQuery("");
    } catch {
      if (gen !== fetchGenRef.current) return;
      setIncomingError("İstek atılamadı. Ağı kontrol edip tekrar deneyin.");
    } finally {
      if (gen === fetchGenRef.current) setLoading(false);
    }
  }

  const palletGroups = useMemo(
    () => groupIncomingProductsByPallet(incomingRows),
    [incomingRows]
  );

  const selectedPallet = useMemo(
    () => palletGroups.find((g) => g.palletCode === selectedPalletCode) || null,
    [palletGroups, selectedPalletCode]
  );

  // Arama kutuları: her tuşta değil, yazmayı bırakınca süzülür
  const debouncedIncomingQuery = useDebouncedText(incomingSearchQuery);
  const debouncedPalletsQuery = useDebouncedText(palletsListSearchQuery);
  const debouncedPalletQuery = useDebouncedText(palletSearchQuery);

  // Palete göre sıralama yalnızca seçilince ve bir kez hesaplanır;
  // arama sıralamayı bozmadığı için yeniden sıralanmaz, sadece süzülür.
  const incomingByPallet = useMemo(
    () =>
      incomingSortBy === "pallet"
        ? sortIncomingProductsByPallet(incomingRows)
        : null,
    [incomingRows, incomingSortBy]
  );

  const displayedIncomingRows = useMemo(() => {
    const base = incomingByPallet ?? incomingRows;
    const q = debouncedIncomingQuery.trim();
    return q ? base.filter((r) => searchMatchesIncomingProduct(r, q)) : base;
  }, [incomingRows, incomingByPallet, debouncedIncomingQuery]);

  const filteredSummaryTotalQty = useMemo(() => {
    let total = 0;
    for (const r of displayedIncomingRows) {
      if (r.quantity != null) total += r.quantity;
    }
    return total;
  }, [displayedIncomingRows]);

  const filteredPalletGroups = useMemo(() => {
    const q = debouncedPalletsQuery.trim();
    if (!q) return palletGroups;
    return palletGroups.filter(
      (g) =>
        g.displayName.toLocaleLowerCase("tr-TR").includes(q.toLocaleLowerCase("tr-TR")) ||
        g.products.some((p) => searchMatchesIncomingProduct(p, q))
    );
  }, [palletGroups, debouncedPalletsQuery]);

  const filteredPalletProducts = useMemo(() => {
    if (!selectedPallet) return [];
    const q = debouncedPalletQuery.trim();
    if (!q) return selectedPallet.products;
    return selectedPallet.products.filter((p) =>
      searchMatchesIncomingProduct(p, q)
    );
  }, [selectedPallet, debouncedPalletQuery]);

  const [allVisibleCount, showMoreAll] = useProgressiveCount(
    `all|${incomingSortBy}|${debouncedIncomingQuery}|${incomingRows.length}|${step}`
  );
  const [palletVisibleCount, showMorePallet] = useProgressiveCount(
    `pallet|${selectedPalletCode}|${debouncedPalletQuery}|${step}`
  );

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
  const todayYmd = istanbulTodayYmd();
  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <div
      className="fixed inset-0 z-[76] flex items-end justify-center p-0 sm:items-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sevkiyat-wizard-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-label="Kapat"
        onClick={close}
      />
      <div
        className={`motion-safe:animate-[expiring-sheet-up_0.3s_ease-out] sm:motion-safe:animate-[expiring-dialog-pop_0.25s_ease-out] relative flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-zinc-200 bg-white shadow-2xl sm:rounded-3xl dark:border-zinc-700 dark:bg-zinc-900 ${
          step === "result" ? "h-[min(92dvh,740px)]" : "max-h-[92dvh]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-800 to-violet-900 px-4 pb-4 pt-4 text-white">
          <div
            className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-violet-500/25 blur-2xl"
            aria-hidden
          />
          <div className="relative flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Truck className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p
                id="sevkiyat-wizard-title"
                className="truncate text-base font-bold leading-tight"
              >
                Sevkiyat kontrol
              </p>
              <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-white/75">
                <span className="shrink-0 rounded-md bg-white/15 px-1.5 py-0.5 font-semibold text-white">
                  {warehouseName(warehouseId)}
                </span>
                <span className="truncate">
                  {step === "date"
                    ? "Tarih seçin"
                    : step === "choose"
                      ? formatYmdLong(dateYmd)
                      : resultMode === "missing"
                        ? "Eksik ürünler"
                        : incomingViewMode === "pallets"
                          ? `Gelen ürünler · Paletler (${palletGroups.length})`
                          : incomingViewMode === "pallet-detail"
                            ? `Palet: ${selectedPallet?.displayName || selectedPalletCode}`
                            : "Gelen ürünler"}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              className="shrink-0 rounded-xl bg-white/10 p-2 text-white ring-1 ring-white/20 transition hover:bg-white/20"
              aria-label="Kapat"
            >
              <X className="size-5" strokeWidth={2.25} />
            </button>
          </div>
          <ol className="relative mt-4 flex items-center gap-1.5" aria-label="Adımlar">
            {["Tarih", "Seçim", "Sonuç"].map((label, i) => (
              <li
                key={label}
                className="flex-1"
                aria-current={i === stepIndex ? "step" : undefined}
              >
                <span
                  className={`block h-1 rounded-full transition-colors ${
                    i <= stepIndex ? "bg-white" : "bg-white/20"
                  } ${i < stepIndex ? "opacity-60" : ""}`}
                />
                <span
                  className={`mt-1 block text-[11px] font-semibold ${
                    i === stepIndex ? "text-white" : "text-white/50"
                  }`}
                >
                  {label}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div
          data-sevkiyat-scroll
          className="relative min-h-0 flex-1 overflow-y-auto bg-zinc-50 px-4 py-4 dark:bg-zinc-950/40"
        >
          {step === "date" && (
            <div className="flex flex-col gap-3">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800/70">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                    <CalendarDays className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <label
                      htmlFor="sevkiyat-date"
                      className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
                    >
                      Teslimat tarihi
                    </label>
                    <p className="mt-0.5 text-sm font-medium text-violet-700 dark:text-violet-300">
                      {formatYmdLong(dateYmd)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(
                    [
                      ["Dün", -1],
                      ["Bugün", 0],
                    ] as const
                  ).map(([label, offset]) => {
                    const value = shiftYmd(todayYmd, offset);
                    const active = dateYmd === value;
                    return (
                      <button
                        key={label}
                        type="button"
                        disabled={loading}
                        onClick={() => setDateYmd(value)}
                        aria-pressed={active}
                        className={`min-h-10 rounded-xl border text-sm font-semibold transition active:scale-[0.97] disabled:opacity-50 ${
                          active
                            ? "border-violet-500 bg-violet-600 text-white shadow-sm"
                            : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <input
                  id="sevkiyat-date"
                  type="date"
                  value={dateYmd}
                  onChange={(e) => setDateYmd(e.target.value)}
                  disabled={loading}
                  className="mt-3 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-base dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <p className="px-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                Varsayılan bugün (İstanbul). Getir’deki o günün teslimatları
                kullanılacak.
              </p>
            </div>
          )}

          {step === "choose" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3.5 py-2.5 shadow-sm dark:border-zinc-700 dark:bg-zinc-800/70">
                <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  <CalendarDays
                    className="size-4 shrink-0 text-violet-600 dark:text-violet-300"
                    aria-hidden
                  />
                  <span className="truncate">{formatYmdLong(dateYmd)}</span>
                </span>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setStep("date")}
                  className="shrink-0 text-xs font-semibold text-violet-700 underline underline-offset-2 disabled:opacity-50 dark:text-violet-300"
                >
                  Değiştir
                </button>
              </div>
              <p className="px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Ne yapmak istiyorsunuz?
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={() => void loadMissingMatches()}
                className="group flex w-full items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md active:translate-y-0 disabled:opacity-50 motion-reduce:transform-none dark:border-zinc-700 dark:bg-zinc-800/70 dark:hover:border-violet-500/60"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  <PackageSearch className="size-6" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold text-zinc-900 dark:text-zinc-50">
                    Eksik ürünleri bul
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-zinc-500 dark:text-zinc-400">
                    Paneldeki eksiklerden sevkiyatta da olanlar.
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-violet-600" aria-hidden />
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void loadIncomingProducts()}
                className="group flex w-full items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md active:translate-y-0 disabled:opacity-50 motion-reduce:transform-none dark:border-zinc-700 dark:bg-zinc-800/70 dark:hover:border-violet-500/60"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                  <PackageCheck className="size-6" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold text-zinc-900 dark:text-zinc-50">
                    Gelen ürünleri bul
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-zinc-500 dark:text-zinc-400">
                    O gün sevkiyattan gelen tüm ürünler.
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-violet-600" aria-hidden />
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
                    <p className="rounded-xl bg-white px-3 py-2 text-xs font-medium text-zinc-600 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-800/70 dark:text-zinc-300 dark:ring-zinc-700">
                      {missingItems.length} eksik kayıttan{" "}
                      <strong className="text-zinc-900 dark:text-zinc-50">
                        {missingRows.length}
                      </strong>
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
                            className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-800/70"
                          >
                            <ProductThumb src={imageSrc} alt={row.displayName} />
                            <div className="min-w-0 flex-1">
                              <p className="text-[15px] font-medium leading-snug text-zinc-900 dark:text-zinc-50">
                                {row.displayName}
                              </p>
                              <p className="mt-1.5 flex w-fit rounded-lg bg-amber-100 px-2 py-0.5 text-sm font-bold tabular-nums text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                                {row.missingQty} eksik
                              </p>
                              {row.palletCodes.length > 0 ? (
                                <ul className="mt-1 space-y-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                                  {row.palletCodes.map((code) => {
                                    const qty = palletQuantityFor(
                                      {
                                        quantity: row.transferQty,
                                        palletCodes: row.palletCodes,
                                        palletQuantities: row.palletQuantities,
                                      },
                                      code
                                    );
                                    return (
                                      <li key={code}>
                                        <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-200">
                                          {code}
                                        </span>{" "}
                                        {qty != null ? (
                                          <>
                                            paletinde{" "}
                                            <strong className="text-zinc-900 dark:text-zinc-50">
                                              {qty} adet
                                            </strong>{" "}
                                            bu üründen var
                                          </>
                                        ) : (
                                          "paletinde var"
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
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
              ) : incomingEmpty ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  Bu tarihte teslimat/ürün yok.
                </p>
              ) : (
                <>
                  {incomingWarning && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      {incomingWarning}
                    </p>
                  )}

                  {/* 1. TÜM ÜRÜNLER GÖRÜNÜMÜ */}
                  {incomingViewMode === "all" && (
                    <div className="flex flex-col gap-3">
                      <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-3 border-b border-zinc-200 bg-zinc-50/95 px-4 py-3 backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-900/95">
                      {/* Ürün arama kutucuğu */}
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                        <input
                          type="text"
                          value={incomingSearchQuery}
                          onChange={(e) => setIncomingSearchQuery(e.target.value)}
                          placeholder="Ürün ismi veya barkod ile ara..."
                          className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-9 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
                        />
                        {incomingSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setIncomingSearchQuery("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                            aria-label="Aramayı temizle"
                          >
                            <X className="size-4" />
                          </button>
                        )}
                      </div>

                      {/* Aksiyon butonları: Sıralama & Paletleri göster */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setIncomingSortBy((prev) =>
                              prev === "pallet" ? "name" : "pallet"
                            )
                          }
                          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition active:scale-[0.98] ${
                            incomingSortBy === "pallet"
                              ? "border-amber-400/80 bg-amber-50 text-amber-900 ring-1 ring-amber-400/50 dark:border-amber-600/70 dark:bg-amber-950/40 dark:text-amber-200"
                              : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                          }`}
                        >
                          <ArrowUpDown className="size-3.5" />
                          <span>
                            {incomingSortBy === "pallet"
                              ? "Palete göre sıralı"
                              : "Palete göre sırala"}
                          </span>
                        </button>

                        {palletGroups.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setIncomingViewMode("pallets");
                              setPalletsListSearchQuery("");
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-zinc-800 active:scale-[0.98] dark:border-zinc-600 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                          >
                            <Boxes className="size-3.5" />
                            <span>Paletleri göster</span>
                            <span className="ml-0.5 rounded-md bg-white/20 px-1.5 py-0.5 text-[11px] font-bold text-white dark:bg-zinc-900/20 dark:text-zinc-900">
                              {palletGroups.length}
                            </span>
                          </button>
                        )}
                      </div>

                      </div>

                      {/* Özet bilgisi */}
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {debouncedIncomingQuery.trim()
                          ? `${displayedIncomingRows.length} / ${incomingRows.length} SKU bulundu · miktar: ${filteredSummaryTotalQty}`
                          : `${incomingSummary.skuCount} SKU · toplam miktar ${incomingSummary.totalQty}`}
                        {incomingSummary.missingQtyCount > 0
                          ? ` · miktarsız ${incomingSummary.missingQtyCount} satır`
                          : ""}
                      </p>

                      {/* Ürün Listesi */}
                      {displayedIncomingRows.length === 0 ? (
                        <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 py-8 text-center dark:border-zinc-700 dark:bg-zinc-800/40">
                          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                            Aramanıza uygun ürün bulunamadı.
                          </p>
                          <button
                            type="button"
                            onClick={() => setIncomingSearchQuery("")}
                            className="mt-2 text-xs font-semibold text-zinc-900 underline dark:text-zinc-100"
                          >
                            Aramayı temizle
                          </button>
                        </div>
                      ) : (
                        <>
                        <ul className="space-y-2.5">
                          {displayedIncomingRows.slice(0, allVisibleCount).map((row, i) => {
                            const name = row.name?.trim() || "İsimsiz";
                            const imageSrc =
                              (row.barcode
                                ? getProductImage?.(row.barcode)
                                : undefined) ||
                              row.imageUrl ||
                              undefined;
                            return (
                              <li
                                key={`${row.barcode || row.name || i}-${i}`}
                                className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm transition hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800/70 dark:hover:border-zinc-600"
                              >
                                <ProductThumb src={imageSrc} alt={name} />
                                <div className="min-w-0 flex-1">
                                  <p className="text-[15px] font-medium leading-snug text-zinc-900 dark:text-zinc-50">
                                    {name}
                                  </p>
                                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                    {row.barcode?.trim() || "Barkod yok"}
                                  </p>
                                  <p className="mt-1.5 flex w-fit rounded-lg bg-zinc-100 px-2 py-0.5 text-sm font-bold tabular-nums text-zinc-800 dark:bg-zinc-700/70 dark:text-zinc-100">
                                    {row.quantity != null
                                      ? `${row.quantity} adet`
                                      : "Miktar yok"}
                                  </p>
                                  {row.palletCodes.length > 0 ? (
                                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                                      <span>Palet:</span>
                                      {row.palletCodes.map((pCode) => (
                                        <button
                                          key={pCode}
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedPalletCode(pCode);
                                            setIncomingViewMode("pallet-detail");
                                            setPalletSearchQuery("");
                                          }}
                                          className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-100 active:scale-95 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:border-zinc-500 dark:hover:bg-zinc-700"
                                          title={`${pCode} paletindeki ürünleri göster`}
                                        >
                                          {pCode}
                                        </button>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                        <LoadMoreRow
                          remaining={displayedIncomingRows.length - allVisibleCount}
                          onMore={showMoreAll}
                        />
                        </>
                      )}
                    </div>
                  )}

                  {/* 2. PALETLER LİSTESİ GÖRÜNÜMÜ */}
                  {incomingViewMode === "pallets" && (
                    <div className="flex flex-col gap-3">
                      <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-3 border-b border-zinc-200 bg-zinc-50/95 px-4 py-3 backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-900/95">
                      {/* Üst bar: Tüm ürünlere dön */}
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setIncomingViewMode("all")}
                          className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        >
                          <ChevronLeft className="size-3.5" />
                          Tüm ürünleri göster
                        </button>
                        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          {palletGroups.length} Palet · {incomingSummary.skuCount} SKU
                        </span>
                      </div>

                      {/* Palet arama kutusu */}
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                        <input
                          type="text"
                          value={palletsListSearchQuery}
                          onChange={(e) => setPalletsListSearchQuery(e.target.value)}
                          placeholder="Palet numarası veya ürün ara..."
                          className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-9 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
                        />
                        {palletsListSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setPalletsListSearchQuery("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                            aria-label="Aramayı temizle"
                          >
                            <X className="size-4" />
                          </button>
                        )}
                      </div>

                      </div>

                      {/* Palet Listesi */}
                      {filteredPalletGroups.length === 0 ? (
                        <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 py-8 text-center dark:border-zinc-700 dark:bg-zinc-800/40">
                          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                            Aramanıza uygun palet bulunamadı.
                          </p>
                          <button
                            type="button"
                            onClick={() => setPalletsListSearchQuery("")}
                            className="mt-2 text-xs font-semibold text-zinc-900 underline dark:text-zinc-100"
                          >
                            Aramayı temizle
                          </button>
                        </div>
                      ) : (
                        <ul className="space-y-2.5">
                          {filteredPalletGroups.map((group) => (
                            <li
                              key={group.palletCode}
                              className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-sm transition hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800/70 dark:hover:border-zinc-600"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400">
                                  <Boxes className="size-5" />
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-mono text-[15px] font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                                    {group.displayName}
                                  </p>
                                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                    {group.skuCount} çeşit · {group.totalQty} adet
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedPalletCode(group.palletCode);
                                  setIncomingViewMode("pallet-detail");
                                  setPalletSearchQuery("");
                                }}
                                className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-zinc-800 active:scale-[0.98] dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                              >
                                Ürünleri göster
                                <ChevronRight className="size-3.5" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* 3. SEÇİLEN PALETİN ÜRÜNLERİ GÖRÜNÜMÜ */}
                  {incomingViewMode === "pallet-detail" && (
                    <div className="flex flex-col gap-3">
                      {/* Üst bar: Palet listesine dön butonu */}
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setIncomingViewMode("pallets");
                            setPalletSearchQuery("");
                          }}
                          className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        >
                          <ChevronLeft className="size-3.5" />
                          Palet listesine dön
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIncomingViewMode("all");
                            setPalletSearchQuery("");
                          }}
                          className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                        >
                          Tüm ürünler
                        </button>
                      </div>

                      {/* Palet Bilgi Başlığı */}
                      <div className="flex items-center justify-between rounded-xl border border-amber-300/80 bg-amber-50/70 p-3.5 dark:border-amber-700/60 dark:bg-amber-950/30">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Boxes className="size-4 shrink-0 text-amber-700 dark:text-amber-400" />
                            <span className="truncate font-mono text-sm font-bold tracking-tight text-amber-950 dark:text-amber-200">
                              {selectedPallet?.displayName}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-300/80">
                            Bu palette {selectedPallet?.skuCount ?? 0} çeşit, toplam{" "}
                            {selectedPallet?.totalQty ?? 0} adet ürün var
                          </p>
                        </div>
                      </div>

                      {/* Bu palette arama kutusu ("Yine orada da arama butonu olacak") */}
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                        <input
                          type="text"
                          value={palletSearchQuery}
                          onChange={(e) => setPalletSearchQuery(e.target.value)}
                          placeholder="Bu palette ürün veya barkod ara..."
                          className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-9 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
                        />
                        {palletSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setPalletSearchQuery("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                            aria-label="Aramayı temizle"
                          >
                            <X className="size-4" />
                          </button>
                        )}
                      </div>

                      {/* Palet İçi Ürün Listesi */}
                      {filteredPalletProducts.length === 0 ? (
                        <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 py-8 text-center dark:border-zinc-700 dark:bg-zinc-800/40">
                          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                            Bu palette aradığınız kriterlere uygun ürün bulunamadı.
                          </p>
                          <button
                            type="button"
                            onClick={() => setPalletSearchQuery("")}
                            className="mt-2 text-xs font-semibold text-zinc-900 underline dark:text-zinc-100"
                          >
                            Aramayı temizle
                          </button>
                        </div>
                      ) : (
                        <>
                        <ul className="space-y-2.5">
                          {filteredPalletProducts.slice(0, palletVisibleCount).map((row, i) => {
                            const name = row.name?.trim() || "İsimsiz";
                            const imageSrc =
                              (row.barcode
                                ? getProductImage?.(row.barcode)
                                : undefined) ||
                              row.imageUrl ||
                              undefined;
                            return (
                              <li
                                key={`${row.barcode || row.name || i}-${i}`}
                                className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-800/70"
                              >
                                <ProductThumb src={imageSrc} alt={name} />
                                <div className="min-w-0 flex-1">
                                  <p className="text-[15px] font-medium leading-snug text-zinc-900 dark:text-zinc-50">
                                    {name}
                                  </p>
                                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                    {row.barcode?.trim() || "Barkod yok"}
                                  </p>
                                  <p className="mt-1.5 flex w-fit rounded-lg bg-zinc-100 px-2 py-0.5 text-sm font-bold tabular-nums text-zinc-800 dark:bg-zinc-700/70 dark:text-zinc-100">
                                    {row.quantity != null
                                      ? `${row.quantity} adet`
                                      : "Miktar yok"}
                                  </p>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                        <LoadMoreRow
                          remaining={filteredPalletProducts.length - palletVisibleCount}
                          onMore={showMorePallet}
                        />
                        </>
                      )}
                    </div>
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

        <div className="flex shrink-0 gap-2 border-t border-zinc-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-zinc-700 dark:bg-zinc-900">
          {step === "date" ? (
            <>
              <button
                type="button"
                onClick={close}
                disabled={loading}
                className="min-h-12 flex-1 rounded-xl border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                İptal
              </button>
              <button
                type="button"
                disabled={loading || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)}
                onClick={() => void withBusy(() => setStep("choose"))}
                className="inline-flex min-h-12 flex-[1.4] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-zinc-900 to-violet-900 px-3 text-sm font-semibold text-white shadow-sm transition hover:shadow-md active:scale-[0.98] disabled:opacity-50"
              >
                Devam
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                if (step === "result" && resultMode === "incoming") {
                  if (incomingViewMode === "pallet-detail") {
                    setIncomingViewMode("pallets");
                    setPalletSearchQuery("");
                    return;
                  }
                  if (incomingViewMode === "pallets") {
                    setIncomingViewMode("all");
                    return;
                  }
                }
                setMissingError(null);
                setMissingRows([]);
                setMissingWarning(null);
                setIncomingError(null);
                setIncomingRows([]);
                setIncomingWarning(null);
                setIncomingViewMode("all");
                setIncomingSortBy("name");
                setIncomingSearchQuery("");
                setPalletsListSearchQuery("");
                setSelectedPalletCode(null);
                setPalletSearchQuery("");
                setStep(step === "result" ? "choose" : "date");
              }}
              className="inline-flex min-h-12 w-full items-center justify-center gap-1 rounded-xl border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
  label = "Sevkiyat kontrol",
  className = "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm sm:w-auto dark:border-zinc-600 dark:bg-zinc-100 dark:text-zinc-900",
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
    >
      <Truck className="size-4 shrink-0" aria-hidden />
      {label}
    </button>
  );
}

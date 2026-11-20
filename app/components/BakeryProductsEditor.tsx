"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChefHat, ChevronDown, ChevronUp, PackagePlus, Plus, Trash2, X } from "lucide-react";
import { ConfirmModal } from "@/app/components/ConfirmModal";
import { ManualAddProductModal } from "@/app/components/ManualAddProductModal";
import {
  MAX_BAKERY_PRODUCTS,
  addBakeryEntry,
  defaultBakeryEntries,
  moveBakeryEntry,
  normalizeBakeryBarcode,
  removeBakeryEntry,
  resolveBakeryEntries,
  type BakeryCatalogProduct,
  type BakeryProductEntry,
} from "@/app/lib/bakeryProducts";
import { readBakeryProducts, saveBakeryProducts } from "@/app/lib/bakeryProductsService";

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 8;

const ADD_ERROR_MESSAGES = {
  empty: "Barkod boş olamaz.",
  duplicate: "Bu ürün zaten listede.",
  full: `Listeye en fazla ${MAX_BAKERY_PRODUCTS} ürün eklenebilir.`,
} as const;

interface BakeryProductsEditorProps {
  isOpen: boolean;
  onClose: () => void;
  catalogProducts: ReadonlyArray<BakeryCatalogProduct>;
  getProductImage: (barcode: string) => string | undefined;
  /** Elle eklenen ürün kataloğa yazıldı — sayfa kendi katalog durumunu günceller */
  onCatalogProductSaved: (product: { name: string; barcode: string; imageUrl?: string }) => void;
}

/**
 * Fırın çık ürün listesini düzenler: katalogdan ekle, katalogda yoksa "Yeni Ürün Ekleme" ile ekle,
 * çıkar (onaylı), sırayı değiştir. Her değişiklik anında Firestore'a yazılır.
 */
export function BakeryProductsEditor(props: BakeryProductsEditorProps) {
  // Her açılışta sıfırdan bağlanır: arama kutusu, mesajlar ve liste temiz başlar
  if (!props.isOpen) return null;
  return <BakeryProductsEditorInner {...props} />;
}

function BakeryProductsEditorInner({
  onClose,
  catalogProducts,
  getProductImage,
  onCatalogProductSaved,
}: BakeryProductsEditorProps) {
  const [entries, setEntries] = useState<BakeryProductEntry[]>([]);
  const entriesRef = useRef<BakeryProductEntry[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pendingRemove, setPendingRemove] = useState<BakeryProductEntry | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  // Art arda gelen değişiklikler sırayla yazılsın (eski yazma yenisini ezmesin)
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());

  const applyEntries = useCallback((next: BakeryProductEntry[]) => {
    entriesRef.current = next;
    setEntries(next);
  }, []);

  /** Listeyi yeniden okutmak için artırılır (ilk açılış, "Tekrar dene", kayıt hatası sonrası) */
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    readBakeryProducts()
      .then((stored) => {
        if (cancelled) return;
        applyEntries(stored ?? defaultBakeryEntries());
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [applyEntries, reloadTick]);

  const commit = useCallback(
    (next: BakeryProductEntry[]) => {
      applyEntries(next);
      setMessage(null);
      saveChainRef.current = saveChainRef.current
        .then(() => saveBakeryProducts(next))
        .catch(() => {
          setMessage("Değişiklik kaydedilemedi; liste Firestore'daki haline döndürülüyor.");
          setReloadTick((t) => t + 1);
        });
    },
    [applyEntries]
  );

  const addEntry = useCallback(
    (entry: BakeryProductEntry) => {
      const result = addBakeryEntry(entriesRef.current, entry);
      if (!result.ok) {
        setMessage(ADD_ERROR_MESSAGES[result.reason]);
        return;
      }
      commit(result.list);
      setQuery("");
    },
    [commit]
  );

  const rows = useMemo(() => resolveBakeryEntries(entries, catalogProducts), [entries, catalogProducts]);

  const trimmedQuery = query.trim();
  const searchResults = useMemo(() => {
    if (trimmedQuery.length < MIN_QUERY_LENGTH) return [];
    const q = trimmedQuery.toLowerCase();
    const listed = new Set(entries.map((e) => e.barcode));
    const out: BakeryCatalogProduct[] = [];
    for (const p of catalogProducts) {
      const barcodes = [p.barcode, ...(p.barcodes ?? [])].map(normalizeBakeryBarcode);
      if (barcodes.some((b) => listed.has(b))) continue;
      const hit =
        (p.name || "").toLowerCase().includes(q) ||
        barcodes.some((b) => b.toLowerCase().includes(q));
      if (hit) out.push(p);
      if (out.length >= MAX_RESULTS) break;
    }
    return out;
  }, [trimmedQuery, catalogProducts, entries]);

  const manualInitial = useMemo(() => {
    const digits = trimmedQuery.replace(/\s/g, "");
    return /^\d{6,18}$/.test(digits) ? { barcode: digits, name: "" } : { name: trimmedQuery, barcode: "" };
  }, [trimmedQuery]);

  const showManualAdd = trimmedQuery.length >= MIN_QUERY_LENGTH && searchResults.length === 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bakery-products-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Kapat"
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <div className="min-w-0">
            <h2
              id="bakery-products-title"
              className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-50"
            >
              <ChefHat className="size-4 text-amber-600" aria-hidden />
              Fırın ürünleri
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {entries.length} / {MAX_BAKERY_PRODUCTS} ürün · değişiklikler anında kaydedilir
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Kapat"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="shrink-0 border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Ürün ekle</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={status !== "ready"}
              placeholder="Ürün adı veya barkod ara…"
              autoComplete="off"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
          {searchResults.length > 0 && (
            <ul className="mt-2 max-h-48 divide-y divide-zinc-100 overflow-auto rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700">
              {searchResults.map((p) => (
                <li key={p.productId || p.barcode}>
                  <button
                    type="button"
                    onClick={() => addEntry({ barcode: p.barcode, name: p.name })}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-amber-50 dark:hover:bg-zinc-800"
                  >
                    <Plus className="size-4 shrink-0 text-amber-600" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-zinc-900 dark:text-zinc-100">{p.name}</span>
                      <span className="block font-mono text-xs text-zinc-500">{p.barcode}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {showManualAdd && status === "ready" && (
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-amber-400 px-3 py-2.5 text-sm font-medium text-amber-800 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-zinc-800"
            >
              <PackagePlus className="size-4" aria-hidden />
              Katalogda bulunamadı — yeni ürün olarak ekle
            </button>
          )}
        </div>

        {message && (
          <p
            className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
            role="alert"
          >
            {message}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          {status === "loading" && (
            <p className="p-6 text-center text-sm text-zinc-500">Liste yükleniyor…</p>
          )}
          {status === "error" && (
            <div className="p-6 text-center text-sm text-red-600 dark:text-red-400">
              <p>Fırın listesi okunamadı.</p>
              <button
                type="button"
                onClick={() => {
                  setStatus("loading");
                  setReloadTick((t) => t + 1);
                }}
                className="mt-2 rounded-lg border border-zinc-300 px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Tekrar dene
              </button>
            </div>
          )}
          {status === "ready" && rows.length === 0 && (
            <p className="p-6 text-center text-sm text-zinc-500">
              Liste boş. Yukarıdan ürün ekleyin.
            </p>
          )}
          {status === "ready" && rows.length > 0 && (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((row, index) => {
                const imageUrl = row.imageUrl || getProductImage(row.barcode);
                return (
                  <li key={row.barcode} className="flex items-center gap-2 px-3 py-2">
                    <span className="w-6 shrink-0 text-center text-xs tabular-nums text-zinc-400">
                      {index + 1}
                    </span>
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- dinamik CDN / data URL
                      <img
                        src={imageUrl}
                        alt=""
                        className="size-10 shrink-0 rounded-md bg-zinc-100 object-contain dark:bg-zinc-800"
                      />
                    ) : (
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
                        <ChefHat className="size-5" aria-hidden />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-sm ${
                          row.inCatalog
                            ? "text-zinc-900 dark:text-zinc-100"
                            : "text-amber-700 dark:text-amber-400"
                        }`}
                      >
                        {row.displayName}
                      </span>
                      <span className="block font-mono text-xs text-zinc-500">{row.barcode}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => commit(moveBakeryEntry(entriesRef.current, row.barcode, -1))}
                      disabled={index === 0}
                      className="rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      aria-label={`${row.displayName} — yukarı taşı`}
                    >
                      <ChevronUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => commit(moveBakeryEntry(entriesRef.current, row.barcode, 1))}
                      disabled={index === rows.length - 1}
                      className="rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      aria-label={`${row.displayName} — aşağı taşı`}
                    >
                      <ChevronDown className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingRemove({ barcode: row.barcode, name: row.displayName })
                      }
                      className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                      aria-label={`${row.displayName} — listeden çıkar`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={pendingRemove !== null}
        onClose={() => setPendingRemove(null)}
        title="Listeden çıkar"
        message={`"${pendingRemove?.name ?? ""}" fırın listesinden çıkarılsın mı? Ürün kataloğundan silinmez.`}
        confirmLabel="Çıkar"
        cancelLabel="Vazgeç"
        variant="danger"
        onConfirm={() => {
          if (pendingRemove) commit(removeBakeryEntry(entriesRef.current, pendingRemove.barcode));
        }}
      />

      <ManualAddProductModal
        isOpen={manualOpen}
        onClose={() => setManualOpen(false)}
        initial={manualInitial}
        onSaved={(product) => {
          onCatalogProductSaved(product);
          addEntry({ barcode: product.barcode, name: product.name });
        }}
      />
    </div>
  );
}

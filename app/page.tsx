"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import JsBarcode from "jsbarcode";
import Image from "next/image";
import {
  Barcode,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  ChefHat,
  X,
  RefreshCw,
  Calculator,
} from "lucide-react";
import { AddProductModal } from "./components/AddProductModal";
import { SearchBar } from "./components/SearchBar";
import { BarcodeScanner } from "./components/BarcodeScanner";
import { StatCardSkeleton } from "./components/StatCardSkeleton";
import { ListSkeleton } from "./components/ListSkeleton";
import { EmptyState } from "./components/EmptyState";
import { ErrorMessage } from "./components/ErrorMessage";
import { Toast, type ToastType } from "./components/Toast";
import {
  PackageSearch,
  PackageX,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Droplets,
} from "lucide-react";
import { deleteStockItem, subscribeStockItems } from "@/app/lib/stockService";
import { ExpiringProductNotification } from "./components/ExpiringProductNotification";
import { ExpiringProductModal } from "./components/ExpiringProductModal";
import { ConfirmModal } from "./components/ConfirmModal";
import { BarkodOlusturucuModal } from "./components/BarkodOlusturucuModal";
import { ReferenceWaterProductsPanel } from "./components/ReferenceWaterProductsPanel";
import { ReferenceWaterProductsPanelContent } from "./components/ReferenceWaterProductsPanelContent";
import type { StockItemWithId, ExpiringProductWithId } from "@/app/lib/types";
import { formatDateTime } from "@/app/lib/utils";
import {
  resolveBakeryProducts,
  type BakeryResolvedRow,
} from "@/app/lib/bakeryProductBarcodes";
import { getBakeryFullImageUrl } from "@/app/lib/bakeryFullImage";
import { catalogProductMatchesBarcode } from "@/app/lib/catalogBarcodeMatch";
import {
  filterCatalogProductsForHesaplama,
  filterHesaplamaCandidatesBySearch,
  findCatalogProductByBarcode,
  getDefaultHesaplamaQuantityForSide,
  getFirestoreMissingExtraTotalsForProduct,
  getHesaplamaLineValueTry,
  resolveHesaplamaSideFromFirestoreTotals,
  removeHesaplamaSessionLine,
  getHesaplamaLinePricingSource,
  setHesaplamaSessionLineManualUnitPrice,
  setHesaplamaSessionLineQuantity,
  sumHesaplamaSessionLinesTry,
  upsertHesaplamaSessionLine,
  type HesaplamaLinePricingSource,
  type HesaplamaSessionLine,
} from "@/app/lib/hesaplamaRules";

/** Buton merkezinden radyal — çok baloncuk, halkalar halinde mesafe çeşitliliği */
const REF_WATER_AROUND_BUTTON_COUNT = 120;

const REF_WATER_HOVER_BUBBLE_STYLES: CSSProperties[] = Array.from(
  { length: REF_WATER_AROUND_BUTTON_COUNT },
  (_, i) => {
    const n = REF_WATER_AROUND_BUTTON_COUNT;
    const angleDeg =
      (i * 360) / n + ((i * 13) % 11) * 0.35 + ((i * 5) % 7) * 0.12;
    const ring = i % 5;
    const rPx = Math.min(78, 14 + ring * 11 + (i % 9) * 2 + (i % 4));
    return {
      "--bubble-a": `${angleDeg}deg`,
      "--bubble-delay-chunk": i % 48,
      "--bubble-r": `${rPx}px`,
      "--bubble-scale-end": 0.42 + ((i % 21) / 30),
    } as CSSProperties;
  }
);

/** Katalog ürünü (api/products) */
interface CatalogProduct {
  name: string;
  barcode: string;
  barcodes?: string[];
  imageUrl?: string;
  productId?: string;
  price?: number;
}

export type ModalType = null | "missing" | "extra";
export type TabType =
  | "missing"
  | "extra"
  | "expiring"
  | "bakery"
  | "hesaplama";

interface ToastState {
  message: string;
  type: ToastType;
  /** Otomatik kapanma süresi (ms). Verilmezse varsayılan: error 7s, success 5s */
  autoClose?: number;
}

type StockListSortKey = "name" | "barcode" | "quantity" | "totalAmount";

/** Eksik/Fazla listesi sütun tanımları — masaüstü başlık, satır ve mobil kart tek kaynaktan */
const STOCK_LIST_COLUMNS: {
  key: "name" | "barcode" | "quantity" | "notes" | "totalAmount";
  title: string;
  mobileLabel: string;
  sortKey: StockListSortKey | null;
}[] = [
  { key: "name", title: "Ürün", mobileLabel: "Ürün", sortKey: "name" },
  { key: "barcode", title: "Barkod", mobileLabel: "Barkod", sortKey: "barcode" },
  { key: "quantity", title: "Miktar", mobileLabel: "Miktar", sortKey: "quantity" },
  { key: "notes", title: "Notlar", mobileLabel: "Notlar", sortKey: null },
  {
    key: "totalAmount",
    title: "Toplam tutar",
    mobileLabel: "Toplam tutar",
    sortKey: "totalAmount",
  },
];

function formatTryPriceTRY(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Çizgili barkod görseli (EAN-13 / EAN-8 / CODE128); beyaz, yuvarlatılmış etiket. */
function BarcodeGraphicLabel({ barcode }: { barcode: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = svgRef.current;
    const raw = barcode.trim().replace(/\s+/g, "");
    if (!el || !raw) return;

    const common: Record<string, unknown> = {
      width: 1.65,
      height: 54,
      displayValue: true,
      fontSize: 13,
      fontOptions: "bold",
      textMargin: 6,
      margin: 14,
      background: "#ffffff",
      lineColor: "#111111",
    };

    try {
      if (/^\d{13}$/.test(raw)) {
        JsBarcode(el, raw, { ...common, format: "EAN13" });
      } else if (/^\d{8}$/.test(raw)) {
        JsBarcode(el, raw, { ...common, format: "EAN8" });
      } else {
        JsBarcode(el, raw, { ...common, format: "CODE128" });
      }
    } catch {
      try {
        JsBarcode(el, raw, { ...common, format: "CODE128" });
      } catch {
        /* geçersiz kod */
      }
    }
  }, [barcode]);

  return (
    <div
      className="mt-1.5 inline-block max-w-full rounded-2xl border border-zinc-200/90 bg-white p-3 shadow-sm dark:border-zinc-500 dark:bg-white"
      onClick={(e) => e.stopPropagation()}
    >
      <svg
        ref={svgRef}
        className="block h-auto max-w-[min(100%,min(320px,90vw))]"
        role="img"
        aria-label={`Barkod görseli ${barcode.trim()}`}
      />
    </div>
  );
}

/** Barkod numarası her zaman görünür; “Barkod aç” çizgili barkodu gösterir/gizler. */
function BarcodeRevealInline({ barcode }: { barcode: string }) {
  const [graphicOpen, setGraphicOpen] = useState(false);
  const bc = barcode.trim();

  return (
    <span className="inline-flex max-w-full flex-col gap-0.5 align-middle">
      <span className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1">
        <span className="break-all tabular-nums">{bc.length > 0 ? bc : "—"}</span>
        <button
          type="button"
          className="shrink-0 rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 motion-safe:transition-colors dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          onClick={(e) => {
            e.stopPropagation();
            setGraphicOpen((v) => !v);
          }}
        >
          {graphicOpen ? "Barkodu kapat" : "Barkod aç"}
        </button>
      </span>
      {graphicOpen && bc.length > 0 ? (
        <BarcodeGraphicLabel key={bc} barcode={bc} />
      ) : null}
    </span>
  );
}

/** Katalog fiyatı bilinen satırların para tutarı (miktar × birim fiyat) */
function sumStockValueByBarcode(
  list: StockItemWithId[],
  priceByBarcode: Map<string, number>
): number {
  return list.reduce((sum, item) => {
    const unit = priceByBarcode.get(item.barcode);
    if (typeof unit !== "number" || Number.isNaN(unit)) return sum;
    return sum + unit * item.quantity;
  }, 0);
}

/** Satır tutarı: fiyat yoksa metin "—", sıralamada değer null (sona) */
function getItemLineTotalTry(
  item: StockItemWithId,
  priceByBarcode: Map<string, number>
): { text: string; sortValue: number | null } {
  const unit = priceByBarcode.get(item.barcode);
  if (typeof unit !== "number" || Number.isNaN(unit)) {
    return { text: "—", sortValue: null };
  }
  const v = unit * item.quantity;
  return { text: formatTryPriceTRY(v), sortValue: v };
}

function HesaplamaSessionLineRow({
  side,
  line,
  pricingSource,
  lineSubtotalFormatted,
  lineHasPrice,
  onQuantityCommit,
  onRemove,
  onApplyFirestore,
  onManualUnitPriceCommit,
  shelfStockDisplay,
}: {
  side: "missing" | "extra";
  line: HesaplamaSessionLine;
  pricingSource: HesaplamaLinePricingSource;
  /** Satır tutarı (miktar × birim), `formatTryPriceTRY` ile biçimli */
  lineSubtotalFormatted: string;
  lineHasPrice: boolean;
  /** Getir raf stoku metni: sayı, “…” (yükleniyor) veya “—” */
  shelfStockDisplay: string;
  onQuantityCommit: (
    side: "missing" | "extra",
    barcode: string,
    quantity: number
  ) => void;
  onRemove: (side: "missing" | "extra", barcode: string) => void;
  onApplyFirestore: (side: "missing" | "extra", barcode: string) => void;
  /** Geçici birim fiyat; `null` özel fiyatı kaldırır */
  onManualUnitPriceCommit: (
    side: "missing" | "extra",
    barcode: string,
    value: number | null
  ) => void;
}) {
  const manualInputRef = useRef<HTMLInputElement>(null);
  const focusRing =
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 motion-safe:transition-colors motion-safe:duration-150 dark:focus-visible:ring-offset-zinc-950";
  const inputId = `hesaplama-q-${side}-${line.barcode.replace(/\s+/g, "").slice(0, 48)}`;
  const manualId = `hesaplama-manual-${side}-${line.barcode.replace(/\s+/g, "").slice(0, 48)}`;

  return (
    <li className="flex flex-col gap-3 border-b border-zinc-100 px-4 py-3 last:border-b-0 dark:border-zinc-700/80 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {line.name}
        </p>
        <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          <BarcodeRevealInline barcode={line.barcode} />
        </div>
        {pricingSource === "none" ? (
          <div className="mt-2 space-y-2">
            <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
              Bu ürün için katalogda birim fiyat bulunmuyor. Hesaplama tutarı için
              geçici birim fiyat (TL/ad) girin veya satırı silin.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={manualId} className="sr-only">
                Geçici birim fiyatı TL
              </label>
              <input
                ref={manualInputRef}
                id={manualId}
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
                placeholder="Örn: 24,90"
                defaultValue={
                  line.manualUnitPriceTry !== undefined
                    ? line.manualUnitPriceTry
                    : undefined
                }
                className={`w-28 rounded-lg border border-amber-300/80 bg-white px-2 py-1.5 text-sm tabular-nums text-zinc-900 dark:border-amber-700 dark:bg-zinc-900 dark:text-zinc-100 ${focusRing}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const raw = (e.target as HTMLInputElement).value.replace(
                      ",",
                      "."
                    );
                    const n = parseFloat(raw);
                    if (Number.isFinite(n) && n >= 0) {
                      onManualUnitPriceCommit(side, line.barcode, n);
                    }
                  }
                }}
              />
              <button
                type="button"
                className={`rounded-lg border border-amber-600 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-950 ${focusRing}`}
                onClick={() => {
                  const raw =
                    manualInputRef.current?.value.replace(",", ".") ?? "";
                  const n = parseFloat(raw);
                  if (Number.isFinite(n) && n >= 0) {
                    onManualUnitPriceCommit(side, line.barcode, n);
                  }
                }}
              >
                Uygula
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-1 text-xs tabular-nums">
            {lineHasPrice ? (
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                Fiyat: {lineSubtotalFormatted}
                {pricingSource === "manual" && (
                  <span className="ml-1.5 font-normal text-emerald-700 dark:text-emerald-400">
                    (özel birim)
                  </span>
                )}
              </span>
            ) : (
              <span className="text-amber-700 dark:text-amber-400">
                Tutar hesaplanamadı
              </span>
            )}
          </p>
        )}
        {pricingSource === "manual" && lineHasPrice && (
          <button
            type="button"
            className={`mt-1.5 text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200 ${focusRing} rounded`}
            onClick={() => onManualUnitPriceCommit(side, line.barcode, null)}
          >
            Özel birim fiyatını kaldır
          </button>
        )}
        <p
          className="mt-1 text-[11px] tabular-nums leading-snug text-zinc-500 dark:text-zinc-400"
          aria-live="polite"
        >
          Güncel stok : {shelfStockDisplay}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
        <label className="sr-only" htmlFor={inputId}>
          Miktar
        </label>
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={line.quantity}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!Number.isFinite(v)) return;
            onQuantityCommit(side, line.barcode, v);
          }}
          className={`w-[5.5rem] rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm tabular-nums text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 ${focusRing}`}
        />
        <button
          type="button"
          onClick={() => onApplyFirestore(side, line.barcode)}
          className={`rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 ${focusRing}`}
          title="Firestore’daki eksik/fazla kayıt toplamını bu satıra uygula"
        >
          Kayıt toplamı
        </button>
        <button
          type="button"
          onClick={() => onRemove(side, line.barcode)}
          className={`rounded-lg p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 ${focusRing}`}
          aria-label="Satırı sil"
          title="Satırı sil"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
    </li>
  );
}

// Basit debounce hook'u — verilen değeri belirli bir gecikmeden sonra günceller
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function Home() {
  const [modalType, setModalType] = useState<ModalType>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [items, setItems] = useState<StockItemWithId[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [selectedCatalogProduct, setSelectedCatalogProduct] = useState<CatalogProduct | null>(null);
  /** Fırın sekmesinde: sadece fırın listesinden açılan ürün kartı "stok-only" görünmeli */
  const [bakeryCatalogStockOnly, setBakeryCatalogStockOnly] = useState(false);
  /** Hesaplama sekmesi — barkod / ad araması ve geçici eksik/fazla listeleri */
  const [hesaplamaSearchQuery, setHesaplamaSearchQuery] = useState("");
  const [hesaplamaMissingLines, setHesaplamaMissingLines] = useState<
    HesaplamaSessionLine[]
  >([]);
  const [hesaplamaExtraLines, setHesaplamaExtraLines] = useState<
    HesaplamaSessionLine[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("missing");
  const [editingItem, setEditingItem] = useState<StockItemWithId | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  // Sıralama state'leri
  const [sortField, setSortField] = useState<StockListSortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  // Yaklaşan SKT bildirimi
  const [expiringProductsToday, setExpiringProductsToday] = useState<ExpiringProductWithId[]>([]);
  const [showExpiringNotification, setShowExpiringNotification] = useState(false);
  const [isExpiringNotificationOpen, setIsExpiringNotificationOpen] = useState(false);
  // Yaklaşan SKT listesi (sekme için)
  const [expiringProducts, setExpiringProducts] = useState<ExpiringProductWithId[]>([]);
  const [expiringProductsLoading, setExpiringProductsLoading] = useState(false);
  const [editingExpiringProduct, setEditingExpiringProduct] = useState<ExpiringProductWithId | null>(null);
  // "Ürün Yok Bildir" gönderiminde kısa süre buton devre dışı
  const [productIssueSending, setProductIssueSending] = useState(false);
  // Ekran ortasında başarı penceresi (Bildirim gönderildi / Ürün silindi vb.) — 2 sn
  const [successModalMessage, setSuccessModalMessage] = useState<string | null>(null);
  // Eksik/Fazla sekmesindeki listeden silme onayı
  const [listDeleteConfirmItem, setListDeleteConfirmItem] = useState<StockItemWithId | null>(null);
  // Barkod Oluşturucu paneli/modalı açık mı (Faz 1.3)
  const [barkodOlusturucuOpen, setBarkodOlusturucuOpen] = useState(false);
  // Barkod Oluşturucu input değeri (Faz 2.3)
  const [barkodOlusturucuValue, setBarkodOlusturucuValue] = useState("");
  // Referans su ürünleri slide paneli (Faz 2 tetikleyici, Faz 3+ içerik)
  const [referencePanelOpen, setReferencePanelOpen] = useState(false);

  // Arama için minimum karakter sayısı
  const MIN_SEARCH_LENGTH = 2;

  // Arama için debounce süresi (ms cinsinden)
  const DEBOUNCE_DELAY = 300;

  // Debounce edilmiş arama sorgusu — ağır işlemler bu değer üzerinden çalışır
  const debouncedSearchQuery = useDebounce(searchQuery, DEBOUNCE_DELAY);

  // Başarı penceresini 2 saniye sonra kapat
  useEffect(() => {
    if (!successModalMessage) return;
    const t = setTimeout(() => setSuccessModalMessage(null), 2000);
    return () => clearTimeout(t);
  }, [successModalMessage]);

  // Katalog ürünlerini yükle
  useEffect(() => {
    setCatalogLoading(true);
    fetch("/api/products")
      .then((res) => res.json())
      .then((data: CatalogProduct[]) => {
        setCatalogProducts(Array.isArray(data) ? data : []);
        setCatalogLoading(false);
      })
      .catch(() => {
        setCatalogProducts([]);
        setCatalogLoading(false);
      });
  }, []);

  useEffect(() => {
    let isFirstLoad = true;
    let loadingTimeout: NodeJS.Timeout | null = null;
    
    // Maksimum loading süresi (5 saniye) - Firestore bağlantısı çok yavaşsa loading'i kaldır
    loadingTimeout = setTimeout(() => {
      setIsLoading(false);
    }, 5000);

    const unsubscribe = subscribeStockItems(
      (list, isFromCache) => {
        setItems(list);
        // İlk veri geldiğinde hata varsa temizle
        setFirestoreError((prev) => (prev ? null : prev));
        
        if (isFirstLoad) {
          // Cache'den geliyorsa hemen göster, server'dan geliyorsa kısa bir gecikme ile göster
          // (skeleton'un çok hızlı kaybolmasını önlemek için minimum 300ms)
          const minLoadingTime = isFromCache ? 0 : 300;
          
          setTimeout(() => {
            setIsLoading(false);
            if (loadingTimeout) {
              clearTimeout(loadingTimeout);
              loadingTimeout = null;
            }
          }, minLoadingTime);
          
          isFirstLoad = false;
        }
      },
      (error) => {
        // Firestore hata callback'i
        const errorMessage =
          error.message || "Veritabanı bağlantısında bir hata oluştu. Lütfen sayfayı yenileyin.";
        setFirestoreError(errorMessage);
        setIsLoading(false);
        if (loadingTimeout) {
          clearTimeout(loadingTimeout);
          loadingTimeout = null;
        }
      }
    );
    
    return () => {
      unsubscribe();
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
      }
    };
  }, []);

  // Bugün çıkılması gereken yaklaşan SKT ürünlerini kontrol et
  useEffect(() => {
    const checkExpiringProducts = async () => {
      try {
        // Bugünün tarihini al (YYYY-MM-DD formatında)
        const today = new Date().toISOString().split("T")[0];
        
        const response = await fetch(`/api/expiring-products?removalDate=${today}`);
        const data = await response.json();

        if (data.success && Array.isArray(data.products)) {
          setExpiringProductsToday(data.products);
          // Eğer ürün varsa bildirimi göster (ürün silinene kadar her sayfa yenilendiğinde gösterilecek)
          if (data.products.length > 0) {
            setShowExpiringNotification(true);
          } else {
            setShowExpiringNotification(false);
          }
        }
      } catch (error) {
        console.error("Yaklaşan SKT kontrolü başarısız:", error);
      }
    };

    // İlk yüklemede kontrol et
    checkExpiringProducts();

    // Her 5 dakikada bir kontrol et (300000 ms = 5 dakika)
    const interval = setInterval(checkExpiringProducts, 300000);

    return () => clearInterval(interval);
  }, []);

  // Küçük uyarı rozetini tamamen kapat
  const handleCloseExpiringAlertBadge = () => {
    setShowExpiringNotification(false);
    setIsExpiringNotificationOpen(false);
  };

  // Bildirim penceresi kapatıldığında sadece pencereyi gizle
  const handleCloseExpiringNotification = () => {
    setIsExpiringNotificationOpen(false);
  };

  // Yaklaşan SKT listesini yükle (sekme için)
  useEffect(() => {
    if (activeTab === "expiring") {
      setExpiringProductsLoading(true);
      fetch("/api/expiring-products")
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.products)) {
            setExpiringProducts(sortExpiringProductsByRemovalDate(data.products));
          }
        })
        .catch(console.error)
        .finally(() => setExpiringProductsLoading(false));
    }
  }, [activeTab]);

  // Yaklaşan SKT kaydını sil
  const handleDeleteExpiringProduct = async (id: string) => {
    if (!confirm("Bu kaydı silmek istediğinize emin misiniz?")) return;

    try {
      const response = await fetch(`/api/expiring-products/${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        setExpiringProducts((prev) =>
          sortExpiringProductsByRemovalDate(prev.filter((p) => p.id !== id))
        );
        setToast({ message: "Kayıt başarıyla silindi.", type: "success" });
      } else {
        throw new Error(data.error || "Silme başarısız");
      }
    } catch (err) {
      console.error("Kayıt silinirken hata:", err);
      setToast({
        message: err instanceof Error ? err.message : "Kayıt silinirken bir hata oluştu.",
        type: "error",
      });
    }
  };

  // Yaklaşan SKT durum / kalan gün bilgisi
  const getExpiringStatus = (
    removalDate: string
  ): { label: string; color: string } => {
    const todayStr = new Date().toISOString().split("T")[0];

    // Geçersiz tarih gelirse varsayılan
    if (!removalDate || removalDate.length !== 10) {
      return { label: "Bilinmiyor", color: "text-zinc-500" };
    }

    const today = new Date(todayStr + "T00:00:00");
    const target = new Date(removalDate + "T00:00:00");

    const diffMs = target.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    // Metin
    let label: string;
    if (diffDays === 0) {
      label = "Bugün";
    } else if (diffDays === 1) {
      label = "Yarın";
    } else if (diffDays > 1) {
      label = `${diffDays} gün sonra`;
    } else if (diffDays === -1) {
      label = "Dün";
    } else {
      label = `${Math.abs(diffDays)} gün önce`;
    }

    // Renk
    let color = "text-green-600 dark:text-green-400";
    if (diffDays === 0) {
      color = "text-orange-600 dark:text-orange-400";
    } else if (diffDays < 0) {
      color = "text-red-600 dark:text-red-400";
    }

    return { label, color };
  };

  // Yaklaşan SKT listesini "Çıkılması Gereken" en yakın -> en uzak sıralar (ISO YYYY-MM-DD)
  function sortExpiringProductsByRemovalDate(products: ExpiringProductWithId[]) {
    return [...products].sort((a, b) => {
      const d = (a.removalDate || "").localeCompare(b.removalDate || "");
      if (d !== 0) return d;
      const n = (a.productName || "").localeCompare(b.productName || "", "tr");
      if (n !== 0) return n;
      return (a.barcode || "").localeCompare(b.barcode || "");
    });
  }

  // Getir görsel URL'ini normalize et (http -> https)
  const normalizeImageUrl = (url?: string): string | undefined => {
    if (!url) return undefined;
    if (url.startsWith("http://")) {
      return url.replace("http://", "https://");
    }
    return url;
  };

  // Katalogdan ürün görselini bul (barkoda göre)
  const getCatalogProductImage = useCallback(
    (barcode: string): string | undefined => {
      const match = catalogProducts.find((p) =>
        catalogProductMatchesBarcode(p, barcode)
      );
      return normalizeImageUrl(match?.imageUrl);
    },
    [catalogProducts]
  );

  /**
   * Filtrelenmiş katalog ürünleri — arama filtresi products.json'dan ürünleri filtreler.
   * Kullanıcı arama yaptığında katalog ürünleri gösterilir.
   * Duplicate'leri temizler (aynı barcode veya productId'ye sahip ürünleri birleştirir).
   */
  const filteredCatalogProducts = useMemo(() => {
    const q = debouncedSearchQuery.trim().toLowerCase();
    if (!q || q.length < MIN_SEARCH_LENGTH) return [];
    const filtered = catalogProducts.filter((product) => {
      if ((product.name || "").toLowerCase().includes(q)) return true;
      if ((product.barcode || "").toLowerCase().includes(q)) return true;
      const alts = product.barcodes ?? [];
      return alts.some((b) => (b || "").toLowerCase().includes(q));
    });
    
    // Duplicate'leri temizle: productId varsa ona göre, yoksa barcode'a göre
    const seen = new Map<string, boolean>();
    return filtered.filter((product) => {
      const uniqueKey = product.productId || product.barcode || `index-${product.name}`;
      if (seen.has(uniqueKey)) {
        return false; // Duplicate, atla
      }
      seen.set(uniqueKey, true);
      return true;
    });
  }, [catalogProducts, debouncedSearchQuery]);

  /**
   * Filtrelenmiş Firestore kayıtları — istatistikler için kullanılır.
   * Arama yapılmadığında tüm kayıtlar gösterilir.
   * Arama yapıldığında name veya barcode alanında arama yapar.
   * Eğer katalog ürünü seçilmişse, o ürüne ait kayıtları gösterir.
   */
  const filteredItems = useMemo(() => {
    const q = debouncedSearchQuery.trim().toLowerCase();
    if (!q || q.length < MIN_SEARCH_LENGTH) return items;
    
    // Eğer katalog ürünü seçilmişse, sadece o ürüne ait kayıtları göster
    if (selectedCatalogProduct) {
      // Kayıtlar tek barkodla tutuluyor; ürünün alternatif barkodları varsa onları da eşle.
      const allowed = new Set<string>([
        selectedCatalogProduct.barcode,
        ...(selectedCatalogProduct.barcodes ?? []),
      ]);
      return items.filter((item) => allowed.has(item.barcode));
    }
    
    // Normal arama: name veya barcode içinde arama yap
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.barcode.toLowerCase().includes(q)
    );
  }, [items, debouncedSearchQuery, selectedCatalogProduct]);

  /**
   * İstatistik kartları — filteredItems'ı kullanır (tek kaynak).
   * Arama değiştiğinde otomatik olarak güncellenir.
   */
  const totalVariety = useMemo(
    () => new Set(filteredItems.map((i) => `${i.name}|${i.barcode}`)).size,
    [filteredItems]
  );
  const totalMissing = useMemo(
    () =>
      filteredItems
        .filter((i) => i.type === "missing")
        .reduce((sum, i) => sum + i.quantity, 0),
    [filteredItems]
  );
  const totalExtra = useMemo(
    () =>
      filteredItems
        .filter((i) => i.type === "extra")
        .reduce((sum, i) => sum + i.quantity, 0),
    [filteredItems]
  );

  const catalogPriceByBarcode = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of catalogProducts) {
      if (
        p.barcode &&
        typeof p.price === "number" &&
        !Number.isNaN(p.price)
      ) {
        m.set(p.barcode, p.price);
      }
    }
    return m;
  }, [catalogProducts]);

  /** Katalogda eşleşmeyen barkodlar listede gösterilmez */
  const bakeryRows = useMemo(
    () =>
      resolveBakeryProducts(catalogProducts).filter((r) => r.inCatalog),
    [catalogProducts]
  );

  const handleBakeryRowClick = useCallback(
    (row: BakeryResolvedRow) => {
      const product = catalogProducts.find((p) =>
        catalogProductMatchesBarcode(p, row.barcode)
      );
      if (product) {
        setBakeryCatalogStockOnly(true);
        setSelectedCatalogProduct(product);
      }
    },
    [catalogProducts]
  );

  const [bakeryStocks, setBakeryStocks] = useState<
    Record<string, number | null>
  >({});
  const [bakeryStocksLoading, setBakeryStocksLoading] = useState(false);
  const bakeryStockFetchGenRef = useRef(0);
  /** Hesaplama sekmesi: Getir raf stoku (`/api/getir-stock`), barkod → miktar */
  const [hesaplamaShelfStocks, setHesaplamaShelfStocks] = useState<
    Record<string, number | null>
  >({});
  const [hesaplamaShelfStocksLoading, setHesaplamaShelfStocksLoading] =
    useState(false);
  const hesaplamaShelfStockFetchGenRef = useRef(0);
  /** Fırın listesi: `public/bakery-images/{barkod}.jpg` tam ekran */
  const [bakeryLightboxBarcode, setBakeryLightboxBarcode] = useState<
    string | null
  >(null);
  const [bakeryLightboxFailed, setBakeryLightboxFailed] = useState(false);
  /** `public/bakery-images/{barkod}.jpg` dosyası olan barkodlar (API'den) */
  const [bakeryImageBarcodes, setBakeryImageBarcodes] = useState<Set<string>>(
    () => new Set()
  );
  /** Fırın: varsayılan = raf stoku 0 olanlar üstte; tıkla = az→çok → çok→az → varsayılan */
  const [bakeryRafSort, setBakeryRafSort] = useState<
    "default" | "asc" | "desc"
  >("default");

  const bakeryStocksKey = useMemo(
    () => bakeryRows.map((r) => r.barcode).join("\u0000"),
    [bakeryRows]
  );

  const fetchBakeryStockEntries = useCallback(
    async (rows: BakeryResolvedRow[]) =>
      Promise.all(
        rows.map(async (row) => {
          try {
            const res = await fetch(
              `/api/getir-stock?barcode=${encodeURIComponent(row.barcode)}`
            );
            const data = (await res.json()) as { stock?: number | null };
            if (res.ok && data && typeof data.stock === "number") {
              return [row.barcode, data.stock] as const;
            }
            if (
              res.ok &&
              data &&
              (data.stock === null || data.stock === undefined)
            ) {
              return [row.barcode, null] as const;
            }
            return [row.barcode, null] as const;
          } catch {
            return [row.barcode, null] as const;
          }
        })
      ),
    []
  );

  /** Tek barkod için Getir stoku (hesaplama satırlarında “güncel stok”). */
  const fetchGetirStockByBarcode = useCallback(
    async (barcode: string): Promise<[string, number | null]> => {
      try {
        const res = await fetch(
          `/api/getir-stock?barcode=${encodeURIComponent(barcode)}`
        );
        const data = (await res.json()) as { stock?: number | null };
        if (res.ok && data && typeof data.stock === "number") {
          return [barcode, data.stock];
        }
        if (
          res.ok &&
          data &&
          (data.stock === null || data.stock === undefined)
        ) {
          return [barcode, null];
        }
        return [barcode, null];
      } catch {
        return [barcode, null];
      }
    },
    []
  );

  const handleBakeryStockRefresh = useCallback(() => {
    if (bakeryRows.length === 0) return;
    const gen = ++bakeryStockFetchGenRef.current;
    setBakeryStocksLoading(true);
    setBakeryStocks({});
    void (async () => {
      try {
        const entries = await fetchBakeryStockEntries(bakeryRows);
        if (gen !== bakeryStockFetchGenRef.current) return;
        setBakeryStocks(
          Object.fromEntries(entries) as Record<string, number | null>
        );
        setBakeryStocksLoading(false);
        setBakeryRafSort("asc");
      } catch {
        if (gen === bakeryStockFetchGenRef.current) {
          setBakeryStocksLoading(false);
        }
      }
    })();
  }, [bakeryRows, fetchBakeryStockEntries]);

  useEffect(() => {
    if (activeTab !== "bakery" || catalogLoading) return;
    if (bakeryRows.length === 0) {
      setBakeryStocks({});
      setBakeryStocksLoading(false);
      return;
    }
    const gen = ++bakeryStockFetchGenRef.current;
    setBakeryStocksLoading(true);
    setBakeryStocks({});

    void (async () => {
      try {
        const entries = await fetchBakeryStockEntries(bakeryRows);
        if (gen !== bakeryStockFetchGenRef.current) return;
        setBakeryStocks(
          Object.fromEntries(entries) as Record<string, number | null>
        );
        setBakeryStocksLoading(false);
      } catch {
        if (gen === bakeryStockFetchGenRef.current) {
          setBakeryStocksLoading(false);
        }
      }
    })();

    return () => {
      bakeryStockFetchGenRef.current += 1;
    };
  }, [activeTab, catalogLoading, bakeryStocksKey, fetchBakeryStockEntries]);

  useEffect(() => {
    if (activeTab !== "bakery") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/bakery-images");
        const data = (await res.json()) as { barcodes?: string[] };
        if (cancelled || !res.ok || !Array.isArray(data.barcodes)) return;
        setBakeryImageBarcodes(new Set(data.barcodes.map((b) => b.trim())));
      } catch {
        /* mevcut küme kalsın */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "bakery") setBakeryRafSort("default");
  }, [activeTab]);

  useEffect(() => {
    if (!bakeryLightboxBarcode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setBakeryLightboxBarcode(null);
        setBakeryLightboxFailed(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bakeryLightboxBarcode]);

  useEffect(() => {
    if (!bakeryLightboxBarcode) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [bakeryLightboxBarcode]);

  /**
   * Eksik/fazla tablo ile aynı mantık: `gap-4`, görsel 3rem, ürün adı `1fr`,
   * barkod `minmax(8rem,10rem)`; sondaki `1fr` boş sütun kalan genişliği paylaşır
   * (eksik/fazlada notlar + toplam arasındaki gibi — sütunlar sağa yapışmaz).
   */
  const BAKERY_LIST_GRID =
    "3rem minmax(0,1fr) minmax(8rem,10rem) minmax(4rem,6rem) minmax(5rem,7rem) minmax(0,1fr)";

  const bakeryRowIndexByBarcode = useMemo(() => {
    const m = new Map<string, number>();
    bakeryRows.forEach((r, i) => m.set(r.barcode, i));
    return m;
  }, [bakeryRows]);

  const cycleBakeryRafSort = useCallback(() => {
    setBakeryRafSort((s) =>
      s === "default" ? "asc" : s === "asc" ? "desc" : "default"
    );
  }, []);

  const bakeryDisplayRows = useMemo(() => {
    const rows = [...bakeryRows];
    const idx = (r: BakeryResolvedRow) =>
      bakeryRowIndexByBarcode.get(r.barcode) ?? 0;

    const numericShelf = (r: BakeryResolvedRow): number | null => {
      if (bakeryStocksLoading) return null;
      const v = bakeryStocks[r.barcode];
      return typeof v === "number" ? v : null;
    };

    if (bakeryRafSort === "default") {
      if (bakeryStocksLoading) return rows;
      rows.sort((a, b) => {
        const sa = numericShelf(a);
        const sb = numericShelf(b);
        const aZero = sa === 0;
        const bZero = sb === 0;
        if (aZero && !bZero) return -1;
        if (!aZero && bZero) return 1;
        return idx(a) - idx(b);
      });
      return rows;
    }

    if (bakeryRafSort === "asc") {
      rows.sort((a, b) => {
        const sa = numericShelf(a);
        const sb = numericShelf(b);
        const ka = sa === null ? Number.POSITIVE_INFINITY : sa;
        const kb = sb === null ? Number.POSITIVE_INFINITY : sb;
        if (ka !== kb) return ka - kb;
        return idx(a) - idx(b);
      });
      return rows;
    }

    rows.sort((a, b) => {
      const sa = numericShelf(a);
      const sb = numericShelf(b);
      const ka = sa === null ? Number.NEGATIVE_INFINITY : sa;
      const kb = sb === null ? Number.NEGATIVE_INFINITY : sb;
      if (kb !== ka) return kb - ka;
      return idx(a) - idx(b);
    });
    return rows;
  }, [
    bakeryRows,
    bakeryRowIndexByBarcode,
    bakeryStocks,
    bakeryStocksLoading,
    bakeryRafSort,
  ]);

  const totalMissingValueTry = useMemo(
    () =>
      sumStockValueByBarcode(
        filteredItems.filter((i) => i.type === "missing"),
        catalogPriceByBarcode
      ),
    [filteredItems, catalogPriceByBarcode]
  );
  const totalExtraValueTry = useMemo(
    () =>
      sumStockValueByBarcode(
        filteredItems.filter((i) => i.type === "extra"),
        catalogPriceByBarcode
      ),
    [filteredItems, catalogPriceByBarcode]
  );

  /**
   * Sekmeli listeler — filteredItems'tan türetilir (tek kaynak).
   * Her sekme kendi tipine göre filtrelenmiş listeyi gösterir.
   */
  const missingItems = useMemo(
    () => filteredItems.filter((i) => i.type === "missing"),
    [filteredItems]
  );
  const extraItems = useMemo(
    () => filteredItems.filter((i) => i.type === "extra"),
    [filteredItems]
  );
  
  /**
   * Aktif sekmede gösterilecek liste — missingItems veya extraItems.
   * Her ikisi de filteredItems'tan türetildiği için arama ile senkron çalışır.
   * Sıralama uygulanır.
   */
  const displayItems = useMemo(() => {
    if (activeTab !== "missing" && activeTab !== "extra") {
      return [];
    }
    const items = activeTab === "missing" ? missingItems : extraItems;

    if (!sortField) return items;

    const sorted = [...items].sort((a, b) => {
      if (sortField === "totalAmount") {
        const va = getItemLineTotalTry(a, catalogPriceByBarcode);
        const vb = getItemLineTotalTry(b, catalogPriceByBarcode);
        if (va.sortValue == null && vb.sortValue == null) return 0;
        if (va.sortValue == null) return 1;
        if (vb.sortValue == null) return -1;
        if (va.sortValue < vb.sortValue)
          return sortDirection === "asc" ? -1 : 1;
        if (va.sortValue > vb.sortValue)
          return sortDirection === "asc" ? 1 : -1;
        return 0;
      }

      let aValue: string | number;
      let bValue: string | number;

      switch (sortField) {
        case "name":
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case "barcode":
          aValue = a.barcode;
          bValue = b.barcode;
          break;
        case "quantity":
          aValue = a.quantity;
          bValue = b.quantity;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [
    activeTab,
    missingItems,
    extraItems,
    sortField,
    sortDirection,
    catalogPriceByBarcode,
  ]);

  /** Hesaplama: Firestore’da eksik/fazla kaydı olan katalog ürünleri */
  const hesaplamaCandidateProducts = useMemo(
    () => filterCatalogProductsForHesaplama(catalogProducts, items),
    [catalogProducts, items]
  );

  const hesaplamaSearchResults = useMemo(() => {
    const filtered = filterHesaplamaCandidatesBySearch(
      hesaplamaCandidateProducts,
      hesaplamaSearchQuery,
      MIN_SEARCH_LENGTH
    );
    return [...filtered].sort((a, b) =>
      a.name.localeCompare(b.name, "tr", { sensitivity: "base" })
    );
  }, [hesaplamaCandidateProducts, hesaplamaSearchQuery]);

  /** Hesaplama oturumundaki benzersiz barkodlar — Getir stoku yeniden çekmek için anahtar */
  const hesaplamaShelfStockFetchKey = useMemo(() => {
    const set = new Set<string>();
    for (const l of hesaplamaMissingLines) {
      const b = l.barcode.trim();
      if (b) set.add(b);
    }
    for (const l of hesaplamaExtraLines) {
      const b = l.barcode.trim();
      if (b) set.add(b);
    }
    return [...set].sort().join("\u0000");
  }, [hesaplamaMissingLines, hesaplamaExtraLines]);

  /** Firestore özetine göre uygun hesaplama listesine ekler (tek “Listeye ekle” butonu). */
  const handleHesaplamaAddProductToSession = useCallback(
    (product: CatalogProduct) => {
      const bc = product.barcode.trim();
      if (!bc) return;
      if (
        hesaplamaMissingLines.some((l) => l.barcode === bc) ||
        hesaplamaExtraLines.some((l) => l.barcode === bc)
      ) {
        return;
      }
      const totals = getFirestoreMissingExtraTotalsForProduct(product, items);
      const side = resolveHesaplamaSideFromFirestoreTotals(totals);
      if (!side) return;
      const qty = getDefaultHesaplamaQuantityForSide(product, items, side);
      if (side === "missing") {
        setHesaplamaMissingLines((prev) =>
          upsertHesaplamaSessionLine(prev, product, qty)
        );
      } else {
        setHesaplamaExtraLines((prev) =>
          upsertHesaplamaSessionLine(prev, product, qty)
        );
      }
    },
    [items, hesaplamaMissingLines, hesaplamaExtraLines]
  );

  /** Arama satırından: barkodu eksik ve fazla oturum listelerinden çıkarır. */
  const handleHesaplamaRemoveProductFromSession = useCallback(
    (product: CatalogProduct) => {
      const bc = product.barcode.trim();
      if (!bc) return;
      setHesaplamaMissingLines((prev) => removeHesaplamaSessionLine(prev, bc));
      setHesaplamaExtraLines((prev) => removeHesaplamaSessionLine(prev, bc));
    },
    []
  );

  const handleHesaplamaResetSession = useCallback(() => {
    setHesaplamaSearchQuery("");
    setHesaplamaMissingLines([]);
    setHesaplamaExtraLines([]);
  }, []);

  const handleHesaplamaRemoveLine = useCallback(
    (side: "missing" | "extra", barcode: string) => {
      const updater = (prev: HesaplamaSessionLine[]) =>
        removeHesaplamaSessionLine(prev, barcode);
      if (side === "missing") setHesaplamaMissingLines(updater);
      else setHesaplamaExtraLines(updater);
    },
    []
  );

  const handleHesaplamaLineQuantityCommit = useCallback(
    (side: "missing" | "extra", barcode: string, quantity: number) => {
      const updater = (prev: HesaplamaSessionLine[]) =>
        setHesaplamaSessionLineQuantity(prev, barcode, quantity);
      if (side === "missing") setHesaplamaMissingLines(updater);
      else setHesaplamaExtraLines(updater);
    },
    []
  );

  const handleHesaplamaApplyFirestoreTotal = useCallback(
    (side: "missing" | "extra", barcode: string) => {
      const product = findCatalogProductByBarcode(catalogProducts, barcode);
      if (!product) return;
      const qty = getDefaultHesaplamaQuantityForSide(product, items, side);
      const updater = (prev: HesaplamaSessionLine[]) =>
        setHesaplamaSessionLineQuantity(prev, barcode, qty);
      if (side === "missing") setHesaplamaMissingLines(updater);
      else setHesaplamaExtraLines(updater);
    },
    [catalogProducts, items]
  );

  const handleHesaplamaManualUnitPriceCommit = useCallback(
    (side: "missing" | "extra", barcode: string, value: number | null) => {
      const updater = (prev: HesaplamaSessionLine[]) =>
        setHesaplamaSessionLineManualUnitPrice(prev, barcode, value);
      if (side === "missing") setHesaplamaMissingLines(updater);
      else setHesaplamaExtraLines(updater);
    },
    []
  );

  useEffect(() => {
    if (activeTab !== "hesaplama") return;
    const barcodes = hesaplamaShelfStockFetchKey
      ? hesaplamaShelfStockFetchKey.split("\u0000")
      : [];
    if (barcodes.length === 0) {
      setHesaplamaShelfStocks({});
      setHesaplamaShelfStocksLoading(false);
      return;
    }
    const gen = ++hesaplamaShelfStockFetchGenRef.current;
    setHesaplamaShelfStocksLoading(true);
    void (async () => {
      try {
        const entries = await Promise.all(
          barcodes.map((bc) => fetchGetirStockByBarcode(bc))
        );
        if (gen !== hesaplamaShelfStockFetchGenRef.current) return;
        setHesaplamaShelfStocks(
          Object.fromEntries(entries) as Record<string, number | null>
        );
      } finally {
        if (gen === hesaplamaShelfStockFetchGenRef.current) {
          setHesaplamaShelfStocksLoading(false);
        }
      }
    })();
    return () => {
      hesaplamaShelfStockFetchGenRef.current += 1;
    };
  }, [
    activeTab,
    hesaplamaShelfStockFetchKey,
    fetchGetirStockByBarcode,
  ]);

  const hesaplamaMissingValueSum = useMemo(
    () =>
      sumHesaplamaSessionLinesTry(
        hesaplamaMissingLines,
        catalogProducts,
        catalogPriceByBarcode
      ),
    [hesaplamaMissingLines, catalogProducts, catalogPriceByBarcode]
  );

  const hesaplamaExtraValueSum = useMemo(
    () =>
      sumHesaplamaSessionLinesTry(
        hesaplamaExtraLines,
        catalogProducts,
        catalogPriceByBarcode
      ),
    [hesaplamaExtraLines, catalogProducts, catalogPriceByBarcode]
  );

  const hesaplamaValueComparison = useMemo(() => {
    const m = hesaplamaMissingValueSum.sumTry;
    const e = hesaplamaExtraValueSum.sumTry;
    const diff = m - e;
    const listsEmpty =
      hesaplamaMissingLines.length === 0 && hesaplamaExtraLines.length === 0;
    if (listsEmpty) {
      return {
        listsEmpty: true as const,
        missingSumTry: m,
        extraSumTry: e,
        diffTry: diff,
      };
    }
    let higher: "missing" | "extra" | "tie";
    if (diff > 0) higher = "missing";
    else if (diff < 0) higher = "extra";
    else higher = "tie";
    return {
      listsEmpty: false as const,
      missingSumTry: m,
      extraSumTry: e,
      diffTry: diff,
      higher,
      absDiffTry: Math.abs(diff),
    };
  }, [
    hesaplamaMissingValueSum,
    hesaplamaExtraValueSum,
    hesaplamaMissingLines.length,
    hesaplamaExtraLines.length,
  ]);

  // Kısa arama kontrolü (örneğin tek karakter yazıldığında)
  const trimmedSearchQuery = debouncedSearchQuery.trim();
  const isShortSearchQuery =
    trimmedSearchQuery.length > 0 && trimmedSearchQuery.length < MIN_SEARCH_LENGTH;

  const hesaplamaQueryTrimmed = hesaplamaSearchQuery.trim();

  const handleSort = useCallback((field: StockListSortKey) => {
    if (field === "totalAmount") {
      if (sortField === "totalAmount") {
        setSortDirection((d) => (d === "desc" ? "asc" : "desc"));
      } else {
        setSortField("totalAmount");
        setSortDirection("desc");
      }
      return;
    }
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  }, [sortField, sortDirection]);

  const handleDelete = useCallback(
    async (item: StockItemWithId, options?: { skipConfirm?: boolean }) => {
      if (!options?.skipConfirm && !confirm("Bu ürünü silmek istediğinize emin misiniz?"))
        return;
      try {
      setDeletingId(item.id);
      await deleteStockItem(item.id);
      setSuccessModalMessage("Ürün başarıyla silindi.");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Ürün silinirken bir hata oluştu.";
      setToast({ message: errorMessage, type: "error" });
    } finally {
      setDeletingId(null);
    }
  },
    []
  );

  const handleEdit = useCallback((item: StockItemWithId) => {
    setEditingItem(item);
  }, []);

  const handleItemClick = useCallback(
    (item: StockItemWithId) => {
      const fromCatalog = catalogProducts.find((p) => p.barcode === item.barcode);
      const catalogProduct: CatalogProduct = {
        name: item.name,
        barcode: item.barcode,
        imageUrl: item.imageUrl ?? fromCatalog?.imageUrl,
        productId: fromCatalog?.productId,
        price: fromCatalog?.price,
      };
      setBakeryCatalogStockOnly(false);
      setSelectedCatalogProduct(catalogProduct);
    },
    [catalogProducts]
  );

  // Tüm sayfa boş mu? (henüz hiç ürün eklenmemiş)
  const isPageEmpty = !isLoading && items.length === 0;

  return (
    <div className="flex w-full flex-col gap-6">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 sm:text-2xl">
        Stok Takip Paneli
      </h1>

      {/* Firestore hata mesajı */}
      {firestoreError && (
        <ErrorMessage
          message={firestoreError}
          onDismiss={() => setFirestoreError(null)}
          ariaLive="assertive"
        />
      )}

      {/* Toast bildirimi */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 w-full max-w-md">
          <Toast
            message={toast.message}
            type={toast.type}
            onDismiss={() => setToast(null)}
            autoClose={toast.autoClose ?? (toast.type === "error" ? 7000 : 5000)}
          />
        </div>
      )}

      {/* Ekran ortasında başarı penceresi (Bildirim gönderildi / Ürün silindi vb.) */}
      {successModalMessage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          aria-modal="true"
          aria-labelledby="success-modal-title"
          role="dialog"
        >
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-600 dark:bg-zinc-800 sm:p-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <CheckCircle2 className="size-12 text-green-600 dark:text-green-400" aria-hidden />
              <p id="success-modal-title" className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
                {successModalMessage}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Sıra: 1) Barkod Oluşturucu butonu (Faz 1.1–1.3), 2) Sticky arama, 3) Altında içerik */}
      <section aria-label="Ekleme ve arama" className="flex flex-col gap-4">
        <div>
          <button
            type="button"
            onClick={() => setBarkodOlusturucuOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-zinc-300 bg-white px-5 py-4 text-base font-medium text-zinc-800 shadow-sm transition-all duration-200 hover:border-zinc-400 hover:bg-zinc-50 hover:scale-[1.01] active:scale-[0.99] dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:border-zinc-500 dark:hover:bg-zinc-700 sm:py-5 sm:text-lg min-h-[44px]"
            aria-label="Barkod oluşturucuyu aç"
          >
            <Barcode className="size-6 shrink-0" aria-hidden />
            Barkod Oluşturucu
          </button>
        </div>
        {/* Sticky arama: scroll'da üstte sabit kalır */}
        <div 
          className="sticky top-0 z-10 -mx-4 px-4 py-4 shadow-md backdrop-blur-sm sm:-mx-6 sm:px-6 sm:py-3 lg:-mx-8 lg:px-8" 
          style={{ backgroundColor: "var(--background)" }}
        >
          <SearchBar
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery("")}
            onScanClick={() => setIsScannerOpen(true)}
          />
        </div>
      </section>

      <BarcodeScanner
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={(barcode) => {
          setSearchQuery(barcode);
          setIsScannerOpen(false);
        }}
      />

      {/* Barkod Oluşturucu — modal bileşeni (Faz 2.1–2.3) */}
      <BarkodOlusturucuModal
        isOpen={barkodOlusturucuOpen}
        onClose={() => setBarkodOlusturucuOpen(false)}
        value={barkodOlusturucuValue}
        onChange={setBarkodOlusturucuValue}
        onSendToSearch={(barcode) => {
          setSearchQuery(barcode);
          setBarkodOlusturucuOpen(false);
        }}
      />

      <AddProductModal
        isOpen={modalType !== null || editingItem !== null || selectedCatalogProduct !== null}
        onClose={() => {
          setModalType(null);
          setEditingItem(null);
          setSelectedCatalogProduct(null);
          setBakeryCatalogStockOnly(false);
        }}
        type={
          editingItem
            ? editingItem.type
            : selectedCatalogProduct
            ? activeTab === "extra"
              ? "extra"
              : "missing"
            : modalType === "extra"
            ? "extra"
            : "missing"
        }
        initialItem={editingItem ?? undefined}
        catalogProduct={selectedCatalogProduct ?? undefined}
        stockItems={items}
        onAddFromCatalog={(product, addType) => {
          setBakeryCatalogStockOnly(false);
          setSelectedCatalogProduct(product);
          setModalType(addType);
        }}
        onEditItem={(item) => {
          setEditingItem(item);
          // Katalog görünümünden çık ve düzenleme moduna geç
          setSelectedCatalogProduct(null);
          setBakeryCatalogStockOnly(false);
        }}
        onDeleteItem={(item) => {
          // Ürün kartında zaten "Kaydı sil" modalı ile onay alındı, tekrar confirm gösterme
          void handleDelete(item, { skipConfirm: true });
        }}
        onSuccess={(message) => {
          setSuccessModalMessage(message);
          setSelectedCatalogProduct(null);
          setBakeryCatalogStockOnly(false);
        }}
        bakeryCatalogCard={
          activeTab === "bakery" &&
          bakeryCatalogStockOnly &&
          selectedCatalogProduct !== null &&
          editingItem === null
        }
      />

      {/* Orta bölüm: istatistik kartları */}
      {!isPageEmpty && (
        <section aria-label="İstatistikler" className="flex flex-col gap-4">
          {isLoading ? (
            <StatCardSkeleton />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800"
              role="group"
              aria-label="Toplam ürün çeşidi"
            >
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Toplam Ürün Çeşidi
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50 sm:text-3xl">
                {totalVariety}
              </p>
            </div>
            <div
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800"
              style={{ borderTopWidth: "3px", borderTopColor: "var(--color-missing)" }}
              role="group"
              aria-label="Toplam eksik ürün miktarı"
            >
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Toplam Eksik Ürün Miktarı
              </p>
              <p
                className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-2xl font-semibold tabular-nums sm:text-3xl"
                style={{ color: "var(--color-missing)" }}
              >
                <span>{totalMissing}</span>
                <span
                  className="text-lg font-semibold sm:text-2xl"
                  style={{ color: "var(--color-missing)" }}
                >
                  ({formatTryPriceTRY(totalMissingValueTry)})
                </span>
              </p>
            </div>
            <div
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800"
              style={{ borderTopWidth: "3px", borderTopColor: "var(--color-extra)" }}
              role="group"
              aria-label="Toplam fazla ürün miktarı"
            >
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Toplam Fazla Ürün Miktarı
              </p>
              <p
                className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-2xl font-semibold tabular-nums sm:text-3xl"
                style={{ color: "var(--color-extra)" }}
              >
                <span>{totalExtra}</span>
                <span
                  className="text-lg font-semibold sm:text-2xl"
                  style={{ color: "var(--color-extra)" }}
                >
                  ({formatTryPriceTRY(totalExtraValueTry)})
                </span>
              </p>
            </div>
          </div>
          )}
        </section>
      )}

      {/* Alt bölüm: Arama sonuçları veya sekmeli listeler (Hesaplama sekmesi boş DB’de de erişilebilsin diye her zaman) */}
      <section aria-label="Ürün listeleri" className="flex flex-col gap-4">
          {/* Arama yapıldığında: Sadece arama sonuçları göster */}
          {searchQuery.trim() ? (
            <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
              <div className="min-h-[120px]">
                {isShortSearchQuery ? (
                  <EmptyState
                    title="Arama için daha fazla karakter yazın"
                    message={`En az ${MIN_SEARCH_LENGTH} karakter yazmalısın.`}
                    icon={PackageSearch}
                  />
                ) : isLoading || catalogLoading ? (
                  <ListSkeleton />
                ) : filteredCatalogProducts.length > 0 ? (
                  // Arama sonuçları: Katalog ürünleri
                  <div
                    className="max-h-[55vh] min-h-[8rem] overflow-auto"
                    aria-label="Arama sonuçları"
                  >
                    <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
                    {filteredCatalogProducts.map((product, index) => {
                      // Bu ürün için Firestore'daki eksik/fazla kayıtlarını bul
                      const productItems = items.filter((item) => item.barcode === product.barcode);
                      const missingItems = productItems.filter((item) => item.type === "missing");
                      const extraItems = productItems.filter((item) => item.type === "extra");
                      const totalMissing = missingItems.reduce((sum, item) => sum + item.quantity, 0);
                      const totalExtra = extraItems.reduce((sum, item) => sum + item.quantity, 0);
                      
                      // Ürün durumu: eksik/fazla kontrolü (renk kodlaması için)
                      const hasMissing = missingItems.length > 0;
                      const hasExtra = extraItems.length > 0;
                      
                      // Renk kodlaması mantığı
                      let cardColorClass = ""; // Varsayılan: neutral/gri
                      let cardBorderColor = "";
                      let hoverColorClass = "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"; // Varsayılan hover
                      if (hasExtra && !hasMissing) {
                        // Sadece fazla eklenmişse: Yeşil
                        cardColorClass = "bg-green-50 dark:bg-green-900/20";
                        cardBorderColor = "border-green-500";
                        hoverColorClass = "hover:bg-green-100 dark:hover:bg-green-900/30";
                      } else if (hasMissing && !hasExtra) {
                        // Sadece eksik eklenmişse: Kırmızı
                        cardColorClass = "bg-red-50 dark:bg-red-900/20";
                        cardBorderColor = "border-red-500";
                        hoverColorClass = "hover:bg-red-100 dark:hover:bg-red-900/30";
                      }
                      // Hem eksik hem fazla varsa veya hiçbiri yoksa: Varsayılan renk (cardColorClass boş kalır)
                      
                      // En son eklenme veya güncellenme tarihini bul
                      const latestDate = productItems.length > 0
                        ? productItems.reduce((latest, item) => {
                            const itemDate = item.updatedAt || item.createdAt;
                            if (!itemDate) return latest;
                            const itemTime = new Date(itemDate).getTime();
                            const latestTime = latest ? new Date(latest).getTime() : 0;
                            return itemTime > latestTime ? itemDate : latest;
                          }, null as string | null)
                        : null;

                      // Unique key oluştur: productId varsa onu kullan, yoksa barcode, o da yoksa index
                      const uniqueKey = product.productId || product.barcode || `product-${index}`;

                      return (
                        <button
                          key={uniqueKey}
                          type="button"
                          onClick={() => {
                            setBakeryCatalogStockOnly(false);
                            setSelectedCatalogProduct(product);
                          }}
                          className={`w-full text-left transition-colors duration-150 border-l-4 ${cardBorderColor || "border-transparent"} ${cardColorClass || ""} ${hoverColorClass}`}
                        >
                          {/* Mobil görünüm: Kart layout */}
                          <div className={`flex gap-3 px-4 py-3 sm:hidden ${cardColorClass || ""}`}>
                            <div className="shrink-0">
                              {product.imageUrl ? (
                                <img
                                  src={product.imageUrl}
                                  alt={product.name}
                                  className="size-16 rounded-lg object-cover"
                                  width={64}
                                  height={64}
                                  loading="lazy"
                                />
                              ) : (
                                <div className="size-16 rounded-lg bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
                                  <PackageX className="size-7 text-zinc-400 dark:text-zinc-500" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1 flex flex-col gap-2">
                              <div className="font-medium text-zinc-900 dark:text-zinc-100 text-sm leading-snug line-clamp-2">
                                {product.name}
                              </div>
                              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                <span className="font-medium">Barkod:</span>{" "}
                                <BarcodeRevealInline barcode={product.barcode} />
                              </div>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                                <span>
                                  <span className="text-zinc-500 dark:text-zinc-400">Eksik: </span>
                                  <span className="font-semibold tabular-nums text-base" style={{ color: "var(--color-missing)" }}>
                                    {totalMissing}
                                  </span>
                                </span>
                                <span>
                                  <span className="text-zinc-500 dark:text-zinc-400">Fazla: </span>
                                  <span className="font-semibold tabular-nums text-base" style={{ color: "var(--color-extra)" }}>
                                    {totalExtra}
                                  </span>
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          {/* Desktop görünüm: Grid layout */}
                          <div
                            className={`hidden sm:grid gap-4 px-4 py-4 text-sm ${cardColorClass || ""}`}
                            style={{ 
                              gridTemplateColumns: "3rem minmax(0,1fr) minmax(8rem,10rem) minmax(6rem,8rem) minmax(6rem,8rem)",
                            }}
                          >
                            <span className="flex items-center justify-center">
                              {product.imageUrl ? (
                                <img
                                  src={product.imageUrl}
                                  alt={product.name}
                                  className="size-10 rounded object-cover"
                                  width={40}
                                  height={40}
                                  loading="lazy"
                                />
                              ) : (
                                <div className="size-10 rounded bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
                                  <PackageX className="size-5 text-zinc-400 dark:text-zinc-500" />
                                </div>
                              )}
                            </span>
                            <span className="min-w-0 font-medium text-zinc-900 dark:text-zinc-100 text-left">
                              {product.name}
                            </span>
                            <span className="min-w-0 text-left text-zinc-600 dark:text-zinc-300">
                              <BarcodeRevealInline barcode={product.barcode} />
                            </span>
                            <span className="text-left">
                              <span className="text-xs text-zinc-500 dark:text-zinc-400">Eksik: </span>
                              <span className="font-semibold tabular-nums" style={{ color: "var(--color-missing)" }}>
                                {totalMissing}
                              </span>
                            </span>
                            <span className="text-left">
                              <span className="text-xs text-zinc-500 dark:text-zinc-400">Fazla: </span>
                              <span className="font-semibold tabular-nums" style={{ color: "var(--color-extra)" }}>
                                {totalExtra}
                              </span>
                            </span>
                          </div>
                          {latestDate && (
                            <div
                              className="col-span-5 mt-1 text-xs text-zinc-400 dark:text-zinc-500"
                              style={{ gridColumn: "span 5" }}
                            >
                              {productItems.some(item => item.updatedAt && item.updatedAt === latestDate)
                                ? <>Son Güncelleme: {formatDateTime(latestDate)}</>
                                : <>Son Eklenme: {formatDateTime(latestDate)}</>
                              }
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                // Faz 1.1 / 1.2: Arama sonucu boş. Faz 1.4: "Ürün Yok Bildir" sadece barkod benzeri aramada (6+ karakter)
                <div className="flex flex-col gap-4 p-4">
                  <EmptyState
                    title="Arama sonucu bulunamadı"
                    message={`"${searchQuery}" için sonuç bulunamadı. Farklı bir arama terimi deneyin.`}
                    icon={PackageSearch}
                  />
                  {searchQuery.trim().length >= 6 && (
                    <button
                      type="button"
                      disabled={productIssueSending}
                      onClick={async () => {
                        const barcode = searchQuery.trim();
                        if (!barcode || productIssueSending) return;
                        setProductIssueSending(true);
                        try {
                          const res = await fetch("/api/telegram/product-issue", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              type: "product_missing",
                              barcode,
                              source: "search_no_results",
                            }),
                          });
                          const data = await res.json().catch(() => ({}));
                          if (res.ok && data?.success) {
                            setSuccessModalMessage("Bildirim gönderildi.");
                          } else {
                            setToast({
                              message: data?.error ?? "Bildirim gönderilemedi.",
                              type: "error",
                            });
                          }
                        } catch {
                          setToast({ message: "Bildirim gönderilemedi.", type: "error" });
                        } finally {
                          setProductIssueSending(false);
                        }
                      }}
                      className="flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 transition hover:bg-red-100 disabled:opacity-60 disabled:pointer-events-none dark:border-red-700 dark:bg-red-900/30 dark:text-red-200 dark:hover:bg-red-900/50 min-h-[44px]"
                      aria-label="Bu barkod için katalogda ürün bulunamadı. Bildirim göndermek için tıklayın."
                      title="Bu barkod için katalogda ürün bulunamadı. Bildirim göndermek için tıklayın."
                    >
                      <AlertTriangle className="size-5 shrink-0" aria-hidden />
                      {productIssueSending ? "Gönderiliyor…" : "Ürün Yok Bildir"}
                    </button>
                  )}
                </div>
                )}
              </div>
            </div>
          ) : (
            /* Arama yapılmadığında: Sekmeli listeler göster */
        <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
          <div
            role="tablist"
            aria-label="Eksik, fazla, yaklaşan SKT, fırın ürünleri ve hesaplama"
            className="flex flex-wrap gap-0 border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "missing"}
              aria-controls="panel-missing"
              id="tab-missing"
              onClick={() => setActiveTab("missing")}
              className={`relative px-4 py-4 text-sm font-medium transition min-h-[44px] sm:px-6 sm:py-4 sm:text-base ${
                activeTab === "missing"
                  ? "text-[var(--color-missing)]"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              Eksik Ürünler
              {activeTab === "missing" && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-missing)]"
                  aria-hidden
                />
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "extra"}
              aria-controls="panel-extra"
              id="tab-extra"
              onClick={() => setActiveTab("extra")}
              className={`relative px-4 py-4 text-sm font-medium transition min-h-[44px] sm:px-6 sm:py-4 sm:text-base ${
                activeTab === "extra"
                  ? "text-[var(--color-extra)]"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              Fazla Ürünler
              {activeTab === "extra" && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-extra)]"
                  aria-hidden
                />
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "expiring"}
              aria-controls="panel-expiring"
              id="tab-expiring"
              onClick={() => setActiveTab("expiring")}
              className={`relative px-4 py-4 text-sm font-medium transition min-h-[44px] sm:px-6 sm:py-4 sm:text-base ${
                activeTab === "expiring"
                  ? "text-orange-600 dark:text-orange-400"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              Yaklaşan SKT
              {activeTab === "expiring" && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600 dark:bg-orange-400"
                  aria-hidden
                />
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "bakery"}
              aria-controls="panel-bakery"
              id="tab-bakery"
              onClick={() => setActiveTab("bakery")}
              className={`relative px-4 py-4 text-sm font-medium transition min-h-[44px] sm:px-6 sm:py-4 sm:text-base ${
                activeTab === "bakery"
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <ChefHat className="size-4 shrink-0 opacity-80" aria-hidden />
                Fırın ürünleri
              </span>
              {activeTab === "bakery" && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-600 dark:bg-amber-400"
                  aria-hidden
                />
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "hesaplama"}
              aria-controls="panel-hesaplama"
              id="tab-hesaplama"
              onClick={() => setActiveTab("hesaplama")}
              className={`relative rounded-md px-4 py-4 text-sm font-medium motion-safe:transition-colors min-h-[44px] sm:px-6 sm:py-4 sm:text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950 ${
                activeTab === "hesaplama"
                  ? "text-violet-700 dark:text-violet-400"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <Calculator className="size-4 shrink-0 opacity-80" aria-hidden />
                Hesaplama
              </span>
              {activeTab === "hesaplama" && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-600 dark:bg-violet-400"
                  aria-hidden
                />
              )}
            </button>
          </div>
          <div
            role="tabpanel"
            id={
              activeTab === "missing"
                ? "panel-missing"
                : activeTab === "extra"
                  ? "panel-extra"
                  : activeTab === "expiring"
                    ? "panel-expiring"
                    : activeTab === "bakery"
                      ? "panel-bakery"
                      : activeTab === "hesaplama"
                        ? "panel-hesaplama"
                        : "panel-missing"
            }
            aria-labelledby={
              activeTab === "missing"
                ? "tab-missing"
                : activeTab === "extra"
                  ? "tab-extra"
                  : activeTab === "expiring"
                    ? "tab-expiring"
                    : activeTab === "bakery"
                      ? "tab-bakery"
                      : activeTab === "hesaplama"
                        ? "tab-hesaplama"
                        : "tab-missing"
            }
            className="min-h-[120px]"
          >
            {activeTab === "expiring" ? (
              // Yaklaşan SKT sekmesi
              <div className="max-h-[55vh] min-h-[8rem] overflow-auto">
                {expiringProductsLoading ? (
                  <ListSkeleton />
                ) : expiringProducts.length === 0 ? (
                  <EmptyState
                    title="Yaklaşan SKT kaydı yok"
                    message="Henüz yaklaşan SKT kaydı eklenmemiş. Ürün kartından 'Yaklaşan SKT Olarak İşaretle' butonunu kullanarak kayıt ekleyebilirsiniz."
                    icon={Calendar}
                  />
                ) : (
                  <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
                    {/* Başlık satırı — sadece desktop'ta göster */}
                    <div className="hidden sm:grid sticky top-0 z-10 gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-left text-sm font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400"
                      style={{ gridTemplateColumns: "minmax(0,1fr) minmax(8rem,10rem) minmax(8rem,10rem) minmax(8rem,10rem) minmax(6rem,8rem) minmax(5rem,6rem)" }}
                    >
                      <span>Ürün Adı</span>
                      <span>Barkod</span>
                      <span>SKT Tarihi</span>
                      <span>Çıkılması Gereken</span>
                      <span>Durum</span>
                      <span className="text-right">İşlem</span>
                    </div>
                    {/* Liste */}
                    <ul role="list">
                      {expiringProducts.map((product) => {
                        const status = getExpiringStatus(product.removalDate);
                        const imageUrl = getCatalogProductImage(product.barcode);
                        return (
                          <li
                            key={product.id}
                            className="transition-colors duration-150 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                          >
                            {/* Mobil görünüm: Kart layout */}
                            <div className="flex gap-3 px-4 py-3 sm:hidden">
                              {/* Ürün görseli */}
                              <div className="shrink-0">
                                {imageUrl ? (
                                  <div className="relative h-12 w-12 rounded-lg overflow-hidden border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
                                    <Image
                                      src={imageUrl}
                                      alt={product.productName}
                                      fill
                                      className="object-contain p-1"
                                      sizes="48px"
                                    />
                                  </div>
                                ) : (
                                  <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-500">
                                    <PackageSearch className="size-5" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                                  {product.productName}
                                </p>
                                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                                  <span className="font-medium">Barkod:</span>{" "}
                                  <BarcodeRevealInline barcode={product.barcode} />
                                </p>
                                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                                  SKT: {product.expiryDate}
                                </p>
                                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                                  Çıkılması Gereken: {product.removalDate}
                                </p>
                                <p className="mt-1 text-sm">
                                  <span className={`font-medium ${status.color}`}>{status.label}</span>
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingExpiringProduct(product);
                                  }}
                                  className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                                  aria-label="Düzenle"
                                >
                                  <Pencil className="size-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteExpiringProduct(product.id);
                                  }}
                                  className="rounded-lg p-1.5 text-red-600 transition hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/30 dark:hover:text-red-200"
                                  aria-label="Sil"
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              </div>
                            </div>
                            {/* Desktop görünüm: Tablo satırı */}
                            <div
                              className="hidden sm:grid gap-4 px-4 py-3 text-sm"
                              style={{
                                gridTemplateColumns:
                                  "minmax(0,1.4fr) minmax(8rem,10rem) minmax(8rem,10rem) minmax(8rem,10rem) minmax(6rem,8rem) minmax(5rem,6rem)",
                              }}
                            >
                              <span className="flex items-center gap-3 font-medium text-zinc-900 dark:text-zinc-50">
                                {imageUrl ? (
                                  <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
                                    <Image
                                      src={imageUrl}
                                      alt={product.productName}
                                      fill
                                      className="object-contain p-1"
                                      sizes="40px"
                                    />
                                  </span>
                                ) : (
                                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-500">
                                    <PackageSearch className="size-5" />
                                  </span>
                                )}
                                <span className="line-clamp-2">{product.productName}</span>
                              </span>
                              <span className="min-w-0 text-zinc-600 dark:text-zinc-400">
                                <BarcodeRevealInline barcode={product.barcode} />
                              </span>
                              <span className="text-zinc-600 dark:text-zinc-400">{product.expiryDate}</span>
                              <span className="text-zinc-600 dark:text-zinc-400">{product.removalDate}</span>
                              <span className={`font-medium ${status.color}`}>{status.label}</span>
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingExpiringProduct(product)}
                                  className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                                  aria-label="Düzenle"
                                >
                                  <Pencil className="size-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteExpiringProduct(product.id)}
                                  className="rounded-lg p-1.5 text-red-600 transition hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/30 dark:hover:text-red-200"
                                  aria-label="Sil"
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            ) : activeTab === "bakery" ? (
              catalogLoading ? (
                <ListSkeleton />
              ) : (
                <div
                  className="flex max-h-[55vh] min-h-[8rem] flex-col overflow-hidden"
                  aria-label="Fırın ürünleri listesi"
                >
                  {bakeryRows.length === 0 ? (
                    <EmptyState
                      title="Fırın listesinde eşleşen ürün yok"
                      message="Fırın barkodlarında katalogda bulunan ürün henüz yok. products.json / kataloğa eklendikten sonra burada listelenir."
                      icon={ChefHat}
                    />
                  ) : (
                    <>
                      <div className="shrink-0 border-b border-amber-900/20 bg-zinc-50 dark:border-amber-900/40 dark:bg-zinc-900/40">
                        <div
                          className="hidden w-full items-center gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-left text-sm font-medium uppercase tracking-wide text-zinc-500 sm:grid dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400"
                          style={{ gridTemplateColumns: BAKERY_LIST_GRID }}
                          role="row"
                        >
                          <span className="min-w-[3rem]" aria-hidden />
                          <span role="columnheader" className="min-w-0 text-left">
                            Ürün adı
                          </span>
                          <span role="columnheader" className="min-w-0 text-left">
                            Barkod
                          </span>
                          <button
                            type="button"
                            onClick={cycleBakeryRafSort}
                            className={`flex min-w-0 items-center gap-1 text-left uppercase tracking-wide transition-colors hover:text-zinc-700 dark:hover:text-zinc-200 ${
                              bakeryRafSort !== "default"
                                ? "text-zinc-900 dark:text-zinc-100"
                                : ""
                            }`}
                            aria-label="Raf stoğa göre sırala: önce sıfır stok, azdan çoka, çoktan aza"
                          >
                            <span>Raf stok</span>
                            {bakeryRafSort === "asc" ? (
                              <ArrowUp className="size-3 shrink-0" aria-hidden />
                            ) : bakeryRafSort === "desc" ? (
                              <ArrowDown className="size-3 shrink-0" aria-hidden />
                            ) : null}
                          </button>
                          <span
                            role="columnheader"
                            className="min-w-0 text-left"
                          >
                            Donuk stok
                          </span>
                          <div className="flex min-w-0 items-center justify-end">
                            <button
                              type="button"
                              onClick={handleBakeryStockRefresh}
                              disabled={bakeryStocksLoading}
                              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
                              aria-label="Raf stoklarını yenile"
                              title="Raf stoklarını yenile"
                            >
                              <RefreshCw
                                className={`size-4 ${bakeryStocksLoading ? "animate-spin" : ""}`}
                                aria-hidden
                              />
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50/90 px-3 py-2 sm:hidden dark:border-zinc-700 dark:bg-zinc-900/40">
                        <button
                          type="button"
                          onClick={cycleBakeryRafSort}
                          className="min-w-0 text-left text-xs font-medium text-amber-900/90 underline-offset-2 hover:underline dark:text-amber-200/90"
                        >
                          Raf stok sırası:{" "}
                          {bakeryRafSort === "default"
                            ? "Önce 0"
                            : bakeryRafSort === "asc"
                              ? "Az → çok"
                              : "Çok → az"}
                        </button>
                        <button
                          type="button"
                          onClick={handleBakeryStockRefresh}
                          disabled={bakeryStocksLoading}
                          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
                          aria-label="Raf stoklarını yenile"
                          title="Raf stoklarını yenile"
                        >
                          <RefreshCw
                            className={`size-4 ${bakeryStocksLoading ? "animate-spin" : ""}`}
                            aria-hidden
                          />
                        </button>
                      </div>
                      <ul
                        role="list"
                        className="min-h-0 flex-1 overflow-auto divide-y divide-zinc-200 dark:divide-zinc-700"
                      >
                        {bakeryDisplayRows.map((row) => {
                            const imageUrl = getCatalogProductImage(row.barcode);
                            const shelf = bakeryStocks[row.barcode];
                            const shelfText = bakeryStocksLoading
                              ? "…"
                              : shelf === null || shelf === undefined
                                ? "—"
                                : String(shelf);
                            const hasBakeryFullImage = bakeryImageBarcodes.has(
                              row.barcode.trim()
                            );
                            const openBakeryFullImage = () => {
                              if (!hasBakeryFullImage) return;
                              setBakeryLightboxFailed(false);
                              setBakeryLightboxBarcode(row.barcode);
                            };
                            const thumbSm = imageUrl ? (
                              <img
                                src={imageUrl}
                                alt=""
                                className="size-16 rounded-lg object-cover"
                                width={64}
                                height={64}
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex size-16 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
                                <ChefHat className="size-7 text-zinc-400 dark:text-zinc-500" />
                              </div>
                            );
                            const thumbLg = imageUrl ? (
                              <img
                                src={imageUrl}
                                alt=""
                                className="size-10 rounded object-cover"
                                width={40}
                                height={40}
                                loading="lazy"
                              />
                            ) : (
                              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
                                <ChefHat className="size-5 text-zinc-400" />
                              </span>
                            );
                            const isRafZeroRow =
                              !bakeryStocksLoading &&
                              typeof shelf === "number" &&
                              shelf === 0;
                            return (
                              <li
                                key={row.barcode}
                                className={`transition-colors duration-150 ${
                                  isRafZeroRow
                                    ? "mx-2 my-1.5 overflow-hidden rounded-xl border-2 border-red-300/90 bg-red-50 shadow-sm hover:bg-red-100/95 dark:border-red-800/85 dark:bg-red-950/50 dark:shadow-none dark:hover:bg-red-950/65"
                                    : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                                }`}
                              >
                                <div className="flex gap-3 px-4 py-3 sm:hidden">
                                  {hasBakeryFullImage ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openBakeryFullImage();
                                      }}
                                      className="shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950"
                                      aria-label={`${row.displayName} — tam ekran görsel (fırın)`}
                                    >
                                      {thumbSm}
                                    </button>
                                  ) : (
                                    <span className="shrink-0 rounded-lg">
                                      {thumbSm}
                                    </span>
                                  )}
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    className="min-w-0 flex-1 cursor-pointer text-left"
                                    onClick={() => handleBakeryRowClick(row)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        handleBakeryRowClick(row);
                                      }
                                    }}
                                    aria-label={`${row.displayName}, barkod ${row.barcode}, ürün kartını aç`}
                                  >
                                    <p className="text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
                                      {row.displayName}
                                    </p>
                                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                      <span className="font-medium">Barkod:</span>{" "}
                                      <BarcodeRevealInline barcode={row.barcode} />
                                    </p>
                                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                                      Raf stok (Getir):{" "}
                                      <span
                                        className={`font-semibold tabular-nums ${
                                          isRafZeroRow
                                            ? "text-red-700 dark:text-red-300"
                                            : ""
                                        }`}
                                      >
                                        {shelfText}
                                      </span>
                                    </p>
                                    <p className="mt-0.5 text-xs text-zinc-500">
                                      Donuk stok: —
                                    </p>
                                  </div>
                                </div>
                                <div
                                  className="hidden w-full items-center gap-4 px-4 py-3 text-sm sm:grid"
                                  style={{
                                    gridTemplateColumns: BAKERY_LIST_GRID,
                                  }}
                                >
                                  <span className="flex items-center justify-center">
                                    {hasBakeryFullImage ? (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openBakeryFullImage();
                                        }}
                                        className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950"
                                        aria-label={`${row.displayName} — tam ekran görsel (fırın)`}
                                      >
                                        {thumbLg}
                                      </button>
                                    ) : (
                                      <span className="rounded-lg">
                                        {thumbLg}
                                      </span>
                                    )}
                                  </span>
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    className="grid min-h-[44px] min-w-0 cursor-pointer items-center gap-4 text-left"
                                    style={{
                                      gridColumn: "2 / 6",
                                      gridTemplateColumns:
                                        "minmax(0,1fr) minmax(8rem,10rem) minmax(4rem,6rem) minmax(5rem,7rem)",
                                    }}
                                    onClick={() => handleBakeryRowClick(row)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        handleBakeryRowClick(row);
                                      }
                                    }}
                                    aria-label={`${row.displayName}, barkod ${row.barcode}, ürün kartını aç`}
                                  >
                                    <span className="line-clamp-2 min-w-0 font-medium text-zinc-900 dark:text-zinc-100">
                                      {row.displayName}
                                    </span>
                                    <span className="min-w-0 tabular-nums text-zinc-600 dark:text-zinc-300">
                                      <BarcodeRevealInline barcode={row.barcode} />
                                    </span>
                                    <span
                                      className={`tabular-nums text-zinc-800 dark:text-zinc-200 ${
                                        isRafZeroRow
                                          ? "font-semibold text-red-700 dark:text-red-300"
                                          : ""
                                      }`}
                                    >
                                      {shelfText}
                                    </span>
                                    <span className="text-zinc-500 dark:text-zinc-500">
                                      —
                                    </span>
                                  </div>
                                  <div className="hidden min-w-0 justify-end sm:flex">
                                    {isRafZeroRow && (
                                      <div
                                        className="bakery-cook-alert-banner inline-flex items-center rounded-lg border border-red-300/80 bg-gradient-to-r from-red-100/95 via-amber-50/95 to-red-100/95 px-2.5 py-1 text-center dark:border-red-800/70 dark:from-red-950/90 dark:via-amber-950/35 dark:to-red-950/90"
                                        role="status"
                                      >
                                        <span className="bakery-cook-alert-text text-[11px] font-black uppercase text-red-900 dark:text-amber-100">
                                          BENİ PİŞİRİN !
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {isRafZeroRow && (
                                  <div
                                    className="bakery-cook-alert-banner border-t border-red-300/80 bg-gradient-to-r from-red-100/95 via-amber-50/95 to-red-100/95 px-3 py-1.5 text-center sm:hidden dark:border-red-800/70 dark:from-red-950/90 dark:via-amber-950/35 dark:to-red-950/90"
                                    role="status"
                                  >
                                    <span className="bakery-cook-alert-text text-[11px] font-black uppercase text-red-900 dark:text-amber-100">
                                      BENİ PİŞİRİN !
                                    </span>
                                  </div>
                                )}
                              </li>
                            );
                        })}
                      </ul>
                    </>
                  )}
                </div>
              )
            ) : activeTab === "hesaplama" ? (
              <div
                className="flex min-h-0 w-full flex-col gap-4 p-4 sm:p-6"
                aria-label="Hesaplama oturumu"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor="hesaplama-barcode-search"
                      className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                    >
                      Barkod veya ürün adı ile ara
                    </label>
                    <input
                      id="hesaplama-barcode-search"
                      type="search"
                      enterKeyHint="search"
                      autoComplete="off"
                      value={hesaplamaSearchQuery}
                      onChange={(e) => setHesaplamaSearchQuery(e.target.value)}
                      placeholder={`En az ${MIN_SEARCH_LENGTH} karakter (yalnızca eksik/fazla kaydı olan ürünler)`}
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none placeholder:text-zinc-400 focus:border-violet-500 focus-visible:ring-2 focus-visible:ring-violet-500/30 focus-visible:ring-offset-2 motion-safe:transition-shadow dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-violet-400 dark:focus-visible:ring-offset-zinc-950"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleHesaplamaResetSession}
                    className="shrink-0 rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-2.5 text-sm font-medium text-zinc-700 motion-safe:transition-colors hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 dark:focus-visible:ring-offset-zinc-950"
                  >
                    Oturumu sıfırla
                  </button>
                </div>

                <div
                  className="flex min-h-[8rem] flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/40"
                  aria-label="Arama sonuçları — hesaplama adayları"
                >
                  {catalogLoading ? (
                    <div className="p-4">
                      <ListSkeleton />
                    </div>
                  ) : hesaplamaCandidateProducts.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
                      Henüz eksik veya fazla olarak kayıtlı ürün yok; hesaplama için önce bu
                      kayıtları ekleyin.
                    </div>
                  ) : hesaplamaQueryTrimmed.length < MIN_SEARCH_LENGTH ? (
                    <div className="flex flex-1 items-center justify-center px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
                      Aramak için en az {MIN_SEARCH_LENGTH} karakter yazın.
                    </div>
                  ) : hesaplamaSearchResults.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
                      Aday ürünler arasında eşleşme yok.
                    </div>
                  ) : (
                    <ul
                      role="list"
                      className="max-h-[min(45vh,22rem)] divide-y divide-zinc-200 overflow-y-auto overscroll-contain dark:divide-zinc-700"
                    >
                      {hesaplamaSearchResults.map((product) => {
                        const totals = getFirestoreMissingExtraTotalsForProduct(
                          product,
                          items
                        );
                        const autoSide =
                          resolveHesaplamaSideFromFirestoreTotals(totals);
                        const targetLabel =
                          autoSide === "missing"
                            ? "eksik listesine"
                            : autoSide === "extra"
                              ? "fazla listesine"
                              : null;
                        const inMissingSession = hesaplamaMissingLines.some(
                          (l) => l.barcode === product.barcode
                        );
                        const inExtraSession = hesaplamaExtraLines.some(
                          (l) => l.barcode === product.barcode
                        );
                        const inSession = inMissingSession || inExtraSession;
                        return (
                          <li
                            key={product.barcode}
                            className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="flex min-w-0 flex-1 gap-3">
                              <div className="shrink-0">
                                {product.imageUrl ? (
                                  <img
                                    src={product.imageUrl}
                                    alt={product.name}
                                    className="size-12 rounded-lg border border-zinc-200 object-contain p-0.5 dark:border-zinc-600"
                                    width={48}
                                    height={48}
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="flex size-12 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/60">
                                    <PackageX className="size-5 text-zinc-400 dark:text-zinc-500" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="line-clamp-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                  {product.name}
                                </p>
                                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                  <span className="font-medium">Barkod:</span>{" "}
                                  <BarcodeRevealInline barcode={product.barcode} />
                                </p>
                                <p className="mt-1 text-xs tabular-nums">
                                  <span style={{ color: "var(--color-missing)" }}>
                                    Eksik (kayıt): {totals.missingTotal}
                                  </span>
                                  <span className="text-zinc-400"> · </span>
                                  <span style={{ color: "var(--color-extra)" }}>
                                    Fazla (kayıt): {totals.extraTotal}
                                  </span>
                                </p>
                              </div>
                            </div>
                            <div className="flex shrink-0 sm:justify-end">
                              <button
                                type="button"
                                disabled={inSession ? false : !autoSide}
                                onClick={() =>
                                  inSession
                                    ? handleHesaplamaRemoveProductFromSession(
                                        product
                                      )
                                    : handleHesaplamaAddProductToSession(product)
                                }
                                title={
                                  inSession
                                    ? "Ürünü hesaplama listesinden çıkarır"
                                    : targetLabel
                                      ? `Kayıtlara göre ${targetLabel} eklenir`
                                      : undefined
                                }
                                className={`min-h-[44px] rounded-lg border px-4 py-2 text-sm font-medium motion-safe:transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-zinc-950 ${
                                  inSession
                                    ? "border-red-300 bg-red-50 text-red-800 hover:bg-red-100 focus-visible:ring-red-500 dark:border-red-700 dark:bg-red-950/45 dark:text-red-200 dark:hover:bg-red-950/70"
                                    : "border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100 focus-visible:ring-violet-500 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-200 dark:hover:bg-violet-950"
                                }`}
                              >
                                {inSession ? "Listeden kaldır" : "Listeye ekle"}
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div
                  className="rounded-xl border border-zinc-200 bg-zinc-50/90 p-4 dark:border-zinc-700 dark:bg-zinc-900/50"
                  aria-label="Hesaplama tutar özeti"
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div
                      className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-600 dark:bg-zinc-900"
                      role="group"
                      aria-label="Toplam eksik tutar"
                    >
                      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Toplam eksik (TL)
                      </p>
                      <p
                        className="mt-1 text-2xl font-semibold tabular-nums"
                        style={{ color: "var(--color-missing)" }}
                      >
                        {formatTryPriceTRY(hesaplamaMissingValueSum.sumTry)}
                      </p>
                    </div>
                    <div
                      className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-600 dark:bg-zinc-900"
                      role="group"
                      aria-label="Toplam fazla tutar"
                    >
                      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Toplam fazla (TL)
                      </p>
                      <p
                        className="mt-1 text-2xl font-semibold tabular-nums"
                        style={{ color: "var(--color-extra)" }}
                      >
                        {formatTryPriceTRY(hesaplamaExtraValueSum.sumTry)}
                      </p>
                    </div>
                  </div>
                  {hesaplamaMissingValueSum.linesWithoutPrice +
                    hesaplamaExtraValueSum.linesWithoutPrice >
                    0 && (
                    <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
                      {hesaplamaMissingValueSum.linesWithoutPrice +
                        hesaplamaExtraValueSum.linesWithoutPrice}{" "}
                      satırda katalog fiyatı yok; tutar 0 ₺ olarak hesaplandı.
                    </p>
                  )}
                  {!hesaplamaValueComparison.listsEmpty && (
                    <div
                      className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
                        hesaplamaValueComparison.higher === "missing"
                          ? "border-red-200 bg-red-50/80 text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100"
                          : hesaplamaValueComparison.higher === "extra"
                            ? "border-green-200 bg-green-50/80 text-green-900 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-100"
                            : "border-zinc-200 bg-zinc-100/80 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-200"
                      }`}
                      role="status"
                    >
                      <span>
                        Fark{" "}
                        <strong className="tabular-nums">
                          {formatTryPriceTRY(
                            hesaplamaValueComparison.absDiffTry
                          )}
                        </strong>
                      </span>
                    </div>
                  )}
                </div>

                <div className="grid min-h-[10rem] grid-cols-1 gap-4 lg:grid-cols-2">
                  <section
                    aria-labelledby="hesaplama-heading-missing"
                    className="flex flex-col rounded-xl border border-zinc-200 bg-zinc-50/80 dark:border-zinc-700 dark:bg-zinc-900/40"
                  >
                    <div
                      id="hesaplama-heading-missing"
                      className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700"
                    >
                      <h3
                        className="text-sm font-semibold"
                        style={{ color: "var(--color-missing)" }}
                      >
                        Eksik ürünler (hesaplama)
                      </h3>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        Başka sekmeye geçseniz oturum korunur; temizlemek için{" "}
                        <span className="font-medium">Oturumu sıfırla</span>.
                      </p>
                    </div>
                    <div>
                      {hesaplamaMissingLines.length === 0 ? (
                        <div className="flex items-center justify-center px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
                          Liste boş.
                        </div>
                      ) : (
                        <ul role="list" className="border-t border-zinc-100 dark:border-zinc-700/80">
                          {hesaplamaMissingLines.map((line) => {
                            const val = getHesaplamaLineValueTry(
                              line,
                              catalogProducts,
                              catalogPriceByBarcode
                            );
                            const pricingSource = getHesaplamaLinePricingSource(
                              line,
                              catalogProducts,
                              catalogPriceByBarcode
                            );
                            const bcKey = line.barcode.trim();
                            const shelfStockDisplay =
                              hesaplamaShelfStocksLoading
                                ? "…"
                                : typeof hesaplamaShelfStocks[bcKey] ===
                                    "number"
                                  ? String(hesaplamaShelfStocks[bcKey])
                                  : "—";
                            return (
                              <HesaplamaSessionLineRow
                                key={line.barcode}
                                side="missing"
                                line={line}
                                pricingSource={pricingSource}
                                lineSubtotalFormatted={formatTryPriceTRY(
                                  val.lineTotalTry
                                )}
                                lineHasPrice={val.hasUnitPrice}
                                shelfStockDisplay={shelfStockDisplay}
                                onQuantityCommit={
                                  handleHesaplamaLineQuantityCommit
                                }
                                onRemove={handleHesaplamaRemoveLine}
                                onApplyFirestore={
                                  handleHesaplamaApplyFirestoreTotal
                                }
                                onManualUnitPriceCommit={
                                  handleHesaplamaManualUnitPriceCommit
                                }
                              />
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </section>
                  <section
                    aria-labelledby="hesaplama-heading-extra"
                    className="flex flex-col rounded-xl border border-zinc-200 bg-zinc-50/80 dark:border-zinc-700 dark:bg-zinc-900/40"
                  >
                    <div
                      id="hesaplama-heading-extra"
                      className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700"
                    >
                      <h3
                        className="text-sm font-semibold"
                        style={{ color: "var(--color-extra)" }}
                      >
                        Fazla ürünler (hesaplama)
                      </h3>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        Başka sekmeye geçseniz oturum korunur; temizlemek için{" "}
                        <span className="font-medium">Oturumu sıfırla</span>.
                      </p>
                    </div>
                    <div>
                      {hesaplamaExtraLines.length === 0 ? (
                        <div className="flex items-center justify-center px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
                          Liste boş.
                        </div>
                      ) : (
                        <ul role="list" className="border-t border-zinc-100 dark:border-zinc-700/80">
                          {hesaplamaExtraLines.map((line) => {
                            const val = getHesaplamaLineValueTry(
                              line,
                              catalogProducts,
                              catalogPriceByBarcode
                            );
                            const pricingSource = getHesaplamaLinePricingSource(
                              line,
                              catalogProducts,
                              catalogPriceByBarcode
                            );
                            const bcKey = line.barcode.trim();
                            const shelfStockDisplay =
                              hesaplamaShelfStocksLoading
                                ? "…"
                                : typeof hesaplamaShelfStocks[bcKey] ===
                                    "number"
                                  ? String(hesaplamaShelfStocks[bcKey])
                                  : "—";
                            return (
                              <HesaplamaSessionLineRow
                                key={line.barcode}
                                side="extra"
                                line={line}
                                pricingSource={pricingSource}
                                lineSubtotalFormatted={formatTryPriceTRY(
                                  val.lineTotalTry
                                )}
                                lineHasPrice={val.hasUnitPrice}
                                shelfStockDisplay={shelfStockDisplay}
                                onQuantityCommit={
                                  handleHesaplamaLineQuantityCommit
                                }
                                onRemove={handleHesaplamaRemoveLine}
                                onApplyFirestore={
                                  handleHesaplamaApplyFirestoreTotal
                                }
                                onManualUnitPriceCommit={
                                  handleHesaplamaManualUnitPriceCommit
                                }
                              />
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </section>
                </div>
              </div>
            ) : isLoading || catalogLoading ? (
              <ListSkeleton />
            ) : (
              <div
                className="max-h-[55vh] min-h-[8rem] overflow-auto"
                aria-label={activeTab === "missing" ? "Eksik ürünler listesi" : "Fazla ürünler listesi"}
              >
                {/* Başlık satırı — sadece desktop'ta göster (STOCK_LIST_COLUMNS) */}
                <div
                  className="hidden sm:grid sticky top-0 z-10 gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-left text-sm font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400"
                  style={{ 
                    gridTemplateColumns:
                      "3rem minmax(0,1fr) minmax(8rem,10rem) minmax(3rem,4rem) minmax(0,1fr) minmax(5.5rem,7.5rem) minmax(5rem,6rem)",
                  }}
                >
                  <span></span>
                  {STOCK_LIST_COLUMNS.map((col) =>
                    col.sortKey ? (
                      <button
                        key={col.key}
                        type="button"
                        onClick={() => handleSort(col.sortKey!)}
                        className={`flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors text-left ${
                          sortField === col.sortKey ? "text-zinc-900 dark:text-zinc-100" : ""
                        }`}
                      >
                        <span>{col.title}</span>
                        {sortField === col.sortKey && (
                          sortDirection === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                        )}
                      </button>
                    ) : (
                      <span key={col.key}>{col.title}</span>
                    )
                  )}
                  <span className="text-right">İşlem</span>
                </div>
                {/* Mobil: sıralama kontrolleri (STOCK_LIST_COLUMNS sortKey alanları) */}
                {displayItems.length > 0 && (
                  <div
                    className="flex sm:hidden sticky top-0 z-10 flex-wrap gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2 dark:border-zinc-700 dark:bg-zinc-800/50"
                    role="group"
                    aria-label="Listeyi sırala"
                  >
                    <span className="sr-only">Sırala:</span>
                    {STOCK_LIST_COLUMNS.filter((c) => c.sortKey).map((col) => (
                      <button
                        key={col.key}
                        type="button"
                        onClick={() => handleSort(col.sortKey!)}
                        className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                          sortField === col.sortKey
                            ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-600 dark:text-zinc-100"
                            : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
                        }`}
                      >
                        {col.title}
                        {sortField === col.sortKey && (sortDirection === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                      </button>
                    ))}
                  </div>
                )}
                {/* Liste satırları */}
                {displayItems.length === 0 ? (
                  <EmptyState
                    title={
                      activeTab === "missing"
                        ? "Eksik ürün bulunmuyor"
                        : "Fazla ürün bulunmuyor"
                    }
                    message={
                      activeTab === "missing"
                        ? "Henüz eksik ürün kaydı eklenmemiş. Eksik ürün eklemek için yukarıdaki butonu kullanabilirsiniz."
                        : "Henüz fazla ürün kaydı eklenmemiş. Fazla ürün eklemek için yukarıdaki butonu kullanabilirsiniz."
                    }
                    icon={PackageX}
                  />
                ) : (
                  <ul role="list" className="divide-y divide-zinc-200 dark:divide-zinc-700">
                    {displayItems.map((item) => (
                      <li
                        key={item.id}
                        onClick={() => handleItemClick(item)}
                        className="transition-colors duration-150 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer"
                      >
                        {/* Mobil görünüm: Kart layout */}
                        <div className="flex gap-3 px-4 py-3 sm:hidden">
                          <div className="shrink-0">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="size-16 rounded-lg object-cover"
                                width={64}
                                height={64}
                                loading="lazy"
                              />
                            ) : (
                              <div className="size-16 rounded-lg bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
                                <PackageX className="size-7 text-zinc-400 dark:text-zinc-500" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1 flex flex-col gap-2">
                            {STOCK_LIST_COLUMNS.map((col) => {
                              if (col.key === "notes" && !item.notes) return null;
                              if (col.key === "totalAmount") {
                                const { text } = getItemLineTotalTry(
                                  item,
                                  catalogPriceByBarcode
                                );
                                return (
                                  <div
                                    key={col.key}
                                    role="group"
                                    aria-label={col.title}
                                    className="text-xs text-zinc-600 dark:text-zinc-300"
                                  >
                                    <span className="font-medium text-zinc-500 dark:text-zinc-400">
                                      {col.mobileLabel}:
                                    </span>{" "}
                                    <span className="tabular-nums font-medium">
                                      {text}
                                    </span>
                                  </div>
                                );
                              }
                              const value =
                                col.key === "notes" ? item.notes! : String(item[col.key] ?? "");
                              const isName = col.key === "name";
                              const isNotes = col.key === "notes";
                              const isBarcode = col.key === "barcode";
                              const wrapperClass = isName
                                ? "text-xs"
                                : isNotes
                                ? "min-w-0 text-xs text-zinc-500 dark:text-zinc-400"
                                : "text-xs text-zinc-600 dark:text-zinc-300" + (isBarcode ? " min-w-0" : "");
                              const valueClass = isName
                                ? "text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-snug line-clamp-2"
                                : isNotes
                                ? "min-w-0 line-clamp-2 break-words"
                                : col.key === "quantity"
                                ? "tabular-nums font-medium"
                                : "";
                              return (
                                <div key={col.key} role="group" aria-label={col.title} className={wrapperClass}>
                                  <span className="font-medium text-zinc-500 dark:text-zinc-400">{col.mobileLabel}:</span>{" "}
                                  {isBarcode ? (
                                    <BarcodeRevealInline barcode={item.barcode} />
                                  ) : (
                                    <span className={valueClass}>{value}</span>
                                  )}
                                </div>
                              );
                            })}
                            {/* Tarih: daha soluk */}
                            {(item.createdAt || item.updatedAt) && (
                              <div role="group" aria-label={item.updatedAt ? "Son güncelleme tarihi" : "Eklenme tarihi"} className="text-xs text-zinc-400 dark:text-zinc-500">
                                {item.updatedAt ? (
                                  <>Son Güncelleme: {formatDateTime(item.updatedAt)}</>
                                ) : (
                                  <>Eklenme: {formatDateTime(item.createdAt)}</>
                                )}
                              </div>
                            )}
                            <div className="flex items-center justify-end gap-2 mt-auto pt-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEdit(item);
                                }}
                                className="rounded-lg p-2.5 min-h-[40px] min-w-[40px] flex items-center justify-center text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                                aria-label="Ürünü düzenle"
                                title="Düzenle"
                              >
                                <Pencil className="size-4.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setListDeleteConfirmItem(item);
                                }}
                                disabled={deletingId === item.id}
                                className="rounded-lg p-2.5 min-h-[40px] min-w-[40px] flex items-center justify-center text-red-600 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
                                aria-label="Ürünü sil"
                                title="Sil"
                              >
                                <Trash2 className="size-4.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                        
                        {/* Desktop görünüm: Grid layout */}
                        <div
                          className="hidden sm:grid gap-4 px-4 py-3 text-sm"
                        style={{ 
                          gridTemplateColumns:
                            "3rem minmax(0,1fr) minmax(8rem,10rem) minmax(3rem,4rem) minmax(0,1fr) minmax(5.5rem,7.5rem) minmax(5rem,6rem)",
                        }}
                      >
                        <span className="flex items-center justify-center">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="size-10 rounded object-cover"
                              width={40}
                              height={40}
                              loading="lazy"
                            />
                          ) : (
                            <div className="size-10 rounded bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
                              <PackageX className="size-5 text-zinc-400 dark:text-zinc-500" />
                            </div>
                          )}
                        </span>
                        {STOCK_LIST_COLUMNS.map((col) => {
                          if (col.key === "totalAmount") {
                            const { text } = getItemLineTotalTry(
                              item,
                              catalogPriceByBarcode
                            );
                            return (
                              <span
                                key={col.key}
                                className="tabular-nums text-zinc-600 dark:text-zinc-300"
                              >
                                {text}
                              </span>
                            );
                          }
                          const value =
                            col.key === "notes" ? (item.notes || "—") : String(item[col.key] ?? "");
                          const cellClass =
                            col.key === "name"
                              ? "min-w-0 font-medium text-zinc-900 dark:text-zinc-100"
                              : col.key === "notes"
                              ? "min-w-0 truncate text-zinc-500 dark:text-zinc-400"
                              : col.key === "barcode"
                              ? "min-w-0 text-zinc-600 dark:text-zinc-300"
                              : "tabular-nums text-zinc-600 dark:text-zinc-300";
                          return (
                            <span key={col.key} className={cellClass}>
                              {col.key === "barcode" ? (
                                <BarcodeRevealInline barcode={item.barcode} />
                              ) : (
                                value
                              )}
                            </span>
                          );
                        })}
                        <span className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(item);
                              }}
                              className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                            aria-label="Ürünü düzenle"
                            title="Düzenle"
                          >
                              <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setListDeleteConfirmItem(item);
                              }}
                            disabled={deletingId === item.id}
                              className="rounded-lg p-1.5 text-red-600 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
                            aria-label="Ürünü sil"
                            title="Sil"
                          >
                              <Trash2 className="size-4" />
                          </button>
                        </span>
                          {(item.createdAt || item.updatedAt) && (
                          <span
                            className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500"
                            style={{ gridColumn: "2 / -1" }}
                            aria-hidden
                          >
                              {item.updatedAt ? (
                                <>Son Güncelleme: {formatDateTime(item.updatedAt)}</>
                              ) : (
                                <>Eklenme: {formatDateTime(item.createdAt)}</>
                              )}
                          </span>
                        )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
          )}
      </section>

      {/* Yaklaşan SKT uyarı simgesi (sabit, küçük buton) */}
      {showExpiringNotification && expiringProductsToday.length > 0 && (
        <div className="fixed right-3 top-4 sm:top-6 z-40 flex items-center gap-1.5">
          {/* Açma butonu */}
          <button
            type="button"
            onClick={() => setIsExpiringNotificationOpen(true)}
            className="flex items-center gap-2 rounded-full bg-orange-600 px-3 py-2 text-xs sm:text-sm font-medium text-white shadow-lg transition hover:bg-orange-700 active:scale-95 motion-safe:animate-[skt-alert-blink_1.4s_ease-in-out_infinite]"
          >
            <AlertTriangle className="size-4" />
            <span className="hidden sm:inline">
              Bugün çıkılacak ürünler var! Lütfen kontrol ediniz...
            </span>
            <span className="sm:hidden">Bugün SKT uyarısı</span>
          </button>
          {/* Kapatma butonu */}
          <button
            type="button"
            onClick={handleCloseExpiringAlertBadge}
            className="flex items-center justify-center rounded-full bg-zinc-800/90 px-2 py-1 text-[11px] text-zinc-100 shadow-md ring-1 ring-zinc-700/70 hover:bg-zinc-700 active:scale-95"
            aria-label="SKT uyarısını kapat"
            title="Uyarıyı kapat"
          >
            ×
          </button>
        </div>
      )}

      {/* Yaklaşan SKT Bildirim Penceresi */}
      {showExpiringNotification &&
        isExpiringNotificationOpen &&
        expiringProductsToday.length > 0 && (
          <ExpiringProductNotification
            products={expiringProductsToday}
            onClose={handleCloseExpiringNotification}
            catalogProducts={catalogProducts}
          />
        )}

      {/* Yaklaşan SKT Düzenleme Modal */}
      {editingExpiringProduct && (
        <ExpiringProductModal
          isOpen={true}
          onClose={() => setEditingExpiringProduct(null)}
          product={{
            barcode: editingExpiringProduct.barcode,
            name: editingExpiringProduct.productName,
          }}
          existingProduct={editingExpiringProduct}
          onSuccess={(message) => {
            setToast({ message, type: "success" });
            setEditingExpiringProduct(null);
            // Listeyi yeniden yükle
            fetch("/api/expiring-products")
              .then((res) => res.json())
              .then((data) => {
                if (data.success && Array.isArray(data.products)) {
                  setExpiringProducts(sortExpiringProductsByRemovalDate(data.products));
                }
              })
              .catch(console.error);
          }}
        />
      )}

      {/* Eksik/Fazla sekmesi listeden silme onayı */}
      <ConfirmModal
        isOpen={!!listDeleteConfirmItem}
        onClose={() => setListDeleteConfirmItem(null)}
        title="Kaydı sil"
        message={
          listDeleteConfirmItem?.type === "extra"
            ? "Bu fazla kaydı silmek istediğinize emin misiniz?"
            : "Bu eksik kaydı silmek istediğinize emin misiniz?"
        }
        confirmLabel="Sil"
        cancelLabel="İptal"
        variant="danger"
        onConfirm={() => {
          if (listDeleteConfirmItem) {
            void handleDelete(listDeleteConfirmItem, { skipConfirm: true });
          }
          setListDeleteConfirmItem(null);
        }}
      />

      {bakeryLightboxBarcode && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Fırın ürün görseli"
          className="fixed inset-0 z-[60] flex flex-col bg-black/92 p-3 sm:p-5"
          onClick={() => {
            setBakeryLightboxBarcode(null);
            setBakeryLightboxFailed(false);
          }}
        >
          <div className="flex shrink-0 justify-end pb-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setBakeryLightboxBarcode(null);
                setBakeryLightboxFailed(false);
              }}
              className="flex size-10 items-center justify-center rounded-full bg-zinc-800 text-zinc-100 ring-1 ring-zinc-600/80 transition hover:bg-zinc-700"
              aria-label="Kapat"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div
            className="flex min-h-0 flex-1 items-center justify-center px-1"
            onClick={(e) => e.stopPropagation()}
          >
            {bakeryLightboxFailed ? (
              <p className="max-w-md text-center text-sm leading-relaxed text-zinc-200">
                Görsel bulunamadı.{" "}
                <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-amber-200">
                  public/bakery-images/{bakeryLightboxBarcode}.jpg
                </code>{" "}
                dosyasını ekleyin veya barkodu kontrol edin.
              </p>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- public klasöründeki kullanıcı görselleri
              <img
                src={getBakeryFullImageUrl(bakeryLightboxBarcode)}
                alt=""
                className="max-h-[min(90dvh,calc(100vh-5rem))] max-w-full object-contain shadow-2xl"
                onError={() => setBakeryLightboxFailed(true)}
              />
            )}
          </div>
        </div>
      )}

      <ReferenceWaterProductsPanel
        open={referencePanelOpen}
        onClose={() => setReferencePanelOpen(false)}
      >
        <ReferenceWaterProductsPanelContent catalogProducts={catalogProducts} />
      </ReferenceWaterProductsPanel>

      {/* Referans su — sağ alt FAB; baloncuklar yalnızca buton merkezinden (yalnızca md+) */}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[48] hidden md:flex justify-end pr-4 sm:pr-6">
        <div className="ref-water-fab-wrap pointer-events-auto relative flex h-36 w-36 shrink-0 items-center justify-center overflow-visible">
          {REF_WATER_HOVER_BUBBLE_STYLES.map((bubbleStyle, i) => (
            <span
              key={i}
              aria-hidden
              style={bubbleStyle}
              className={`ref-water-fab-bubble motion-reduce:hidden pointer-events-none absolute left-1/2 top-1/2 z-[9] rounded-full bg-gradient-to-br from-white via-cyan-50 to-sky-200 shadow-[0_0_6px_rgba(186,230,253,0.85)] ring-1 ring-white/80 dark:from-white/45 dark:via-cyan-200/35 dark:to-sky-400/45 dark:shadow-cyan-400/35 dark:ring-cyan-200/50 ${
                i % 3 === 0
                  ? "h-2 w-2"
                  : i % 3 === 1
                    ? "h-1.5 w-1.5"
                    : "h-2.5 w-2.5"
              }`}
            />
          ))}
          <span
            aria-hidden
            className="ref-water-fab-ripple motion-reduce:hidden pointer-events-none absolute left-1/2 top-1/2 block size-12 rounded-full bg-sky-400/45 dark:bg-sky-400/35"
          />
          <span
            aria-hidden
            className="ref-water-fab-ripple-delayed motion-reduce:hidden pointer-events-none absolute left-1/2 top-1/2 block size-12 rounded-full bg-cyan-300/40 dark:bg-cyan-300/30"
          />
          <button
            type="button"
            onClick={() => setReferencePanelOpen(true)}
            className="ref-water-fab-float motion-reduce:animate-none motion-reduce:shadow-lg relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-sky-500/95 bg-gradient-to-br from-sky-500 to-sky-600 text-white ring-2 ring-white/25 transition hover:from-sky-400 hover:to-sky-500 hover:ring-white/40 active:scale-95 dark:border-sky-400/90 dark:from-sky-600 dark:to-sky-700 dark:hover:from-sky-500 dark:hover:to-sky-600"
            aria-label="Referans ürün barkodları"
          >
            <Droplets
              className="ref-water-fab-icon motion-reduce:animate-none size-6 drop-shadow-sm"
              aria-hidden
            />
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import {
  Barcode,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  ChefHat,
  ClipboardList,
  ListChecks,
  BarChart3,
  Scale,
  Plus,
  ShoppingBasket,
} from "lucide-react";
import { AddProductModal } from "./components/AddProductModal";
import { ManualAddProductModal } from "./components/ManualAddProductModal";
import { BakeryExitWizard } from "./components/BakeryExitWizard";
import { BakeryProductsEditor } from "./components/BakeryProductsEditor";
import { SevkiyatControlWizard, SevkiyatControlOpenButton } from "./components/SevkiyatControlWizard";
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
  PackagePlus,
  CalendarClock,
  Calendar,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { deleteStockItem, subscribeStockItems } from "@/app/lib/stockService";
import { ExpiringProductNotification } from "./components/ExpiringProductNotification";
import { ExpiringProductModal } from "./components/ExpiringProductModal";
import { ConfirmModal } from "./components/ConfirmModal";
import { BarkodOlusturucuModal } from "./components/BarkodOlusturucuModal";
import { SayimTabContent } from "./components/SayimTabContent";
import { KasaPaletSayimTabContent } from "./components/KasaPaletSayimTabContent";
import { IstatistiklerTabContent } from "./components/IstatistiklerTabContent";
import { PickingOrdersModal } from "./components/PickingOrdersTabContent";
import { subscribePickingOrders } from "@/app/lib/pickingOrderStore";
import type { PickingOrder } from "@/app/lib/pickingOrders";
import { DpsHeaderSummary } from "./components/DpsHeaderSummary";
import type { SayimPair } from "@/app/lib/sayimMatch";
import type { StockItemWithId, ExpiringProductWithId } from "@/app/lib/types";
import { formatDateTime, formatTryPriceTRY } from "@/app/lib/utils";
import {
  buildBakeryExitQueue,
  defaultBakeryEntries,
  resolveBakeryEntries,
  type BakeryResolvedRow,
} from "@/app/lib/bakeryProducts";
import { readBakeryProducts } from "@/app/lib/bakeryProductsService";
import {
  buildCatalogImageIndex,
  catalogProductMatchesBarcode,
  normalizeBarcode,
} from "@/app/lib/catalogBarcodeMatch";
import {
  isDocumentVisible,
  onDocumentBecameVisible,
} from "@/app/lib/pageVisibility";
import {
  useSelectedWarehouseId,
  writeSelectedWarehouseId,
} from "@/app/lib/selectedWarehouse";
import { SOGUKKUYU_WAREHOUSE_ID } from "@/app/lib/franchiseWarehouses";
import { WarehouseSelector } from "@/app/components/WarehouseSelector";
import { ExpiringAlertBanner } from "@/app/components/ExpiringAlertBanner";
import { ScrollToTopButton } from "@/app/components/ScrollToTopButton";

/** Katalog ürünü (api/products) */
interface CatalogProduct {
  name: string;
  barcode: string;
  barcodes?: string[];
  imageUrl?: string;
  productId?: string;
  price?: number;
  supplierReturnDays?: number;
}

export type ModalType = null | "missing" | "extra";
export type TabType =
  | "missing"
  | "extra"
  | "expiring"
  | "sayim"
  | "kasaPalet"
  | "istatistik";

const TAB_INACTIVE_CLASS =
  "text-zinc-500 hover:bg-zinc-200/80 hover:text-zinc-800 active:bg-zinc-300 dark:text-zinc-400 dark:hover:bg-zinc-700/80 dark:hover:text-zinc-100 dark:active:bg-zinc-600";

/** Ana ekran sekmeleri: simge, yazı (mobilde kısa) ve seçili renk sınıfları tek yerde */
const PANEL_TABS: {
  key: TabType;
  tabId: string;
  panelId: string;
  icon: typeof PackageX;
  label: string;
  /** Geniş ekranda eklenen yazı (mobilde gizli) */
  labelExtra?: string;
  activeClass: string;
  underlineClass: string;
}[] = [
  {
    key: "missing",
    tabId: "tab-missing",
    panelId: "panel-missing",
    icon: PackageX,
    label: "Eksik Ürünler",
    activeClass: "text-[var(--color-missing)] hover:bg-red-50/80 dark:hover:bg-red-950/35",
    underlineClass: "bg-[var(--color-missing)]",
  },
  {
    key: "extra",
    tabId: "tab-extra",
    panelId: "panel-extra",
    icon: PackagePlus,
    label: "Fazla Ürünler",
    activeClass: "text-[var(--color-extra)] hover:bg-green-50/80 dark:hover:bg-green-950/35",
    underlineClass: "bg-[var(--color-extra)]",
  },
  {
    key: "expiring",
    tabId: "tab-expiring",
    panelId: "panel-expiring",
    icon: CalendarClock,
    label: "Yaklaşan SKT",
    activeClass:
      "text-orange-600 hover:bg-orange-50/80 dark:text-orange-400 dark:hover:bg-orange-950/35",
    underlineClass: "bg-orange-600 dark:bg-orange-400",
  },
  {
    key: "sayim",
    tabId: "tab-sayim",
    panelId: "panel-sayim",
    icon: Scale,
    label: "Sayım",
    activeClass: "text-sky-700 hover:bg-sky-50/80 dark:text-sky-400 dark:hover:bg-sky-950/35",
    underlineClass: "bg-sky-600 dark:bg-sky-400",
  },
  {
    key: "kasaPalet",
    tabId: "tab-kasa-palet",
    panelId: "panel-kasa-palet",
    icon: ClipboardList,
    label: "Kasa/Palet",
    labelExtra: " Sayımı",
    activeClass:
      "text-violet-700 hover:bg-violet-50/80 dark:text-violet-400 dark:hover:bg-violet-950/35",
    underlineClass: "bg-violet-600 dark:bg-violet-400",
  },
  {
    key: "istatistik",
    tabId: "tab-istatistik",
    panelId: "panel-istatistik",
    icon: BarChart3,
    label: "İstatistikler",
    activeClass: "text-teal-700 hover:bg-teal-50/80 dark:text-teal-400 dark:hover:bg-teal-950/35",
    underlineClass: "bg-teal-600 dark:bg-teal-400",
  },
];

interface ToastState {
  message: string;
  type: ToastType;
  /** Otomatik kapanma süresi (ms). Verilmezse varsayılan: error 7s, success 5s */
  autoClose?: number;
}

type StockListSortKey = "name" | "barcode" | "quantity" | "totalAmount";

/** Görsel + sütunlar + işlem; başa seçim kutusu eklenir */
const STOCK_LIST_GRID =
  "2.25rem 3rem minmax(0,1fr) minmax(8rem,10rem) minmax(3rem,4rem) minmax(0,1fr) minmax(5.5rem,7.5rem) minmax(5rem,6rem)";

function StockSelectCheckbox({
  checked,
  onCheckedChange,
  ariaLabel,
  indeterminate = false,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  ariaLabel: string;
  indeterminate?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      aria-label={ariaLabel}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation();
        onCheckedChange(e.target.checked);
      }}
      className="size-4 shrink-0 cursor-pointer rounded border-zinc-300 text-[var(--color-missing)] accent-zinc-800 dark:border-zinc-500 dark:accent-zinc-200"
    />
  );
}

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
  /** Panelde seçili depo; eksik/fazla kayıtları yalnızca bu depodan okunur ve bu depoya yazılır */
  const warehouseId = useSelectedWarehouseId();
  /** Yaklaşan SKT ve Fırın çık yalnızca Soğukkuyu'da var; Bostanlı'da gizlenir ve hiç sorgulanmaz */
  const isSogukkuyu = warehouseId === SOGUKKUYU_WAREHOUSE_ID;
  const [modalType, setModalType] = useState<ModalType>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [items, setItems] = useState<StockItemWithId[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [selectedCatalogProduct, setSelectedCatalogProduct] = useState<CatalogProduct | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTab, setActiveTab] = useState<TabType>("missing");
  // Bostanlı'da SKT yok: sekme açıksa "Eksik"e dönülür (seçim Soğukkuyu'ya dönünce geri gelir)
  const activeTab: TabType =
    !isSogukkuyu && selectedTab === "expiring" ? "missing" : selectedTab;
  // Üstte sabit arama çubuğunun yüksekliği (CSS değişkeni): sekme şeridi hemen altında sabitlenir
  const searchStripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = searchStripRef.current;
    if (!el) return;
    const apply = () =>
      document.documentElement.style.setProperty("--search-strip-h", `${el.offsetHeight}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const visiblePanelTabs = PANEL_TABS.filter((tab) => tab.key !== "expiring" || isSogukkuyu);
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
  const [manualAddProductOpen, setManualAddProductOpen] = useState(false);
  // Ekran ortasında başarı penceresi (Bildirim gönderildi / Ürün silindi vb.) — 2 sn
  const [successModalMessage, setSuccessModalMessage] = useState<string | null>(null);
  // Eksik/Fazla sekmesindeki listeden silme onayı
  const [listDeleteConfirmItem, setListDeleteConfirmItem] = useState<StockItemWithId | null>(null);
  const [selectedStockIds, setSelectedStockIds] = useState<Set<string>>(
    () => new Set()
  );
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Barkod Oluşturucu paneli/modalı açık mı (Faz 1.3)
  const [barkodOlusturucuOpen, setBarkodOlusturucuOpen] = useState(false);
  // Barkod Oluşturucu input değeri (Faz 2.3)
  const [barkodOlusturucuValue, setBarkodOlusturucuValue] = useState("");

  // Arama için minimum karakter sayısı
  const MIN_SEARCH_LENGTH = 2;

  // Arama için debounce süresi (ms cinsinden)
  const DEBOUNCE_DELAY = 300;

  // Extension / URL üzerinden hızlı arama (q=...) + açık sekmede mesaj
  useEffect(() => {
    const focusSearchInputSoon = () => {
      // Sticky search bar render olduktan sonra
      setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>(
          'input[aria-label="Ürün ismi veya barkod ile ara"]'
        );
        if (!input) return;
        input.focus();
        try {
          input.select();
        } catch {}
      }, 50);
    };

    const applyQueryFromUrl = () => {
      try {
        const q = new URLSearchParams(window.location.search).get("q");
        if (q && q.trim()) {
          setSearchQuery(q.trim());
          focusSearchInputSoon();
        }
      } catch {
        // ignore
      }
    };

    applyQueryFromUrl();

    const onPopState = () => applyQueryFromUrl();
    window.addEventListener("popstate", onPopState);

    const onMessage = (event: MessageEvent) => {
      const data = event.data as any;
      if (!data || data.source !== "getirstok-extension") return;
      if (data.type !== "SEARCH") return;
      const q = typeof data.query === "string" ? data.query.trim() : "";
      if (!q) return;
      setSearchQuery(q);
      focusSearchInputSoon();
    };
    window.addEventListener("message", onMessage);

    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  // Debounce edilmiş arama sorgusu — ağır işlemler bu değer üzerinden çalışır
  const debouncedSearchQuery = useDebounce(searchQuery, DEBOUNCE_DELAY);

  // Başarı penceresini 2 saniye sonra kapat
  useEffect(() => {
    if (!successModalMessage) return;
    const t = setTimeout(() => setSuccessModalMessage(null), 2000);
    return () => clearTimeout(t);
  }, [successModalMessage]);

  /** Depo değişince katalog yeniden yüklenir; geç gelen eski depo yanıtı yenisini ezmesin */
  const catalogRequestRef = useRef(0);
  const reloadCatalogProducts = useCallback(async () => {
    const requestId = ++catalogRequestRef.current;
    const res = await fetch(`/api/products?warehouseId=${encodeURIComponent(warehouseId)}`);
    const data = (await res.json()) as CatalogProduct[];
    if (requestId !== catalogRequestRef.current) return;
    setCatalogProducts(Array.isArray(data) ? data : []);
  }, [warehouseId]);

  // Katalog ürünlerini yükle
  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    reloadCatalogProducts()
      .catch(() => {
        if (!cancelled) setCatalogProducts([]);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadCatalogProducts]);

  useEffect(() => {
    let isFirstLoad = true;
    let loadingTimeout: NodeJS.Timeout | null = null;

    // Depo değişince önceki deponun kayıtları görünmesin
    setItems([]);
    setIsLoading(true);
    
    // Maksimum loading süresi (5 saniye) - Firestore bağlantısı çok yavaşsa loading'i kaldır
    loadingTimeout = setTimeout(() => {
      setIsLoading(false);
    }, 5000);

    const unsubscribe = subscribeStockItems(
      warehouseId,
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
  }, [warehouseId]);

  // Bugün çıkılması gereken yaklaşan SKT ürünlerini kontrol et
  useEffect(() => {
    // Bostanlı'da SKT yok: sorgu ve 5 dakikalık yenileme çalışmaz
    if (!isSogukkuyu) return;
    const checkExpiringProducts = async () => {
      if (!isDocumentVisible()) return;
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

    checkExpiringProducts();
    const interval = setInterval(checkExpiringProducts, 300000);
    const offVisible = onDocumentBecameVisible(() => {
      void checkExpiringProducts();
    });

    return () => {
      clearInterval(interval);
      offVisible();
    };
  }, [isSogukkuyu]);

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
  // Barkod -> görsel dizini: katalog değişince bir kez kurulur, her satırda arama O(1)
  const catalogImageIndex = useMemo(
    () => buildCatalogImageIndex(catalogProducts),
    [catalogProducts]
  );
  const getCatalogProductImage = useCallback(
    (barcode: string): string | undefined => {
      const b = normalizeBarcode(barcode);
      if (!b) return undefined;
      return normalizeImageUrl(catalogImageIndex.get(b));
    },
    [catalogImageIndex]
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

  /**
   * Barkod -> katalog ürünü. Ana barkodun yanı sıra `barcodes[]` alternatifleri
   * de indekslenir; aksi hâlde alternatif barkodla girilen kayıtlar fiyatsız ve
   * kategorisiz kalıyor. Ana barkodlar önce yazılır, alternatif onu ezmez.
   */
  const catalogByBarcode = useMemo(() => {
    const m = new Map<string, CatalogProduct>();
    const put = (raw: string | undefined, product: CatalogProduct) => {
      if (!raw) return;
      for (const key of [raw, raw.trim().replace(/\s+/g, "")]) {
        if (key && !m.has(key)) m.set(key, product);
      }
    };
    for (const p of catalogProducts) put(p.barcode, p);
    for (const p of catalogProducts) {
      for (const alt of p.barcodes ?? []) put(alt, p);
    }
    return m;
  }, [catalogProducts]);

  const catalogPriceByBarcode = useMemo(() => {
    const m = new Map<string, number>();
    for (const [barcode, p] of catalogByBarcode) {
      if (typeof p.price === "number" && !Number.isNaN(p.price)) {
        m.set(barcode, p.price);
      }
    }
    return m;
  }, [catalogByBarcode]);

  /** Fırın çık sihirbazı — açılış anında sabit kuyruk ve o anki raf stokları */
  const [bakeryExitSnapshot, setBakeryExitSnapshot] = useState<
    BakeryResolvedRow[] | null
  >(null);
  const [bakeryExitStocks, setBakeryExitStocks] = useState<
    Record<string, number | null>
  >({});
  const [bakeryExitLoading, setBakeryExitLoading] = useState(false);
  const bakeryExitRunningRef = useRef(false);
  const [sevkiyatWizardOpen, setSevkiyatWizardOpen] = useState(false);
  const [bakeryEditorOpen, setBakeryEditorOpen] = useState(false);
  /** `public/bakery-images/{barkod}.jpg` dosyası olan barkodlar (API'den) */
  const [bakeryImageBarcodes, setBakeryImageBarcodes] = useState<Set<string>>(
    () => new Set()
  );

  // Toplama modu: depo panelinden gönderilen geçici sipariş listeleri (buton rozeti için burada)
  const [pickingOrders, setPickingOrders] = useState<PickingOrder[]>([]);
  const [pickingOpen, setPickingOpen] = useState(false);
  useEffect(() => subscribePickingOrders(setPickingOrders), []);

  /**
   * Fırın çık: ürün listesi (Firestore), raf stoğu ve görsel listesi yalnızca butona basılınca,
   * bir kez çekilir (arka planda otomatik yenileme yok). Stoğu 0'dan büyük ve stoğu okunamayan
   * ürünler listedeki sırayla gösterilir.
   */
  const handleStartBakeryExit = useCallback(async () => {
    if (bakeryExitRunningRef.current) return;
    bakeryExitRunningRef.current = true;
    setBakeryExitLoading(true);
    try {
      let entries;
      try {
        // Belge henüz yoksa eski varsayılan liste kullanılır
        entries = (await readBakeryProducts()) ?? defaultBakeryEntries();
      } catch {
        setToast({
          message: "Fırın ürün listesi okunamadı. Biraz sonra tekrar deneyin.",
          type: "error",
        });
        return;
      }
      const bakeryRows = resolveBakeryEntries(entries, catalogProducts);
      if (bakeryRows.length === 0) {
        setToast({
          message: "Fırın ürün listesi boş. \"Fırın ürünleri\" düğmesinden ürün ekleyin.",
          type: "error",
        });
        return;
      }
      const [stockData, imageData] = await Promise.all([
        fetch("/api/getir-stock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ barcodes: bakeryRows.map((r) => r.barcode), warehouseId }),
        })
          .then((res) => res.json() as Promise<{ stocks?: Record<string, number | null> }>)
          .catch(() => null),
        fetch("/api/bakery-images")
          .then((res) => res.json() as Promise<{ barcodes?: string[] }>)
          .catch(() => null),
      ]);
      const stocks = stockData?.stocks;
      if (!stocks || typeof stocks !== "object") {
        setToast({
          message: "Raf stoğu okunamadı. Biraz sonra tekrar deneyin.",
          type: "error",
        });
        return;
      }
      if (imageData && Array.isArray(imageData.barcodes)) {
        setBakeryImageBarcodes(new Set(imageData.barcodes.map((b) => b.trim())));
      }
      const queue = buildBakeryExitQueue(bakeryRows, stocks);
      if (queue.length === 0) {
        setToast({
          message: "Raf stoğu 0'dan büyük fırın ürünü yok.",
          type: "error",
        });
        return;
      }
      setBakeryExitStocks(stocks);
      setBakeryExitSnapshot(queue);
    } finally {
      bakeryExitRunningRef.current = false;
      setBakeryExitLoading(false);
    }
  }, [catalogProducts, warehouseId]);

  const handleCloseBakeryExit = useCallback(() => setBakeryExitSnapshot(null), []);

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

  useEffect(() => {
    setSelectedStockIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(displayItems.map((item) => item.id));
      const next = new Set<string>();
      let changed = false;
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [displayItems]);

  const selectedVisibleCount = useMemo(() => {
    if (selectedStockIds.size === 0) return 0;
    return displayItems.reduce(
      (n, item) => (selectedStockIds.has(item.id) ? n + 1 : n),
      0
    );
  }, [displayItems, selectedStockIds]);

  const allVisibleSelected =
    displayItems.length > 0 && selectedVisibleCount === displayItems.length;
  const someVisibleSelected =
    selectedVisibleCount > 0 && selectedVisibleCount < displayItems.length;

  const toggleStockSelected = useCallback((id: string, checked: boolean) => {
    setSelectedStockIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleSelectAllVisible = useCallback(
    (checked: boolean) => {
      setSelectedStockIds((prev) => {
        const next = new Set(prev);
        if (checked) {
          for (const item of displayItems) next.add(item.id);
        } else {
          for (const item of displayItems) next.delete(item.id);
        }
        return next;
      });
    },
    [displayItems]
  );

  // Kısa arama kontrolü (örneğin tek karakter yazıldığında)
  const trimmedSearchQuery = debouncedSearchQuery.trim();
  const isShortSearchQuery =
    trimmedSearchQuery.length > 0 && trimmedSearchQuery.length < MIN_SEARCH_LENGTH;

  const manualAddInitial = useMemo(() => {
    const q = searchQuery.trim();
    const digits = q.replace(/\s/g, "");
    if (/^\d{6,18}$/.test(digits)) return { barcode: digits, name: "" };
    return { name: q, barcode: "" };
  }, [searchQuery]);

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
      setSelectedStockIds((prev) => {
        if (!prev.has(item.id)) return prev;
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
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

  const handleBulkDeleteSelected = useCallback(async () => {
    const ids = displayItems
      .map((item) => item.id)
      .filter((id) => selectedStockIds.has(id));
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) => deleteStockItem(id))
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      const ok = results.length - failed;
      setSelectedStockIds(new Set());
      if (failed > 0) {
        setToast({
          message: `${ok} kayıt silindi, ${failed} kayıt silinemedi.`,
          type: "error",
        });
      } else {
        setSuccessModalMessage(
          ok === 1 ? "Ürün başarıyla silindi." : `${ok} ürün başarıyla silindi.`
        );
      }
    } finally {
      setBulkDeleting(false);
    }
  }, [displayItems, selectedStockIds]);

  /**
   * Sayım: onaylanan change. Tutar bazlı kapatmada iki kaydın da miktarı
   * sıfırlandığı için ikisi de silinir; kısmi düşme diye bir durum yok.
   */
  const handleSayimChange = useCallback(async (pair: SayimPair) => {
    const targets = [
      { id: pair.extra.id, label: "fazla" },
      { id: pair.missing.id, label: "eksik" },
    ];
    const results = await Promise.allSettled(
      // Tek tek "ürün silindi" yerine aşağıda tek bir change bildirimi gidiyor
      targets.map((t) => deleteStockItem(t.id, { skipTelegram: true }))
    );
    const failed = targets.filter((_, i) => results[i].status === "rejected");

    // Hiç silme olmadıysa panelde bir şey değişmedi, bildirim de gitmesin
    if (failed.length < targets.length) {
      const side = (c: SayimPair["extra"]) => ({
        name: c.name,
        barcode: c.barcode,
        quantity: c.quantity,
        unitPrice: c.unitPrice,
        total: c.total,
      });
      void fetch("/api/telegram/sayim-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: pair.category,
          extra: side(pair.extra),
          missing: side(pair.missing),
          net: pair.net,
          warning: failed.length
            ? `${failed[0].label} kaydı silinemedi, elle kontrol edin.`
            : undefined,
        }),
      }).catch(() => null);
    }

    if (failed.length === 0) {
      setSelectedStockIds((prev) => {
        if (!targets.some((t) => prev.has(t.id))) return prev;
        const next = new Set(prev);
        for (const t of targets) next.delete(t.id);
        return next;
      });
      setSuccessModalMessage(
        `Change uygulandı, iki kayıt da silindi. Net etki: ${formatTryPriceTRY(pair.net)}`
      );
      return;
    }

    setToast({
      message:
        failed.length === targets.length
          ? "Change uygulanamadı, hiçbir kayıt silinemedi. Liste değişmedi."
          : `${failed[0].label} kaydı silinemedi; diğer kayıt silindi. Kalan kaydı elle kontrol edin.`,
      type: "error",
    });
  }, []);

  const handleEdit = useCallback((item: StockItemWithId) => {
    setEditingItem(item);
  }, []);

  const handleItemClick = useCallback(
    (item: StockItemWithId) => {
      const fromCatalog = catalogProducts.find((p) =>
        catalogProductMatchesBarcode(p, item.barcode)
      );
      const catalogProduct: CatalogProduct = {
        name: item.name,
        barcode: item.barcode,
        imageUrl: item.imageUrl ?? fromCatalog?.imageUrl,
        productId: fromCatalog?.productId,
        price: fromCatalog?.price,
        supplierReturnDays: fromCatalog?.supplierReturnDays,
      };
      setSelectedCatalogProduct(catalogProduct);
    },
    [catalogProducts]
  );

  // Tüm sayfa boş mu? (henüz hiç ürün eklenmemiş)
  const isPageEmpty = !isLoading && items.length === 0;

  // Üst kart işlem düğmelerinin ortak görünümü (mobilde 48 px, geniş ekranda 44 px yükseklik)
  const headerActionBase =
    "inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 text-[13px] font-semibold shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 motion-reduce:transform-none sm:text-sm lg:h-11 lg:px-4";

  return (
    <div className="flex w-full flex-col gap-6">
      <header className="relative overflow-hidden rounded-2xl border border-violet-100 bg-gradient-to-br from-white via-violet-50/60 to-indigo-50/70 p-4 shadow-sm sm:p-5 dark:border-violet-900/40 dark:from-zinc-900 dark:via-violet-950/30 dark:to-indigo-950/30">
        {/* Köşede yumuşak renk lekesi */}
        <div
          className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-violet-300/25 blur-3xl dark:bg-violet-600/15"
          aria-hidden
        />
        <h1 className="sr-only">Stok Takip Paneli</h1>
        {/* Yaklaşan SKT uyarısı: mobilde kartın en üstünde şerit (geniş ekranda sağ alttaki sabit rozet) */}
        {isSogukkuyu && showExpiringNotification && expiringProductsToday.length > 0 && (
          <ExpiringAlertBanner
            variant="inline"
            count={expiringProductsToday.length}
            onOpen={() => setIsExpiringNotificationOpen(true)}
            onDismiss={handleCloseExpiringAlertBadge}
          />
        )}
        {/* Depo seçici + dünün DPS özeti */}
        <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <WarehouseSelector value={warehouseId} onChange={writeSelectedWarehouseId} stretch />
          <DpsHeaderSummary warehouseId={warehouseId} />
        </div>
        {/* İşlemler: mobilde iki eşit sütun, geniş ekranda tek satır */}
        <div className="relative mt-4 grid grid-cols-2 gap-2 border-t border-violet-100/80 pt-4 lg:flex lg:flex-wrap dark:border-violet-900/40">
          <SevkiyatControlOpenButton
            onClick={() => setSevkiyatWizardOpen(true)}
            label="Sevkiyat"
            className={`${headerActionBase} bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white`}
          />
          {/* Toplama siparişleri Soğukkuyu'ya ait; Bostanlı'da gösterilmez */}
          {isSogukkuyu && (
            <button
              type="button"
              onClick={() => setPickingOpen(true)}
              className={`${headerActionBase} relative bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-violet-500/30 hover:shadow-violet-500/40`}
              aria-label={pickingOrders.length > 0 ? `Toplama, ${pickingOrders.length} sipariş bekliyor` : "Toplama"}
            >
              <ShoppingBasket className="size-4 shrink-0" aria-hidden />
              Toplama
              {pickingOrders.length > 0 && (
                <span
                  className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-black leading-none text-violet-700"
                  aria-hidden
                >
                  {pickingOrders.length}
                </span>
              )}
            </button>
          )}
          {isSogukkuyu && (
            <button
              type="button"
              onClick={() => void handleStartBakeryExit()}
              disabled={bakeryExitLoading || catalogLoading}
              title="Rafta stoğu olan fırın ürünlerini sırayla göster"
              className={`${headerActionBase} col-span-2 border border-amber-600/50 bg-gradient-to-r from-amber-600 to-orange-700 text-white disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 lg:col-auto`}
            >
              <ChefHat className="size-4 shrink-0" aria-hidden />
              {bakeryExitLoading ? "Stok okunuyor…" : "Fırın çık"}
            </button>
          )}
          {isSogukkuyu && (
            <button
              type="button"
              onClick={() => setBakeryEditorOpen(true)}
              title="Fırın çık listesindeki ürünleri ekle, çıkar, sırala"
              className={`${headerActionBase} border border-amber-300 bg-white/90 text-amber-800 hover:border-amber-400 hover:bg-white dark:border-amber-800 dark:bg-zinc-900/80 dark:text-amber-300 dark:hover:bg-zinc-900`}
            >
              <ListChecks className="size-4 shrink-0" aria-hidden />
              Fırın ürünleri
            </button>
          )}
          <button
            type="button"
            onClick={() => setBarkodOlusturucuOpen(true)}
            className={`${headerActionBase} border border-violet-200 bg-white/90 text-violet-700 hover:border-violet-300 hover:bg-white dark:border-violet-800 dark:bg-zinc-900/80 dark:text-violet-300 dark:hover:bg-zinc-900`}
            aria-label="Barkod oluşturucuyu aç"
          >
            <Barcode className="size-4 shrink-0" aria-hidden />
            <span className="sm:hidden">Barkod oluştur</span>
            <span className="hidden sm:inline">Barkod Oluşturucu</span>
          </button>
        </div>
      </header>

      <PickingOrdersModal
        isOpen={pickingOpen && isSogukkuyu}
        onClose={() => setPickingOpen(false)}
        orders={pickingOrders}
        onError={(message) => setToast({ message, type: "error", autoClose: 12000 })}
      />

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

      {/* `contents`: sticky çubuğun kapsayıcısı tüm sayfa olsun (section sadece çubuk kadar yüksekti, sabitleme çalışmıyordu) */}
      <section aria-label="Arama" className="contents">
        {/* Sticky arama: scroll'da üstte sabit kalır */}
        <div 
          ref={searchStripRef}
          className="sticky top-0 z-10 -mx-4 -mt-2 px-4 py-2.5 shadow-sm backdrop-blur-md sm:-mx-6 sm:px-6 sm:py-3 lg:-mx-8 lg:px-8" 
          style={{ backgroundColor: "color-mix(in srgb, var(--bg-base) 72%, transparent)" }}
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
        warehouseId={warehouseId}
        onAddFromCatalog={(product, addType) => {
          setSelectedCatalogProduct(product);
          setModalType(addType);
        }}
        onEditItem={(item) => {
          setEditingItem(item);
          // Katalog görünümünden çık ve düzenleme moduna geç
          setSelectedCatalogProduct(null);
        }}
        onDeleteItem={(item) => {
          // Ürün kartında zaten "Kaydı sil" modalı ile onay alındı, tekrar confirm gösterme
          void handleDelete(item, { skipConfirm: true });
        }}
        onSuccess={(message) => {
          setSuccessModalMessage(message);
          setSelectedCatalogProduct(null);
        }}
      />

      {/* Orta bölüm: istatistik kartları */}
      {!isPageEmpty && (
        <section aria-label="İstatistikler" className="flex flex-col gap-4">
          {isLoading ? (
            <StatCardSkeleton />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-lg hover:shadow-zinc-400/20 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-500 dark:hover:shadow-black/40 motion-reduce:transform-none motion-reduce:transition-none"
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
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[0_10px_24px_-8px_var(--color-missing)] dark:border-zinc-700 dark:bg-zinc-800 motion-reduce:transform-none motion-reduce:transition-none"
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
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[0_10px_24px_-8px_var(--color-extra)] dark:border-zinc-700 dark:bg-zinc-800 motion-reduce:transform-none motion-reduce:transition-none"
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

      {/* Alt bölüm: Arama sonuçları veya sekmeli listeler */}
      <section aria-label="Ürün listeleri" className="flex flex-col gap-4">
          {/* Arama yapıldığında: Sadece arama sonuçları göster */}
          {searchQuery.trim() ? (
            <div className="overflow-clip rounded-xl border border-zinc-200 dark:border-zinc-700">
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
                    className="sm:max-h-[55vh] sm:min-h-[8rem] sm:overflow-auto"
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
                      let hoverColorClass = "hover:bg-zinc-100 dark:hover:bg-zinc-800/70"; // Varsayılan hover
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
                          onClick={() => setSelectedCatalogProduct(product)}
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
                              <div className="text-xs text-zinc-500 dark:text-zinc-400 break-all">
                                <span className="font-medium">Barkod:</span>{" "}
                                {product.barcode}
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
                            <span className="tabular-nums text-zinc-600 dark:text-zinc-300 break-all text-left">
                              {product.barcode}
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
                    message={`"${searchQuery}" için sonuç bulunamadı. Yeni ürün ekleyebilir veya farklı bir arama deneyebilirsiniz.`}
                    icon={PackageSearch}
                  />
                  <button
                    type="button"
                    onClick={() => setManualAddProductOpen(true)}
                    className="flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 min-h-[44px] dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                  >
                    <Plus className="size-5 shrink-0" aria-hidden />
                    Yeni Ürün Ekleme
                  </button>
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
        <div className="overflow-clip rounded-xl border border-zinc-200 dark:border-zinc-700">
          <div
            role="tablist"
            aria-label="Eksik, fazla, yaklaşan SKT, sayım, kasa/palet sayımı ve istatistikler"
            className="sticky top-[var(--search-strip-h,5rem)] z-[9] grid grid-cols-6 gap-0 border-b border-zinc-200 bg-zinc-50/95 backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-800/95 sm:flex sm:flex-wrap"
          >
            {visiblePanelTabs.map((tab, tabIndex) => {
              const active = activeTab === tab.key;
              const Icon = tab.icon;
              // Mobilde 3 sütunlu düzen: 5 sekme varsa son ikisi yarım genişlikte
              const tabSpan =
                visiblePanelTabs.length % 3 === 2 && tabIndex >= visiblePanelTabs.length - 2
                  ? "col-span-3"
                  : "col-span-2";
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={tab.panelId}
                  id={tab.tabId}
                  onClick={() => setActiveTab(tab.key)}
                  className={`tab-btn ${tabSpan} relative flex min-h-10 min-w-0 items-center justify-center gap-1 whitespace-nowrap px-1 py-2.5 text-[12px] font-medium transition duration-200 min-[380px]:text-[13px] sm:col-auto sm:min-h-[44px] sm:gap-2 sm:px-6 sm:py-4 sm:text-base motion-reduce:transition-none ${
                    active ? tab.activeClass : TAB_INACTIVE_CLASS
                  }`}
                >
                  <Icon
                    className={`size-[14px] shrink-0 min-[380px]:size-[15px] sm:size-[18px] ${active ? "tab-icon-active" : "tab-icon-idle opacity-70"}`}
                    aria-hidden
                  />
                  <span>
                    {tab.label}
                    {tab.labelExtra && <span className="hidden sm:inline">{tab.labelExtra}</span>}
                  </span>
                  {active && (
                    <span
                      className={`tab-underline absolute bottom-0 left-0 right-0 h-0.5 ${tab.underlineClass}`}
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
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
                    : activeTab === "sayim"
                      ? "panel-sayim"
                      : activeTab === "kasaPalet"
                        ? "panel-kasa-palet"
                        : activeTab === "istatistik"
                          ? "panel-istatistik"
                          : "panel-missing"
            }
            aria-labelledby={
              activeTab === "missing"
                ? "tab-missing"
                : activeTab === "extra"
                  ? "tab-extra"
                  : activeTab === "expiring"
                    ? "tab-expiring"
                    : activeTab === "sayim"
                      ? "tab-sayim"
                      : activeTab === "kasaPalet"
                        ? "tab-kasa-palet"
                        : activeTab === "istatistik"
                          ? "tab-istatistik"
                          : "tab-missing"
            }
            className="min-h-[120px]"
          >
            {activeTab === "expiring" ? (
              // Yaklaşan SKT sekmesi
              <div className="sm:max-h-[55vh] sm:min-h-[8rem] sm:overflow-auto">
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
                            className="cursor-default transition-colors duration-150 hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
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
                                  Barkod: {product.barcode}
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
                              <span className="text-zinc-600 dark:text-zinc-400">{product.barcode}</span>
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
            ) : activeTab === "kasaPalet" ? (
              <KasaPaletSayimTabContent
                key={warehouseId}
                warehouseId={warehouseId}
                onSuccess={setSuccessModalMessage}
                onError={(message) => setToast({ message, type: "error", autoClose: 12000 })}
              />
            ) : activeTab === "istatistik" ? (
              <IstatistiklerTabContent />
            ) : isLoading || catalogLoading ? (
              <ListSkeleton />
            ) : activeTab === "sayim" ? (
              <SayimTabContent
                warehouseId={warehouseId}
                missingItems={missingItems}
                extraItems={extraItems}
                catalogByBarcode={catalogByBarcode}
                onApplyChange={handleSayimChange}
              />
            ) : (
              <div className="flex min-h-[8rem] flex-col">
                {displayItems.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2 dark:border-zinc-700 dark:bg-zinc-800/50">
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300 sm:hidden">
                      <StockSelectCheckbox
                        checked={allVisibleSelected}
                        indeterminate={someVisibleSelected}
                        onCheckedChange={toggleSelectAllVisible}
                        ariaLabel="Listedeki tüm ürünleri seç"
                      />
                      Tümünü seç
                    </label>
                    {selectedVisibleCount > 0 ? (
                      <>
                        <span className="text-xs font-medium tabular-nums text-zinc-700 dark:text-zinc-200">
                          {selectedVisibleCount} ürün seçildi
                        </span>
                        <button
                          type="button"
                          onClick={() => setBulkDeleteConfirmOpen(true)}
                          disabled={bulkDeleting}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                          Seçilenleri sil
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedStockIds(new Set())}
                          disabled={bulkDeleting}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-200 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        >
                          Seçimi kaldır
                        </button>
                      </>
                    ) : (
                      <span className="hidden text-xs text-zinc-500 sm:inline dark:text-zinc-400">
                        Toplu silmek için ürün seçin
                      </span>
                    )}
                  </div>
                )}
              <div
                className="sm:max-h-[55vh] sm:min-h-[8rem] sm:overflow-auto"
                aria-label={activeTab === "missing" ? "Eksik ürünler listesi" : "Fazla ürünler listesi"}
              >
                {/* Başlık satırı — sadece desktop'ta göster (STOCK_LIST_COLUMNS) */}
                <div
                  className="hidden sm:grid sticky top-0 z-10 gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-left text-sm font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400"
                  style={{ 
                    gridTemplateColumns: STOCK_LIST_GRID,
                  }}
                >
                  <span className="flex items-center justify-center">
                    <StockSelectCheckbox
                      checked={allVisibleSelected}
                      indeterminate={someVisibleSelected}
                      onCheckedChange={toggleSelectAllVisible}
                      ariaLabel="Listedeki tüm ürünleri seç"
                    />
                  </span>
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
                    className="flex sm:hidden flex-wrap gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2 dark:border-zinc-700 dark:bg-zinc-800/50"
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
                        className={`cursor-pointer transition-colors duration-150 ${
                          selectedStockIds.has(item.id)
                            ? "bg-zinc-100 hover:bg-zinc-200/90 dark:bg-zinc-800/80 dark:hover:bg-zinc-700/80"
                            : "hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
                        }`}
                      >
                        {/* Mobil görünüm: kompakt kart (resim + bilgiler solda, işlemler sağda) */}
                        <div className="flex items-start gap-2.5 px-3 py-3 sm:hidden">
                          <div
                            className="flex shrink-0 items-start pt-5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <StockSelectCheckbox
                              checked={selectedStockIds.has(item.id)}
                              onCheckedChange={(checked) =>
                                toggleStockSelected(item.id, checked)
                              }
                              ariaLabel={`${item.name} kaydını seç`}
                            />
                          </div>
                          <div className="shrink-0">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="size-14 rounded-lg object-cover"
                                width={56}
                                height={56}
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex size-14 items-center justify-center rounded-lg bg-zinc-200 dark:bg-zinc-700">
                                <PackageX className="size-6 text-zinc-400 dark:text-zinc-500" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
                              {item.name}
                            </p>
                            <p className="mt-0.5 break-all font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                              {item.barcode}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-semibold tabular-nums text-zinc-800 dark:bg-zinc-700/60 dark:text-zinc-100">
                                {item.quantity} adet
                              </span>
                              <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-medium tabular-nums text-zinc-700 dark:bg-zinc-700/60 dark:text-zinc-200">
                                {getItemLineTotalTry(item, catalogPriceByBarcode).text}
                              </span>
                            </div>
                            {item.notes && (
                              <p className="mt-1 line-clamp-2 break-words text-xs text-zinc-500 dark:text-zinc-400">
                                {item.notes}
                              </p>
                            )}
                            {(item.createdAt || item.updatedAt) && (
                              <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                                {item.updatedAt
                                  ? <>Güncelleme: {formatDateTime(item.updatedAt)}</>
                                  : <>Eklenme: {formatDateTime(item.createdAt)}</>}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-col gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(item);
                              }}
                              className="flex size-10 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
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
                              className="flex size-10 items-center justify-center rounded-lg text-red-600 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
                              aria-label="Ürünü sil"
                              title="Sil"
                            >
                              <Trash2 className="size-4.5" />
                            </button>
                          </div>
                        </div>
                        
                        {/* Desktop görünüm: Grid layout */}
                        <div
                          className="hidden sm:grid gap-4 px-4 py-3 text-sm"
                        style={{ 
                          gridTemplateColumns: STOCK_LIST_GRID,
                        }}
                      >
                        <span
                          className="flex items-center justify-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <StockSelectCheckbox
                            checked={selectedStockIds.has(item.id)}
                            onCheckedChange={(checked) =>
                              toggleStockSelected(item.id, checked)
                            }
                            ariaLabel={`${item.name} kaydını seç`}
                          />
                        </span>
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
                              ? "tabular-nums text-zinc-600 dark:text-zinc-300 break-all"
                              : "tabular-nums text-zinc-600 dark:text-zinc-300";
                          return (
                            <span key={col.key} className={cellClass}>
                              {value}
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
                            style={{ gridColumn: "3 / -1" }}
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
              </div>
            )}
          </div>
        </div>
          )}
      </section>

      {/* Yaklaşan SKT uyarısı: geniş ekranda sağ altta sabit, animasyonlu rozet */}
      {isSogukkuyu && showExpiringNotification && expiringProductsToday.length > 0 && (
        <ExpiringAlertBanner
          variant="floating"
          count={expiringProductsToday.length}
          onOpen={() => setIsExpiringNotificationOpen(true)}
          onDismiss={handleCloseExpiringAlertBadge}
        />
      )}

      {/* En üste çık: Kasa/Palet'in mobil sabit düğmesinin ve geniş ekrandaki SKT rozetinin üstünde durur */}
      <ScrollToTopButton
        className={`right-4 sm:right-6 ${activeTab === "kasaPalet" ? "bottom-24" : "bottom-5"} ${
          isSogukkuyu && showExpiringNotification && expiringProductsToday.length > 0
            ? "sm:bottom-24"
            : "sm:bottom-6"
        }`}
      />

      {/* Yaklaşan SKT Bildirim Penceresi */}
      {isSogukkuyu &&
        showExpiringNotification &&
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
          supplierReturnDays={
            catalogProducts.find((p) => p.barcode === editingExpiringProduct.barcode)
              ?.supplierReturnDays
          }
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

      <ManualAddProductModal
        isOpen={manualAddProductOpen}
        onClose={() => setManualAddProductOpen(false)}
        initial={manualAddInitial}
        onSaved={(product) => {
          setCatalogProducts((prev) => {
            const exists = prev.some((p) => p.barcode === product.barcode);
            if (exists) {
              return prev.map((p) =>
                p.barcode === product.barcode
                  ? { ...p, name: product.name, imageUrl: product.imageUrl }
                  : p
              );
            }
            return [
              {
                name: product.name,
                barcode: product.barcode,
                imageUrl: product.imageUrl,
              },
              ...prev,
            ];
          });
          setSearchQuery(product.barcode);
          setSuccessModalMessage("Ürün kataloğa kaydedildi.");
          void reloadCatalogProducts().catch(() => null);
        }}
      />

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

      <ConfirmModal
        isOpen={bulkDeleteConfirmOpen}
        onClose={() => {
          if (!bulkDeleting) setBulkDeleteConfirmOpen(false);
        }}
        title="Seçilenleri sil"
        message={
          activeTab === "extra"
            ? `${selectedVisibleCount} fazla kaydı silmek istediğinize emin misiniz?`
            : `${selectedVisibleCount} eksik kaydı silmek istediğinize emin misiniz?`
        }
        confirmLabel={bulkDeleting ? "Siliniyor…" : "Sil"}
        cancelLabel="İptal"
        variant="danger"
        onConfirm={() => {
          void handleBulkDeleteSelected();
          setBulkDeleteConfirmOpen(false);
        }}
      />

      <BakeryProductsEditor
        isOpen={bakeryEditorOpen && isSogukkuyu}
        onClose={() => setBakeryEditorOpen(false)}
        catalogProducts={catalogProducts}
        getProductImage={getCatalogProductImage}
        onCatalogProductSaved={(product) => {
          setCatalogProducts((prev) =>
            prev.some((p) => p.barcode === product.barcode)
              ? prev
              : [{ name: product.name, barcode: product.barcode, imageUrl: product.imageUrl }, ...prev]
          );
          void reloadCatalogProducts().catch(() => null);
        }}
      />

      <BakeryExitWizard
        isOpen={bakeryExitSnapshot !== null && bakeryExitSnapshot.length > 0}
        onClose={handleCloseBakeryExit}
        queue={bakeryExitSnapshot ?? []}
        shelfStockByBarcode={bakeryExitStocks}
        bakeryImageBarcodes={bakeryImageBarcodes}
        getDefaultProductImage={getCatalogProductImage}
      />

      <SevkiyatControlWizard
        isOpen={sevkiyatWizardOpen}
        onClose={() => setSevkiyatWizardOpen(false)}
        warehouseId={warehouseId}
        missingItems={items
          .filter((i) => i.type === "missing")
          .map((i) => ({
            name: i.name,
            barcode: i.barcode,
            quantity: i.quantity,
            imageUrl: i.imageUrl,
          }))}
        getProductImage={getCatalogProductImage}
      />

    </div>
  );
}

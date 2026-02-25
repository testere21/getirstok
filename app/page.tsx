"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { PackageMinus, PackagePlus, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { AddProductModal } from "./components/AddProductModal";
import { SearchBar } from "./components/SearchBar";
import { BarcodeScanner } from "./components/BarcodeScanner";
import { StatCardSkeleton } from "./components/StatCardSkeleton";
import { ListSkeleton } from "./components/ListSkeleton";
import { EmptyState } from "./components/EmptyState";
import { ErrorMessage } from "./components/ErrorMessage";
import { Toast, type ToastType } from "./components/Toast";
import { PackageSearch, PackageX, Calendar, AlertTriangle } from "lucide-react";
import { deleteStockItem, subscribeStockItems } from "@/app/lib/stockService";
import { ExpiringProductNotification } from "./components/ExpiringProductNotification";
import { ExpiringProductModal } from "./components/ExpiringProductModal";
import type { StockItemWithId, ExpiringProductWithId } from "@/app/lib/types";
import { formatDateTime } from "@/app/lib/utils";

/** Katalog ürünü (api/products) */
interface CatalogProduct {
  name: string;
  barcode: string;
  imageUrl?: string;
  productId?: string;
}

export type ModalType = null | "missing" | "extra";
export type TabType = "missing" | "extra" | "expiring";

interface ToastState {
  message: string;
  type: ToastType;
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
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("missing");
  const [editingItem, setEditingItem] = useState<StockItemWithId | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  // Sıralama state'leri
  const [sortField, setSortField] = useState<"name" | "barcode" | "quantity" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  // Yaklaşan SKT bildirimi
  const [expiringProductsToday, setExpiringProductsToday] = useState<ExpiringProductWithId[]>([]);
  const [showExpiringNotification, setShowExpiringNotification] = useState(false);
  const [isExpiringNotificationOpen, setIsExpiringNotificationOpen] = useState(false);
  // Yaklaşan SKT listesi (sekme için)
  const [expiringProducts, setExpiringProducts] = useState<ExpiringProductWithId[]>([]);
  const [expiringProductsLoading, setExpiringProductsLoading] = useState(false);
  const [editingExpiringProduct, setEditingExpiringProduct] = useState<ExpiringProductWithId | null>(null);

  // Arama için minimum karakter sayısı
  const MIN_SEARCH_LENGTH = 2;

  // Arama için debounce süresi (ms cinsinden)
  const DEBOUNCE_DELAY = 300;

  // Debounce edilmiş arama sorgusu — ağır işlemler bu değer üzerinden çalışır
  const debouncedSearchQuery = useDebounce(searchQuery, DEBOUNCE_DELAY);

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
      const match = catalogProducts.find((p) => p.barcode === barcode);
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
    const filtered = catalogProducts.filter(
      (product) =>
        (product.name || "").toLowerCase().includes(q) ||
        (product.barcode || "").toLowerCase().includes(q)
    );
    
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
      return items.filter(
        (item) => item.barcode === selectedCatalogProduct.barcode
      );
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
    const items = activeTab === "missing" ? missingItems : extraItems;
    
    if (!sortField) return items;
    
    // Sıralama yap
    const sorted = [...items].sort((a, b) => {
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
  }, [activeTab, missingItems, extraItems, sortField, sortDirection]);

  // Kısa arama kontrolü (örneğin tek karakter yazıldığında)
  const trimmedSearchQuery = debouncedSearchQuery.trim();
  const isShortSearchQuery =
    trimmedSearchQuery.length > 0 && trimmedSearchQuery.length < MIN_SEARCH_LENGTH;
  
  // Sıralama fonksiyonu
  const handleSort = useCallback((field: "name" | "barcode" | "quantity") => {
    if (sortField === field) {
      // Aynı alana tekrar tıklandıysa yönü değiştir
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // Yeni alana tıklandıysa o alanı seç ve varsayılan olarak artan sırala
      setSortField(field);
      setSortDirection("asc");
    }
  }, [sortField, sortDirection]);

  const handleDelete = useCallback(async (item: StockItemWithId) => {
    if (!confirm("Bu ürünü silmek istediğinize emin misiniz?")) return;
    try {
      setDeletingId(item.id);
      await deleteStockItem(item.id);
      setToast({ message: "Ürün başarıyla silindi.", type: "success" });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Ürün silinirken bir hata oluştu.";
      setToast({ message: errorMessage, type: "error" });
    } finally {
      setDeletingId(null);
    }
  }, []);

  const handleEdit = useCallback((item: StockItemWithId) => {
    setEditingItem(item);
  }, []);

  const handleItemClick = useCallback((item: StockItemWithId) => {
    // StockItem'dan CatalogProduct oluştur
    const catalogProduct: CatalogProduct = {
      name: item.name,
      barcode: item.barcode,
      imageUrl: item.imageUrl,
    };
    setSelectedCatalogProduct(catalogProduct);
  }, []);

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
            autoClose={toast.type === "error" ? 7000 : 5000}
          />
        </div>
      )}

      {/* Sıra: 1) Butonlar, 2) Sticky arama, 3) Altında içerik */}
      <section aria-label="Ekleme ve arama" className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setModalType("missing")}
            className="flex items-center justify-center gap-2 rounded-xl px-5 py-4 text-base font-medium text-white shadow-sm transition-all duration-200 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] sm:py-5 sm:text-lg min-h-[44px]"
            style={{ backgroundColor: "var(--color-missing)" }}
            aria-label="Eksik ürün ekle"
          >
            <PackageMinus className="size-6 shrink-0" aria-hidden />
            Eksik Ürün Ekle
          </button>
          <button
            type="button"
            onClick={() => setModalType("extra")}
            className="flex items-center justify-center gap-2 rounded-xl px-5 py-4 text-base font-medium text-white shadow-sm transition-all duration-200 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] sm:py-5 sm:text-lg min-h-[44px]"
            style={{ backgroundColor: "var(--color-extra)" }}
            aria-label="Fazla ürün ekle"
          >
            <PackagePlus className="size-6 shrink-0" aria-hidden />
            Fazla Ürün Ekle
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

      <AddProductModal
        isOpen={modalType !== null || editingItem !== null || selectedCatalogProduct !== null}
        onClose={() => {
          setModalType(null);
          setEditingItem(null);
          setSelectedCatalogProduct(null);
        }}
        type={editingItem ? editingItem.type : selectedCatalogProduct ? activeTab : modalType === "extra" ? "extra" : "missing"}
        initialItem={editingItem ?? undefined}
        catalogProduct={selectedCatalogProduct ?? undefined}
        stockItems={items}
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
          // Ürün kartı içindeki eksik/fazla kayıtları silmek için ortak silme handler'ı
          void handleDelete(item);
        }}
        onSuccess={(message) => {
          setToast({ message, type: "success" });
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
              <p className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl" style={{ color: "var(--color-missing)" }}>
                {totalMissing}
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
              <p className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl" style={{ color: "var(--color-extra)" }}>
                {totalExtra}
              </p>
            </div>
          </div>
          )}
        </section>
      )}

      {/* Sayfa tamamen boşsa ve arama yapılmamışsa: büyük empty state */}
      {isPageEmpty && !searchQuery.trim() && (
        <EmptyState
          title="Henüz ürün eklenmemiş"
          message="Eksik veya fazla ürün eklemek için yukarıdaki butonları kullanabilirsiniz."
          icon={PackageX}
        />
      )}

      {/* Alt bölüm: Arama sonuçları veya sekmeli listeler */}
      {(!isPageEmpty || searchQuery.trim()) && (
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
                                <span className="font-medium">Barkod:</span> {product.barcode}
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
                <EmptyState
                  title="Arama sonucu bulunamadı"
                  message={`"${searchQuery}" için sonuç bulunamadı. Farklı bir arama terimi deneyin.`}
                  icon={PackageSearch}
                />
                )}
              </div>
            </div>
          ) : (
            /* Arama yapılmadığında: Sekmeli listeler göster */
        <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
          <div
            role="tablist"
            aria-label="Eksik ve fazla ürün listeleri"
            className="flex gap-0 border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800"
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
          </div>
          <div
            role="tabpanel"
            id={activeTab === "missing" ? "panel-missing" : activeTab === "extra" ? "panel-extra" : "panel-expiring"}
            aria-labelledby={activeTab === "missing" ? "tab-missing" : activeTab === "extra" ? "tab-extra" : "tab-expiring"}
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
            ) : isLoading || catalogLoading ? (
              <ListSkeleton />
            ) : (
              <div
                className="max-h-[55vh] min-h-[8rem] overflow-auto"
                aria-label={activeTab === "missing" ? "Eksik ürünler listesi" : "Fazla ürünler listesi"}
              >
                {/* Başlık satırı — sadece desktop'ta göster */}
                <div
                  className="hidden sm:grid sticky top-0 z-10 gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-left text-sm font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400"
                  style={{ 
                    gridTemplateColumns: "3rem minmax(0,1fr) minmax(8rem,10rem) minmax(3rem,4rem) minmax(0,1fr) minmax(5rem,6rem)",
                  }}
                >
                  <span></span>
                  <button
                    type="button"
                    onClick={() => handleSort("name")}
                    className={`flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors text-left ${
                      sortField === "name" ? "text-zinc-900 dark:text-zinc-100" : ""
                    }`}
                  >
                  <span>Ürün</span>
                    {sortField === "name" && (
                      sortDirection === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSort("barcode")}
                    className={`flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors text-left ${
                      sortField === "barcode" ? "text-zinc-900 dark:text-zinc-100" : ""
                    }`}
                  >
                  <span>Barkod</span>
                    {sortField === "barcode" && (
                      sortDirection === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSort("quantity")}
                    className={`flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors text-left ${
                      sortField === "quantity" ? "text-zinc-900 dark:text-zinc-100" : ""
                    }`}
                  >
                  <span>Miktar</span>
                    {sortField === "quantity" && (
                      sortDirection === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                    )}
                  </button>
                  <span>Notlar</span>
                  <span className="text-right">İşlem</span>
                </div>
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
                            <div className="font-medium text-zinc-900 dark:text-zinc-100 text-sm leading-snug line-clamp-2">
                              {item.name}
                            </div>
                            <div className="text-xs text-zinc-500 dark:text-zinc-400 break-all">
                              <span className="font-medium">Barkod:</span> {item.barcode}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                              <span className="text-zinc-600 dark:text-zinc-300">
                                <span className="font-medium">Miktar:</span> <span className="tabular-nums font-semibold text-base">{item.quantity}</span>
                              </span>
                              {item.notes && (
                                <span className="text-zinc-500 dark:text-zinc-400">
                                  <span className="font-medium">Not:</span> <span className="line-clamp-1">{item.notes}</span>
                                </span>
                              )}
                            </div>
                            {(item.createdAt || item.updatedAt) && (
                              <div className="text-xs text-zinc-400 dark:text-zinc-500">
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
                                  handleDelete(item);
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
                          gridTemplateColumns: "3rem minmax(0,1fr) minmax(8rem,10rem) minmax(3rem,4rem) minmax(0,1fr) minmax(5rem,6rem)",
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
                        <span className="min-w-0 font-medium text-zinc-900 dark:text-zinc-100">
                          {item.name}
                        </span>
                        <span className="tabular-nums text-zinc-600 dark:text-zinc-300 break-all">
                          {item.barcode}
                        </span>
                        <span className="tabular-nums text-zinc-600 dark:text-zinc-300">
                          {item.quantity}
                        </span>
                        <span className="min-w-0 truncate text-zinc-500 dark:text-zinc-400">
                          {item.notes || "—"}
                        </span>
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
                                handleDelete(item);
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
                            className="col-span-5 mt-0.5 text-xs text-zinc-400 dark:text-zinc-500"
                            style={{ gridColumn: "span 5" }}
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
      )}

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
    </div>
  );
}

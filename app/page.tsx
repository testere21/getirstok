"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PackageMinus, PackagePlus, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { AddProductModal } from "./components/AddProductModal";
import { SearchBar } from "./components/SearchBar";
import { BarcodeScanner } from "./components/BarcodeScanner";
import { StatCardSkeleton } from "./components/StatCardSkeleton";
import { ListSkeleton } from "./components/ListSkeleton";
import { EmptyState } from "./components/EmptyState";
import { ErrorMessage } from "./components/ErrorMessage";
import { Toast, type ToastType } from "./components/Toast";
import { PackageSearch, PackageX } from "lucide-react";
import { deleteStockItem, subscribeStockItems } from "@/app/lib/stockService";
import type { StockItemWithId } from "@/app/lib/types";
import { formatDateTime } from "@/app/lib/utils";

/** Katalog ürünü (api/products) */
interface CatalogProduct {
  name: string;
  barcode: string;
  imageUrl?: string;
  productId?: string;
}

export type ModalType = null | "missing" | "extra";
export type TabType = "missing" | "extra";

interface ToastState {
  message: string;
  type: ToastType;
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

  /**
   * Filtrelenmiş katalog ürünleri — arama filtresi products.json'dan ürünleri filtreler.
   * Kullanıcı arama yaptığında katalog ürünleri gösterilir.
   * Duplicate'leri temizler (aynı barcode veya productId'ye sahip ürünleri birleştirir).
   */
  const filteredCatalogProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
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
  }, [catalogProducts, searchQuery]);

  /**
   * Filtrelenmiş Firestore kayıtları — istatistikler için kullanılır.
   * Arama yapılmadığında tüm kayıtlar gösterilir.
   * Arama yapıldığında name veya barcode alanında arama yapar.
   * Eğer katalog ürünü seçilmişse, o ürüne ait kayıtları gösterir.
   */
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    
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
  }, [items, searchQuery, selectedCatalogProduct]);

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
                {isLoading || catalogLoading ? (
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
              </div>
              <div
                role="tabpanel"
                id={activeTab === "missing" ? "panel-missing" : "panel-extra"}
                aria-labelledby={activeTab === "missing" ? "tab-missing" : "tab-extra"}
                className="min-h-[120px]"
              >
                {isLoading || catalogLoading ? (
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
    </div>
  );
}

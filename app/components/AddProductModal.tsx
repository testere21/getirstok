"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Pencil, PackageMinus, PackagePlus, RefreshCw, Trash2, Calendar } from "lucide-react";
import { addStockItem, updateStockItem } from "@/app/lib/stockService";
import { ErrorMessage } from "./ErrorMessage";
import { BarcodeImage } from "./BarcodeImage";
import { ExpiringProductModal } from "./ExpiringProductModal";
import { ConfirmModal } from "./ConfirmModal";
import type { StockItemWithId, ExpiringProductWithId } from "@/app/lib/types";
import { catalogProductMatchesBarcode } from "@/app/lib/catalogBarcodeMatch";
import { formatDateTime } from "@/app/lib/utils";

export type AddProductModalType = "missing" | "extra";

/** Katalog ürünü (api/products) */
export interface CatalogProduct {
  name: string;
  barcode: string;
  barcodes?: string[];
  imageUrl?: string;
  productId?: string;
  price?: number;
  supplierReturnDays?: number;
}

function formatTryPriceTRY(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function CatalogProductPriceHighlight({
  price,
  align = "center",
  variant = "default",
}: {
  price: number;
  align?: "center" | "start";
  /** soft: ürün kartı modalında daha hafif çerçeve */
  variant?: "default" | "soft";
}) {
  const box =
    variant === "soft"
      ? "mt-1.5 flex max-w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg border border-amber-400/40 bg-gradient-to-r from-amber-50/95 via-orange-50/80 to-amber-50/95 px-3 py-1.5 shadow-sm ring-1 ring-amber-200/40 dark:border-amber-500/35 dark:from-amber-950/55 dark:via-orange-950/45 dark:to-amber-950/55 dark:ring-amber-700/25"
      : "mt-2 flex max-w-full flex-wrap items-baseline gap-x-2.5 gap-y-0.5 rounded-xl border-2 border-amber-400/95 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-100 px-4 py-2.5 shadow-md ring-2 ring-amber-200/60 dark:border-amber-500 dark:from-amber-950/70 dark:via-orange-950/55 dark:to-amber-950/70 dark:ring-amber-700/45";
  return (
    <div
      className={
        box +
        (align === "center"
          ? " mx-auto justify-center text-center"
          : " w-full justify-start sm:w-auto")
      }
      role="status"
    >
      <span className="shrink-0 text-xs font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-200">
        Fiyat
      </span>
      <span
        className={
          variant === "soft"
            ? "min-w-0 break-all text-xl font-bold tabular-nums tracking-tight text-amber-950 dark:text-amber-50"
            : "min-w-0 break-all text-2xl font-black tabular-nums tracking-tight text-amber-950 drop-shadow-sm dark:text-amber-50"
        }
      >
        {formatTryPriceTRY(price)}
      </span>
    </div>
  );
}

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: AddProductModalType;
  /** Düzenleme modu: verilirse form bu kayıtla doldurulur ve submit güncelleme yapar */
  initialItem?: StockItemWithId | null;
  /** Katalog ürünü: arama sonucundan seçilen ürün (eksik/fazla bilgilerini göstermek için) */
  catalogProduct?: CatalogProduct | null;
  /** Firestore kayıtları: catalogProduct için eksik/fazla bilgilerini göstermek için */
  stockItems?: StockItemWithId[];
  /** Katalog ürününden eksik/fazla ekleme için callback */
  onAddFromCatalog?: (product: CatalogProduct, type: AddProductModalType) => void;
  /** Kayıt düzenleme için callback */
  onEditItem?: (item: StockItemWithId) => void;
  /** Kayıt silme için callback (sadece ilgili eksik/fazla kaydı siler, ürünü değil) */
  onDeleteItem?: (item: StockItemWithId) => void;
  /** Başarılı işlem sonrası çağrılır (toast göstermek için) */
  onSuccess?: (message: string) => void;
  /**
   * Fırın ürünleri sekmesinden açılan ürün kartı: fiyat, eksik/fazla ekle,
   * tedarikçi iade günü ve yaklaşan SKT aksiyonları gösterilmez.
   */
  bakeryCatalogCard?: boolean;
}

const initialForm = { name: "", barcode: "", quantity: "", notes: "" };

export function AddProductModal({
  isOpen,
  onClose,
  type,
  initialItem,
  catalogProduct,
  stockItems = [],
  onAddFromCatalog,
  onEditItem,
  onDeleteItem,
  onSuccess,
  bakeryCatalogCard = false,
}: AddProductModalProps) {
  const [name, setName] = useState(initialForm.name);
  const [barcode, setBarcode] = useState(initialForm.barcode);
  const [quantity, setQuantity] = useState(initialForm.quantity);
  const [notes, setNotes] = useState(initialForm.notes);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /* Katalogdan seçim (ekleme modu) */
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [showFormFromCatalog, setShowFormFromCatalog] = useState(false);
  const [formTypeFromCatalog, setFormTypeFromCatalog] = useState<AddProductModalType>("missing");
  /* Getir stok bilgisi */
  const [getirStock, setGetirStock] = useState<number | null>(null);
  const [getirStockLoading, setGetirStockLoading] = useState(false);
  const [getirStockError, setGetirStockError] = useState<string | null>(null);
  /** Son getir-stok isteği tamamlandı mı (başlangıçta null mesajı göstermemek için) */
  const [getirStockFetchComplete, setGetirStockFetchComplete] = useState(false);
  const getirStockFetchAbortRef = useRef<AbortController | null>(null);
  /* Tedarikçi iade tarihi */
  const [supplierReturnDate, setSupplierReturnDate] = useState<number | null>(null);
  const [supplierReturnDateLoading, setSupplierReturnDateLoading] = useState(false);
  const [supplierReturnDateError, setSupplierReturnDateError] = useState<string | null>(null);
  /* Yaklaşan SKT */
  const [expiringProductModalOpen, setExpiringProductModalOpen] = useState(false);
  const [existingExpiringProduct, setExistingExpiringProduct] = useState<ExpiringProductWithId | null>(null);
  /* Silme onayı: hangi kayıt silinecek (modal açık olunca) */
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<StockItemWithId | null>(null);
  /** Katalog kartında ürün görseli tam ekran önizleme */
  const [catalogImageLightboxOpen, setCatalogImageLightboxOpen] = useState(false);

  const isEditMode = Boolean(initialItem?.id);
  const isCatalogViewMode = Boolean(catalogProduct && !isEditMode && !showFormFromCatalog);

  /** Katalog / products.json tedarikçi iade günü (modal + Yaklaşan SKT; barkod + alternatif barkodlar) */
  const resolvedCatalogSupplierReturnDays = useMemo(() => {
    const bc = (catalogProduct?.barcode || initialItem?.barcode || "").trim();
    if (!bc) return undefined;
    if (
      typeof catalogProduct?.supplierReturnDays === "number" &&
      Number.isFinite(catalogProduct.supplierReturnDays)
    ) {
      return catalogProduct.supplierReturnDays;
    }
    const row = catalog.find((p) => catalogProductMatchesBarcode(p, bc));
    return typeof row?.supplierReturnDays === "number" ? row.supplierReturnDays : undefined;
  }, [catalogProduct, initialItem?.barcode, catalog]);

  /** Panelde gösterim: önce state/API/cache, yoksa katalogdan anında */
  const displaySupplierReturnDays = useMemo((): number | null => {
    if (supplierReturnDate !== null) return supplierReturnDate;
    if (
      typeof resolvedCatalogSupplierReturnDays === "number" &&
      Number.isFinite(resolvedCatalogSupplierReturnDays)
    ) {
      return resolvedCatalogSupplierReturnDays;
    }
    return null;
  }, [supplierReturnDate, resolvedCatalogSupplierReturnDays]);

  // CatalogProduct için eksik/fazla kayıtlarını hesapla
  const catalogProductItems = useMemo(() => {
    if (!catalogProduct) return { missing: [], extra: [] };
    const productItems = stockItems.filter((item) => item.barcode === catalogProduct.barcode);
    return {
      missing: productItems.filter((item) => item.type === "missing"),
      extra: productItems.filter((item) => item.type === "extra"),
    };
  }, [catalogProduct, stockItems]);

  // Ürün durumu kontrolü: eksik/fazla durumunu belirle
  const productStatus = useMemo(() => {
    if (!catalogProduct) {
      return {
        hasMissing: false,
        hasExtra: false,
        isOnlyMissing: false,
        isOnlyExtra: false,
      };
    }
    const hasMissing = catalogProductItems.missing.length > 0;
    const hasExtra = catalogProductItems.extra.length > 0;
    const isOnlyMissing = hasMissing && !hasExtra;
    const isOnlyExtra = hasExtra && !hasMissing;
    
    return {
      hasMissing,
      hasExtra,
      isOnlyMissing,
      isOnlyExtra,
    };
  }, [catalogProduct, catalogProductItems]);

  const modalRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Modal açıldığında focus yönetimi
  useEffect(() => {
    if (!isOpen) return;

    // Açılmadan önceki aktif elementi sakla
    previousActiveElementRef.current = document.activeElement as HTMLElement;

    // Modal açıldığında ilk input'a focus taşı
    const timer = setTimeout(() => {
      if (firstInputRef.current) {
        firstInputRef.current.focus();
      } else if (modalRef.current) {
        // İlk focusable element'i bul
        const firstFocusable = modalRef.current.querySelector<HTMLElement>(
          'input:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (firstFocusable) {
          firstFocusable.focus();
        }
      }
    }, 100);

    // Escape: önce görsel lightbox, sonra tüm modal
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (catalogImageLightboxOpen) {
        setCatalogImageLightboxOpen(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", handleEscape);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose, catalogImageLightboxOpen]);

  // Modal kapatıldığında focus'u geri taşı
  useEffect(() => {
    if (!isOpen && previousActiveElementRef.current) {
      // Kısa bir gecikme ile focus'u geri taşı (modal animasyonu için)
      const timer = setTimeout(() => {
        if (previousActiveElementRef.current && document.contains(previousActiveElementRef.current)) {
          previousActiveElementRef.current.focus();
        }
        previousActiveElementRef.current = null;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Katalogu sadece ekleme modunda ve modal açıkken çek
  useEffect(() => {
    if (!isOpen || isEditMode) return;
    setCatalogLoading(true);
    fetch("/api/products")
      .then((res) => res.json())
      .then((data: CatalogProduct[]) => setCatalog(Array.isArray(data) ? data : []))
      .catch(() => setCatalog([]))
      .finally(() => setCatalogLoading(false));
  }, [isOpen, isEditMode]);

  // Modal açıldığında formu doldur: düzenleme modunda initialItem, catalogProduct modunda catalogProduct, ekleme modunda sıfırla
  useEffect(() => {
    if (isOpen) {
      if (initialItem) {
        setName(initialItem.name);
        setBarcode(initialItem.barcode);
        setQuantity(String(initialItem.quantity));
        setNotes(initialItem.notes ?? "");
        setSelectedProduct(null);
        setShowFormFromCatalog(false);
      } else if (catalogProduct && showFormFromCatalog) {
        // Katalog ürününden form görünümüne geçildiğinde: ürün bilgilerini doldur
        setSelectedProduct(catalogProduct);
        setName(catalogProduct.name);
        setBarcode(catalogProduct.barcode);
        setQuantity(initialForm.quantity);
        setNotes(initialForm.notes);
      } else if (catalogProduct && type) {
        // CatalogProduct görünüm modu: katalog ürününü seçili yap ama form gösterme
        setSelectedProduct(catalogProduct);
        setName(initialForm.name);
        setBarcode(initialForm.barcode);
        setQuantity(initialForm.quantity);
        setNotes(initialForm.notes);
        setShowFormFromCatalog(false);
      } else {
        setSelectedProduct(null);
        setCatalogSearch("");
        setName(initialForm.name);
        setBarcode(initialForm.barcode);
        setQuantity(initialForm.quantity);
        setNotes(initialForm.notes);
        setShowFormFromCatalog(false);
      }
      setValidationError(null);
      setSubmitError(null);
      setIsSubmitting(false); // Modal açıldığında submitting state'ini sıfırla
    } else {
      // Modal kapatıldığında tüm state'leri temizle
      setIsSubmitting(false);
      setValidationError(null);
      setSubmitError(null);
      setSelectedProduct(null);
      setCatalogSearch("");
      setName(initialForm.name);
      setBarcode(initialForm.barcode);
      setQuantity(initialForm.quantity);
      setNotes(initialForm.notes);
      setShowFormFromCatalog(false);
      // Getir stok state'lerini temizle
      getirStockFetchAbortRef.current?.abort();
      getirStockFetchAbortRef.current = null;
      setGetirStock(null);
      setGetirStockError(null);
      setGetirStockLoading(false);
      setGetirStockFetchComplete(false);
      // Tedarikçi iade tarihi state'lerini temizle
      setSupplierReturnDate(null);
      setSupplierReturnDateError(null);
      setSupplierReturnDateLoading(false);
      setCatalogImageLightboxOpen(false);
    }
  }, [isOpen, initialItem, catalogProduct, type, showFormFromCatalog]);

  // Ürün kartı: önce katalog (products.json), yoksa Firestore cache; Getir eklentisi sadece butonla
  useEffect(() => {
    if (!isOpen || bakeryCatalogCard) return;

    if (
      typeof resolvedCatalogSupplierReturnDays === "number" &&
      Number.isFinite(resolvedCatalogSupplierReturnDays)
    ) {
      setSupplierReturnDate(resolvedCatalogSupplierReturnDays);
      setSupplierReturnDateError(null);
      setSupplierReturnDateLoading(false);
      return;
    }

    const barcodeToCheck = catalogProduct?.barcode || initialItem?.barcode;
    if (!barcodeToCheck) return;

    const loadCachedSupplierReturnDate = async () => {
      try {
        const response = await fetch(
          `/api/getir-supplier-return-date-cache?barcode=${encodeURIComponent(barcodeToCheck)}`
        );
        const data = await response.json();

        if (data.success && data.days !== null) {
          setSupplierReturnDate(data.days);
          setSupplierReturnDateError(null);
          console.log("[AddProductModal] Cache'ten tedarikçi iade tarihi yüklendi:", data.days, "gün");
        }
      } catch (error) {
        console.log("[AddProductModal] Cache kontrolü başarısız (normal, cache yok olabilir):", error);
      }
    };

    void loadCachedSupplierReturnDate();
  }, [
    isOpen,
    bakeryCatalogCard,
    resolvedCatalogSupplierReturnDays,
    catalogProduct?.barcode,
    initialItem?.barcode,
  ]);

  // Ürün kartı açıldığında mevcut yaklaşan SKT kaydını kontrol et
  useEffect(() => {
    if (!isOpen || bakeryCatalogCard) return;

    const barcodeToCheck = catalogProduct?.barcode || initialItem?.barcode;
    if (!barcodeToCheck) return;

    const checkExistingExpiringProduct = async () => {
      try {
        const response = await fetch(
          `/api/expiring-products?barcode=${encodeURIComponent(barcodeToCheck)}`
        );
        const data = await response.json();

        if (data.success && data.product) {
          setExistingExpiringProduct(data.product);
        } else {
          setExistingExpiringProduct(null);
        }
      } catch (error) {
        console.log("[AddProductModal] Yaklaşan SKT kontrolü başarısız:", error);
        setExistingExpiringProduct(null);
      }
    };

    checkExistingExpiringProduct();
  }, [isOpen, bakeryCatalogCard, catalogProduct?.barcode, initialItem?.barcode]);

  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q)
    );
  }, [catalog, catalogSearch]);

  const loadGetirStockForBarcode = useCallback(
    async (barcodeToCheck: string, signal?: AbortSignal) => {
      const trimmed = barcodeToCheck?.trim();
      if (!trimmed) {
        setGetirStockError("Barkod bulunamadı");
        return;
      }

      setGetirStock(null);
      setGetirStockLoading(true);
      setGetirStockError(null);
      setGetirStockFetchComplete(false);

      try {
        const response = await fetch(
          `/api/getir-stock?barcode=${encodeURIComponent(trimmed)}`,
          { signal }
        );
        const data = await response.json();
        if (signal?.aborted) return;

        if (data.error) {
          setGetirStockError(data.error);
          setGetirStock(null);
        } else {
          setGetirStock(data.stock);
          setGetirStockError(null);
        }
        setGetirStockFetchComplete(true);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        if (signal?.aborted) return;
        console.error("Getir stok bilgisi çekilemedi:", error);
        setGetirStockError("Bağlantı hatası. Lütfen tekrar deneyin.");
        setGetirStock(null);
        setGetirStockFetchComplete(true);
      } finally {
        if (!signal?.aborted) {
          setGetirStockLoading(false);
        }
      }
    },
    []
  );

  /** Düzenleme modu: manuel "Getir Stoğunu Getir" */
  const handleGetGetirStock = () => {
    const barcodeToCheck = catalogProduct?.barcode || initialItem?.barcode;
    if (!barcodeToCheck?.trim()) {
      setGetirStockError("Barkod bulunamadı");
      return;
    }
    getirStockFetchAbortRef.current?.abort();
    const ac = new AbortController();
    getirStockFetchAbortRef.current = ac;
    void loadGetirStockForBarcode(barcodeToCheck, ac.signal);
  };

  // Katalog ürün detayı açılınca Getir stok otomatik çek (düzenleme / form modunda yok)
  useEffect(() => {
    if (!isOpen || !isCatalogViewMode) {
      return;
    }
    const bc = catalogProduct?.barcode?.trim();
    if (!bc) return;

    getirStockFetchAbortRef.current?.abort();
    const ac = new AbortController();
    getirStockFetchAbortRef.current = ac;
    void loadGetirStockForBarcode(bc, ac.signal);

    return () => {
      ac.abort();
    };
  }, [isOpen, isCatalogViewMode, catalogProduct?.barcode, loadGetirStockForBarcode]);

  // Tedarikçi iade: önce katalog; yalnızca yoksa Getir / eklenti API
  const handleGetSupplierReturnDate = async () => {
    const barcodeToCheck = catalogProduct?.barcode || initialItem?.barcode;

    if (!barcodeToCheck) {
      setSupplierReturnDateError("Barkod bulunamadı");
      return;
    }

    if (
      typeof resolvedCatalogSupplierReturnDays === "number" &&
      Number.isFinite(resolvedCatalogSupplierReturnDays)
    ) {
      setSupplierReturnDate(resolvedCatalogSupplierReturnDays);
      setSupplierReturnDateError(null);
      return;
    }

    setSupplierReturnDateLoading(true);
    setSupplierReturnDateError(null);

    try {
      const response = await fetch(`/api/getir-supplier-return-date?barcode=${encodeURIComponent(barcodeToCheck)}`);
      const data = await response.json();

      if (data.error) {
        setSupplierReturnDateError(data.error);
        setSupplierReturnDate(null);
      } else {
        setSupplierReturnDate(data.days);
        setSupplierReturnDateError(null);
      }
    } catch (error) {
      console.error("Tedarikçi iade tarihi çekilemedi:", error);
      setSupplierReturnDateError("Bağlantı hatası. Lütfen tekrar deneyin.");
      setSupplierReturnDate(null);
    } finally {
      setSupplierReturnDateLoading(false);
    }
  };

  if (!isOpen) return null;

  const title = isCatalogViewMode 
    ? catalogProduct?.name || "Ürün Detayları"
    : isEditMode 
    ? "Ürünü Düzenle" 
    : showFormFromCatalog
    ? formTypeFromCatalog === "missing" ? "Eksik Ürün Ekle" : "Fazla Ürün Ekle"
    : type === "missing" 
    ? "Eksik Ürün" 
    : "Fazla Ürün";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setSubmitError(null);

    let trimmedName = name.trim();
    let trimmedBarcode = barcode.trim();
    let productImageUrl: string | undefined = undefined;
    let submitType = type;
    
    if (showFormFromCatalog && catalogProduct) {
      // Katalog ürününden form görünümünden submit: catalogProduct bilgilerini kullan
      trimmedName = catalogProduct.name;
      trimmedBarcode = catalogProduct.barcode;
      productImageUrl = catalogProduct.imageUrl;
      submitType = formTypeFromCatalog;
    } else if (!isEditMode && selectedProduct) {
      trimmedName = selectedProduct.name;
      trimmedBarcode = selectedProduct.barcode;
      productImageUrl = selectedProduct.imageUrl;
    } else if (isEditMode && initialItem) {
      // Düzenleme modunda mevcut imageUrl'i koru
      productImageUrl = initialItem.imageUrl;
    }
    if (!trimmedName) {
      setValidationError(isEditMode ? "Ürün ismi gerekli." : showFormFromCatalog ? "Ürün bilgisi bulunamadı." : "Lütfen katalogdan bir ürün seçin.");
      return;
    }
    if (!trimmedBarcode) {
      setValidationError(isEditMode ? "Barkod gerekli." : showFormFromCatalog ? "Ürün bilgisi bulunamadı." : "Lütfen katalogdan bir ürün seçin.");
      return;
    }
    const qty = Number(quantity);
    if (Number.isNaN(qty) || qty < 0) {
      setValidationError("Miktar geçerli bir sayı olmalı (0 veya daha fazla).");
      return;
    }

    // Tekrar ekleme kısıtlaması: Aynı barkod ve tip ile zaten kayıt var mı?
    if (!isEditMode) {
      const existingItem = stockItems.find(
        (item) => item.barcode === trimmedBarcode && item.type === submitType
      );
      if (existingItem) {
        const typeLabel = submitType === "missing" ? "eksik" : "fazla";
        setValidationError(
          `Bu ürün zaten ${typeLabel} olarak eklenmiş. Lütfen mevcut kaydı düzenleyin.`
        );
        return;
      }
    }

    try {
      setIsSubmitting(true);
      if (isEditMode && initialItem) {
        await updateStockItem(initialItem.id, {
          name: trimmedName,
          barcode: trimmedBarcode,
          quantity: qty,
          notes: notes.trim() || "",
          imageUrl: productImageUrl,
        });
      } else {
        await addStockItem({
          name: trimmedName,
          barcode: trimmedBarcode,
          quantity: qty,
          notes: notes.trim() || "",
          type: submitType,
          imageUrl: productImageUrl,
        });
      }
      setSelectedProduct(null);
      setCatalogSearch("");
      setName(initialForm.name);
      setBarcode(initialForm.barcode);
      setQuantity(initialForm.quantity);
      setNotes(initialForm.notes);
      setValidationError(null);
      setSubmitError(null);
      setShowFormFromCatalog(false);
      // Başarılı işlem mesajı göster
      if (onSuccess) {
        onSuccess(isEditMode ? "Ürün başarıyla güncellendi." : "Ürün başarıyla eklendi.");
      }
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : (isEditMode ? "Güncellenirken bir hata oluştu." : "Kayıt eklenirken bir hata oluştu.")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Overlay — mobilde belirgin karartma + blur; masaüstünde daha hafif */}
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/78 backdrop-blur-md transition-opacity duration-300 sm:bg-black/48 sm:backdrop-blur-[2px]"
        style={{ opacity: isOpen ? 1 : 0 }}
        aria-label="Modalı kapat"
      />

      {/* İçerik kutusu — tıklama overlay'e gitmesin */}
      <div
        ref={modalRef}
        className={`relative h-auto w-full max-h-[85dvh] overflow-y-auto overflow-x-hidden rounded-2xl bg-white shadow-xl ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-white/10 sm:max-h-[min(90dvh,920px)] transition-all duration-300 ${
          isCatalogViewMode && catalogProduct
            ? "sm:max-w-lg sm:p-4 p-3"
            : "sm:max-w-md sm:p-6 p-4"
        }`}
        style={{
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? "scale(1)" : "scale(0.95)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex items-center justify-between gap-3 ${
            isCatalogViewMode && catalogProduct ? "pb-0" : ""
          }`}
        >
          <div className="flex min-h-10 min-w-0 flex-1 items-center gap-2">
            {showFormFromCatalog && catalogProduct && (
              <button
                type="button"
                onClick={() => setShowFormFromCatalog(false)}
                className="shrink-0 rounded-xl border border-zinc-200/90 bg-zinc-50/90 p-2 text-zinc-500 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-800 active:scale-[0.98] dark:border-zinc-600 dark:bg-zinc-800/90 dark:hover:border-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/55"
                aria-label="Geri"
                title="Geri"
              >
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
          <h2
            id="modal-title"
            className={
              isCatalogViewMode && catalogProduct
                ? "sr-only"
                : "text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            }
          >
            {isCatalogViewMode && catalogProduct ? "Ürün detayı" : title}
          </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Kapat"
            className="shrink-0 rounded-xl border border-zinc-200/90 bg-zinc-50/90 p-2 text-zinc-500 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-800 active:scale-[0.98] dark:border-zinc-600 dark:bg-zinc-800/90 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/55"
            aria-label="Kapat"
          >
            <X className="size-5" strokeWidth={2.25} />
          </button>
        </div>
        
        {/* CatalogProduct görünümü: Ürün detayları ve eksik/fazla bilgileri */}
        {isCatalogViewMode && catalogProduct ? (
          <div className="mt-2 flex flex-col gap-2.5">
            {/* Ürün özeti */}
            <div className="overflow-hidden rounded-xl border border-zinc-200/90 bg-gradient-to-b from-zinc-50 via-white to-zinc-50/80 shadow-sm ring-1 ring-zinc-900/[0.04] dark:border-zinc-700/90 dark:from-zinc-900 dark:via-zinc-950 dark:to-zinc-900/95 dark:ring-white/[0.06]">
              <div className="flex flex-col items-center gap-2 px-4 pb-3 pt-4">
                {catalogProduct.imageUrl && (
                  <button
                    type="button"
                    onClick={() => setCatalogImageLightboxOpen(true)}
                    title="Tam boyutta göster"
                    aria-label="Ürün görselini tam boyutta aç"
                    className="group relative cursor-zoom-in rounded-xl border border-transparent outline-none transition hover:border-amber-400/40 focus-visible:ring-2 focus-visible:ring-amber-500/60"
                  >
                    <div className="pointer-events-none absolute -inset-0.5 rounded-xl bg-gradient-to-br from-amber-400/25 via-transparent to-emerald-400/15 blur-sm dark:from-amber-500/20 dark:to-emerald-500/10" />
                    <img
                      src={catalogProduct.imageUrl}
                      alt=""
                      className="relative h-24 w-auto max-w-[176px] rounded-lg object-contain drop-shadow-sm transition group-hover:brightness-[1.03]"
                    />
                    <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 shadow transition group-hover:opacity-100">
                      Büyüt
                    </span>
                  </button>
                )}
                <div className="w-full space-y-1.5 text-center">
                  <h3 className="px-1 text-[14px] font-semibold leading-snug tracking-tight text-zinc-900 dark:text-zinc-50">
                    {catalogProduct.name}
                  </h3>
                  {!bakeryCatalogCard &&
                    typeof catalogProduct.price === "number" &&
                    !Number.isNaN(catalogProduct.price) && (
                      <CatalogProductPriceHighlight
                        price={catalogProduct.price}
                        align="center"
                        variant="soft"
                      />
                    )}
                </div>
              </div>
            </div>

            {/* Barkod — koyu temaya uyumlu, kompakt */}
            <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/90 px-3 py-2.5 dark:border-zinc-700/70 dark:bg-zinc-900/45">
              <p className="mb-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Barkod
              </p>
              <div className="mx-auto flex max-w-[min(100%,260px)] justify-center rounded-lg bg-white px-2 py-1.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-zinc-900/8 dark:bg-zinc-100 dark:ring-white/12">
                <BarcodeImage
                  barcode={catalogProduct.barcode}
                  width={1.5}
                  height={44}
                  className="[&_canvas]:max-h-[60px]"
                />
              </div>
              <p className="mt-1.5 text-center font-mono text-[11px] tracking-wide text-zinc-600 dark:text-zinc-400">
                {catalogProduct.barcode}
              </p>
            </div>

            {/* Getir + tedarikçi */}
            <div className="flex flex-col gap-2">
              {getirStockLoading && (
                <div
                  className="flex items-center justify-center gap-2 rounded-lg border border-zinc-200/90 bg-zinc-50/90 py-2 text-sm text-zinc-600 dark:border-zinc-600/80 dark:bg-zinc-800/60 dark:text-zinc-300"
                  role="status"
                  aria-live="polite"
                >
                  <RefreshCw className="size-4 shrink-0 animate-spin text-amber-600 dark:text-amber-400" />
                  <span>Getir stoku yükleniyor…</span>
                </div>
              )}

              {(getirStock !== null && !getirStockError && !getirStockLoading) ||
              (displaySupplierReturnDays !== null && !supplierReturnDateError) ? (
                <div
                  className={`grid gap-2 rounded-xl border border-amber-900/10 bg-gradient-to-br from-amber-500/[0.07] via-zinc-900/0 to-emerald-600/[0.06] p-2.5 dark:border-amber-500/15 dark:from-amber-400/[0.08] dark:via-zinc-950/40 dark:to-emerald-500/[0.06] ${
                    getirStock !== null &&
                    !getirStockError &&
                    !getirStockLoading &&
                    displaySupplierReturnDays !== null &&
                    !supplierReturnDateError
                      ? "grid-cols-2"
                      : "grid-cols-1"
                  }`}
                >
                  {getirStock !== null && !getirStockError && !getirStockLoading && (
                    <div className="flex min-h-0 flex-col justify-center rounded-lg bg-white/60 px-2.5 py-2 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-900/55 dark:ring-white/8">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Raf stok
                      </span>
                      <span className="mt-0.5 text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                        {getirStock}
                      </span>
                    </div>
                  )}
                  {displaySupplierReturnDays !== null && !supplierReturnDateError && (
                    <div className="flex min-h-0 flex-col justify-center rounded-lg bg-white/60 px-2.5 py-2 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-900/55 dark:ring-white/8">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Tedarikçi iade
                      </span>
                      <p className="mt-0.5 text-sm leading-tight text-zinc-800 dark:text-zinc-100">
                        <span className="text-xl font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                          {displaySupplierReturnDays}
                        </span>
                        <span className="ml-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                          gün önce
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              ) : null}

              {getirStockFetchComplete &&
                getirStock === null &&
                !getirStockError &&
                !getirStockLoading && (
                  <div className="rounded-lg border border-dashed border-zinc-300/90 bg-zinc-50/80 px-3 py-2 text-center text-xs text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800/40 dark:text-zinc-400">
                    Getir stoku şu an gösterilemiyor.
                  </div>
                )}

              {getirStockError && (
                <div className="rounded-lg border border-red-200/90 bg-red-50/95 px-3 py-2 dark:border-red-900/50 dark:bg-red-950/35">
                  <p className="text-xs font-medium text-red-800 dark:text-red-200">
                    {getirStockError}
                  </p>
                  {getirStockError.includes("Token") && (
                    <p className="mt-1 text-[11px] text-red-600 dark:text-red-300/90">
                      Chrome eklentisi ile franchise.getir.com üzerinden token ekleyin.
                    </p>
                  )}
                </div>
              )}

              {!bakeryCatalogCard && (
                <>
                  {displaySupplierReturnDays === null && (
                    <button
                      type="button"
                      onClick={handleGetSupplierReturnDate}
                      disabled={supplierReturnDateLoading}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-300/90 bg-zinc-50/90 px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800/70 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      {supplierReturnDateLoading ? (
                        <>
                          <RefreshCw className="size-4 animate-spin" />
                          <span>Yükleniyor...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="size-4 opacity-80" />
                          <span>Kaç gün önceden çıkılacak</span>
                        </>
                      )}
                    </button>
                  )}

                  {supplierReturnDateError && (
                    <div className="rounded-lg border border-red-200/90 bg-red-50/95 px-3 py-2 dark:border-red-900/50 dark:bg-red-950/35">
                      <p className="text-xs font-medium text-red-800 dark:text-red-200">
                        {supplierReturnDateError}
                      </p>
                      {supplierReturnDateError.includes("Token") && (
                        <p className="mt-1 text-[11px] text-red-600 dark:text-red-300/90">
                          warehouse.getir.com için eklenti token&apos;ı gerekli.
                        </p>
                      )}
                    </div>
                  )}

                  {(catalogProduct || initialItem) && (
                    <button
                      type="button"
                      onClick={() => setExpiringProductModalOpen(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-md shadow-amber-900/15 transition hover:brightness-[1.03] active:scale-[0.99] dark:from-amber-600 dark:to-orange-700 dark:shadow-black/30"
                    >
                      <Calendar className="size-4 opacity-95" />
                      <span>
                        {existingExpiringProduct
                          ? "Yaklaşan SKT'yi düzenle"
                          : "Yaklaşan SKT olarak işaretle"}
                      </span>
                    </button>
                  )}

                  {existingExpiringProduct && (
                    <div className="rounded-lg border border-orange-200/80 bg-orange-50/90 px-3 py-2 dark:border-orange-900/40 dark:bg-orange-950/40">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-800/90 dark:text-orange-300/95">
                        Kayıtlı yaklaşan SKT
                      </p>
                      <p className="mt-1 text-xs text-orange-900 dark:text-orange-100">
                        <span className="font-medium text-orange-800 dark:text-orange-200">SKT:</span>{" "}
                        {existingExpiringProduct.expiryDate}
                      </p>
                      <p className="mt-0.5 text-xs text-orange-900 dark:text-orange-100">
                        <span className="font-medium text-orange-800 dark:text-orange-200">
                          Tedarikçi iade tarihi:
                        </span>{" "}
                        {existingExpiringProduct.removalDate}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Eksik/Fazla bilgileri */}
            {(productStatus.hasMissing || productStatus.hasExtra) && (
              <div
                className={`grid gap-2 ${productStatus.isOnlyMissing || productStatus.isOnlyExtra ? "grid-cols-1" : "grid-cols-2"}`}
              >
                {productStatus.hasMissing && (
                  <div className="rounded-xl border border-zinc-200/90 bg-zinc-50/95 p-2.5 shadow-sm ring-1 ring-zinc-900/[0.03] dark:border-zinc-600/80 dark:bg-zinc-800/40 dark:ring-white/[0.04]">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Toplam eksik
                    </p>
                    <p
                      className="mt-1 text-xl font-semibold tabular-nums"
                      style={{ color: "var(--color-missing)" }}
                    >
                      {catalogProductItems.missing.reduce((sum, item) => sum + item.quantity, 0)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                      {catalogProductItems.missing.length} kayıt
                    </p>
                  </div>
                )}
                {productStatus.hasExtra && (
                  <div className="rounded-xl border border-zinc-200/90 bg-zinc-50/95 p-2.5 shadow-sm ring-1 ring-zinc-900/[0.03] dark:border-zinc-600/80 dark:bg-zinc-800/40 dark:ring-white/[0.04]">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Toplam fazla
                    </p>
                    <p
                      className="mt-1 text-xl font-semibold tabular-nums"
                      style={{ color: "var(--color-extra)" }}
                    >
                      {catalogProductItems.extra.reduce((sum, item) => sum + item.quantity, 0)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                      {catalogProductItems.extra.length} kayıt
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Kayıt listesi */}
            {(catalogProductItems.missing.length > 0 || catalogProductItems.extra.length > 0) && (
              <div className="space-y-2.5">
                {productStatus.hasMissing && (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Eksik ürün kayıtları
                    </h4>
                    <div className="space-y-1.5">
                      {catalogProductItems.missing.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-800"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                Miktar: {item.quantity}
                              </p>
                              {item.notes && (
                                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                  {item.notes}
                                </p>
                              )}
                              {(item.createdAt || item.updatedAt) && (
                                <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                                  {item.updatedAt ? (
                                    <>Son Güncelleme: {formatDateTime(item.updatedAt)}</>
                                  ) : (
                                    <>Eklenme: {formatDateTime(item.createdAt)}</>
                                  )}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  if (onEditItem) {
                                    // Önce callback'i çağır (editingItem set edilir ve selectedCatalogProduct null yapılır)
                                    onEditItem(item);
                                    // Modal otomatik olarak düzenleme moduna geçecek
                                  }
                                }}
                                className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                                aria-label="Kaydı düzenle"
                              >
                                <Pencil className="size-4" />
                              </button>
                              {onDeleteItem && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteConfirmItem(item);
                                  }}
                                  className="rounded-lg p-1.5 text-red-600 transition hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/30 dark:hover:text-red-200"
                                  aria-label="Eksik kaydı sil"
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {productStatus.hasExtra && (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Fazla ürün kayıtları
                    </h4>
                    <div className="space-y-1.5">
                      {catalogProductItems.extra.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-800"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                Miktar: {item.quantity}
                              </p>
                              {item.notes && (
                                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                  {item.notes}
                                </p>
                              )}
                              {(item.createdAt || item.updatedAt) && (
                                <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                                  {item.updatedAt ? (
                                    <>Son Güncelleme: {formatDateTime(item.updatedAt)}</>
                                  ) : (
                                    <>Eklenme: {formatDateTime(item.createdAt)}</>
                                  )}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  if (onEditItem) {
                                    // Fazla kayıt için de düzenleme moduna geç
                                    onEditItem(item);
                                  }
                                }}
                                className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                                aria-label="Kaydı düzenle"
                              >
                                <Pencil className="size-4" />
                              </button>
                              {onDeleteItem && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteConfirmItem(item);
                                  }}
                                  className="rounded-lg p-1.5 text-red-600 transition hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/30 dark:hover:text-red-200"
                                  aria-label="Fazla kaydı sil"
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Ekleme butonları - Sadece ürün hiç eklenmemişse göster */}
            {!bakeryCatalogCard &&
              !productStatus.hasMissing &&
              !productStatus.hasExtra && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (catalogProduct) {
                        setFormTypeFromCatalog("missing");
                        setShowFormFromCatalog(true);
                      }
                    }}
                    className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white transition-all duration-200 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]"
                    style={{ backgroundColor: "var(--color-missing)" }}
                  >
                    <PackageMinus className="size-5" />
                    Eksik Ekle
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (catalogProduct) {
                        setFormTypeFromCatalog("extra");
                        setShowFormFromCatalog(true);
                      }
                    }}
                    className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white transition-all duration-200 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]"
                    style={{ backgroundColor: "var(--color-extra)" }}
                  >
                    <PackagePlus className="size-5" />
                    Fazla Ekle
                  </button>
                </div>
              )}
            {/* Eğer ürün hem eksik hem fazla eklenmişse uyarı göster */}
            {productStatus.hasMissing && productStatus.hasExtra && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  ⚠️ Bu ürün hem eksik hem fazla olarak eklenmiş. Lütfen mevcut kayıtları düzenleyin.
                </p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Normal form görünümü */}
            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4" aria-label={isEditMode ? "Ürün düzenleme formu" : "Ürün ekleme formu"}>
          {validationError && (
            <ErrorMessage
              message={validationError}
              onDismiss={() => setValidationError(null)}
              ariaLive="assertive"
            />
          )}
          {submitError && (
            <ErrorMessage
              message={submitError}
              onDismiss={() => setSubmitError(null)}
              ariaLive="assertive"
            />
          )}

          {isEditMode ? (
            <>
              <div>
                <label htmlFor="add-product-name" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Ürün İsmi
                </label>
                <input
                  ref={firstInputRef as React.RefObject<HTMLInputElement>}
                  id="add-product-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                  aria-required="true"
                />
              </div>
              <div>
                <label htmlFor="add-product-barcode" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Barkod
                </label>
                <input
                  id="add-product-barcode"
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                  aria-required="true"
                />
              </div>
              {/* Getir Stok Bilgisi (Düzenleme modu) */}
              {isEditMode && initialItem && (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleGetGetirStock}
                    disabled={getirStockLoading}
                    className="flex items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  >
                    {getirStockLoading ? (
                      <>
                        <RefreshCw className="size-4 animate-spin" />
                        <span>Stok Getiriliyor...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="size-4" />
                        <span>Getir Stokunu Getir</span>
                      </>
                    )}
                  </button>

                  {/* Stok Bilgisi Gösterimi */}
                  {getirStock !== null && !getirStockError && !getirStockLoading && (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
                      <p className="text-sm font-medium text-green-800 dark:text-green-300">
                        Stok: <span className="text-lg font-semibold">{getirStock}</span>
                      </p>
                    </div>
                  )}

                  {/* Hata Mesajı */}
                  {getirStockError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                      <p className="text-sm font-medium text-red-800 dark:text-red-300">
                        {getirStockError}
                      </p>
                      {getirStockError.includes("Token") && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          Lütfen Chrome eklentisini kullanarak franchise.getir.com'da yeni token ekleyin.
                        </p>
                      )}
                    </div>
                  )}

                  {getirStockFetchComplete &&
                    getirStock === null &&
                    !getirStockError &&
                    !getirStockLoading && (
                      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-400">
                        Getir stoku şu an gösterilemiyor (eşleşme veya API yanıtı).
                      </div>
                    )}

                  {/* Kaç Gün Önceden Çıkılacak — katalogda yoksa Getir’den çek */}
                  {displaySupplierReturnDays === null && (
                    <button
                      type="button"
                      onClick={handleGetSupplierReturnDate}
                      disabled={supplierReturnDateLoading}
                      className="flex items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      {supplierReturnDateLoading ? (
                        <>
                          <RefreshCw className="size-4 animate-spin" />
                          <span>Yükleniyor...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="size-4" />
                          <span>Kaç Gün Önceden Çıkılacak</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* Tedarikçi İade Tarihi Gösterimi */}
                  {displaySupplierReturnDays !== null && !supplierReturnDateError && (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
                      <p className="text-sm font-medium text-green-800 dark:text-green-300">
                        Tedarikçi İade:{" "}
                        <span className="text-lg font-semibold">
                          {displaySupplierReturnDays}
                        </span>{" "}
                        gün önceden çıkılacak
                      </p>
                    </div>
                  )}

                  {/* Tedarikçi İade Tarihi Hata Mesajı */}
                  {supplierReturnDateError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                      <p className="text-sm font-medium text-red-800 dark:text-red-300">
                        {supplierReturnDateError}
                      </p>
                      {supplierReturnDateError.includes("Token") && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          Lütfen Chrome eklentisini kullanarak warehouse.getir.com'da yeni token ekleyin.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Yaklaşan SKT Olarak İşaretle */}
                  {initialItem && (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setExpiringProductModalOpen(true)}
                        className="flex items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      >
                        <Calendar className="size-4" />
                        <span>
                          {existingExpiringProduct
                            ? "Yaklaşan SKT'yi Düzenle"
                            : "Yaklaşan SKT Olarak İşaretle"}
                        </span>
                      </button>

                      {existingExpiringProduct && (
                        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-900/20">
                          <p className="text-sm font-medium text-orange-800 dark:text-orange-300">
                            <span className="font-semibold">SKT:</span> {existingExpiringProduct.expiryDate}
                          </p>
                          <p className="mt-1 text-sm font-medium text-orange-800 dark:text-orange-300">
                            <span className="font-semibold">Çıkılması Gereken Tarih:</span>{" "}
                            {existingExpiringProduct.removalDate}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {/* Tip bilgisi (sadece gösterim, değiştirilemez) */}
              {initialItem && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Tip
                  </label>
                  <div className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-base text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {initialItem.type === "missing" ? "Eksik" : "Fazla"}
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Ürün tipi değiştirilemez. Sadece miktar ve notlar düzenlenebilir.
                  </p>
                </div>
              )}
            </>
          ) : showFormFromCatalog && catalogProduct ? (
            <>
              {/* Katalog ürününden form görünümü: Ürün bilgileri sadece gösterilir, düzenlenemez */}
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Ürün İsmi
                </label>
                <div className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-base text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {catalogProduct.name}
                </div>
              </div>
              {!bakeryCatalogCard &&
                typeof catalogProduct.price === "number" &&
                !Number.isNaN(catalogProduct.price) && (
                  <CatalogProductPriceHighlight
                    price={catalogProduct.price}
                    align="start"
                  />
                )}
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Barkod
                </label>
                <div className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-base text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {catalogProduct.barcode}
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Ürün seçin (katalog)
              </label>
              {catalogLoading ? (
                <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-4 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                  Katalog yükleniyor...
                </p>
              ) : catalog.length === 0 ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                  Ürün kataloğu boş. <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/40">data/products.json</code> dosyasını doldurun.
                </p>
              ) : (
                <>
                  <div className="relative mb-2">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" aria-hidden />
                    <input
                      ref={!isEditMode ? (firstInputRef as React.RefObject<HTMLInputElement>) : undefined}
                      type="text"
                      value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)}
                      placeholder="Ürün adı veya barkod ile ara..."
                      className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-9 pr-3 text-base text-zinc-900 focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                      aria-label="Ürün ara"
                    />
                  </div>
                  <div className="max-h-44 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                    {filteredCatalog.length === 0 ? (
                      <div className="px-3 py-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
                        <p>Eşleşen ürün yok.</p>
                      </div>
                    ) : (
                      <ul role="list" className="divide-y divide-zinc-100 dark:divide-zinc-700">
                        {filteredCatalog.map((p) => (
                          <li key={p.barcode + (p.productId ?? "")}>
                            <button
                              type="button"
                              onClick={() => setSelectedProduct(p)}
                              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                                selectedProduct?.barcode === p.barcode && selectedProduct?.name === p.name
                                  ? "bg-[var(--color-primary)]/10 dark:bg-[var(--color-primary)]/20"
                                  : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                              }`}
                              aria-label={`${p.name} ürününü seç (Barkod: ${p.barcode})`}
                              aria-pressed={selectedProduct?.barcode === p.barcode && selectedProduct?.name === p.name}
                            >
                              {p.imageUrl && (
                                <img
                                  src={p.imageUrl}
                                  alt=""
                                  className="size-10 shrink-0 rounded object-cover"
                                  width={40}
                                  height={40}
                                />
                              )}
                              <div className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                  {p.name}
                                </span>
                                <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{p.barcode}</span>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {selectedProduct && (
                    <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                      Seçilen: <strong className="text-zinc-700 dark:text-zinc-300">{selectedProduct.name}</strong>
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <div>
            <label htmlFor="add-product-quantity" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Miktar
            </label>
            <input
              ref={showFormFromCatalog ? (firstInputRef as React.RefObject<HTMLInputElement>) : undefined}
              id="add-product-quantity"
              type="number"
              min={0}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              aria-required="true"
            />
          </div>
          <div>
            <label htmlFor="add-product-notes" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Notlar (opsiyonel)
            </label>
            <textarea
              id="add-product-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              aria-label="Notlar (opsiyonel)"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting || (!isEditMode && !showFormFromCatalog && catalog.length > 0 && !selectedProduct)}
            className="mt-2 w-full rounded-xl bg-[var(--color-primary)] px-4 py-3 font-medium text-white transition-all duration-200 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 dark:bg-[var(--color-primary)]"
          >
            {isSubmitting ? (isEditMode ? "Güncelleniyor..." : "Kaydediliyor...") : isEditMode ? "Güncelle" : "Ekle"}
          </button>
        </form>
          </>
        )}
      </div>

      {/* Yaklaşan SKT Modal */}
      {(catalogProduct || initialItem) && (
        <ExpiringProductModal
          isOpen={expiringProductModalOpen}
          onClose={() => setExpiringProductModalOpen(false)}
          supplierReturnDays={resolvedCatalogSupplierReturnDays}
          product={{
            barcode: catalogProduct?.barcode || initialItem?.barcode || "",
            name: catalogProduct?.name || initialItem?.name || "",
          }}
          existingProduct={existingExpiringProduct}
          onSuccess={(message) => {
            onSuccess?.(message);
            // Mevcut kaydı yeniden yükle
            const barcodeToCheck = catalogProduct?.barcode || initialItem?.barcode;
            if (barcodeToCheck) {
              fetch(`/api/expiring-products?barcode=${encodeURIComponent(barcodeToCheck)}`)
                .then((res) => res.json())
                .then((data) => {
                  if (data.success && data.product) {
                    setExistingExpiringProduct(data.product);
                  } else {
                    setExistingExpiringProduct(null);
                  }
                })
                .catch(() => setExistingExpiringProduct(null));
            }
          }}
        />
      )}

      {/* Silme onay modalı (eksik/fazla kayıt) */}
      <ConfirmModal
        isOpen={!!deleteConfirmItem}
        onClose={() => setDeleteConfirmItem(null)}
        title="Kaydı sil"
        message={
          deleteConfirmItem?.type === "extra"
            ? "Bu fazla kaydı silmek istediğinize emin misiniz?"
            : "Bu eksik kaydı silmek istediğinize emin misiniz?"
        }
        confirmLabel="Sil"
        cancelLabel="İptal"
        variant="danger"
        onConfirm={() => {
          if (deleteConfirmItem && onDeleteItem) {
            onDeleteItem(deleteConfirmItem);
          }
        }}
      />

      {catalogImageLightboxOpen && catalogProduct?.imageUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={catalogProduct.name}
          className="fixed inset-0 z-[70] flex flex-col bg-black/92 p-3 sm:p-5"
          onClick={() => setCatalogImageLightboxOpen(false)}
        >
          <div className="flex shrink-0 justify-end pb-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCatalogImageLightboxOpen(false);
              }}
              className="flex size-10 items-center justify-center rounded-full bg-zinc-800 text-zinc-100 ring-1 ring-zinc-600/80 transition hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70"
              aria-label="Kapat"
            >
              <X className="size-5" aria-hidden strokeWidth={2.25} />
            </button>
          </div>
          <div
            className="flex min-h-0 flex-1 items-center justify-center px-1"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- harici CDN ürün görseli */}
            <img
              src={catalogProduct.imageUrl}
              alt={catalogProduct.name}
              className="max-h-[min(90dvh,calc(100vh-5rem))] max-w-full object-contain shadow-2xl"
            />
          </div>
          <p className="shrink-0 pt-2 text-center text-xs text-zinc-400">
            Kapatmak için dışarı tıklayın veya Esc
          </p>
        </div>
      )}
    </div>
  );
}

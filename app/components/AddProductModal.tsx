"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Pencil, PackageMinus, PackagePlus } from "lucide-react";
import { addStockItem, updateStockItem } from "@/app/lib/stockService";
import { ErrorMessage } from "./ErrorMessage";
import { BarcodeImage } from "./BarcodeImage";
import type { StockItemWithId } from "@/app/lib/types";

export type AddProductModalType = "missing" | "extra";

/** Katalog ürünü (api/products) */
export interface CatalogProduct {
  name: string;
  barcode: string;
  imageUrl?: string;
  productId?: string;
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
  /** Başarılı işlem sonrası çağrılır (toast göstermek için) */
  onSuccess?: (message: string) => void;
}

const initialForm = { name: "", barcode: "", quantity: "", notes: "" };

export function AddProductModal({ isOpen, onClose, type, initialItem, catalogProduct, stockItems = [], onAddFromCatalog, onEditItem, onSuccess }: AddProductModalProps) {
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

  const isEditMode = Boolean(initialItem?.id);
  const isCatalogViewMode = Boolean(catalogProduct && !isEditMode && !showFormFromCatalog);

  // CatalogProduct için eksik/fazla kayıtlarını hesapla
  const catalogProductItems = useMemo(() => {
    if (!catalogProduct) return { missing: [], extra: [] };
    const productItems = stockItems.filter((item) => item.barcode === catalogProduct.barcode);
    return {
      missing: productItems.filter((item) => item.type === "missing"),
      extra: productItems.filter((item) => item.type === "extra"),
    };
  }, [catalogProduct, stockItems]);
  const modalRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
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

    // Escape tuşu ile kapatma
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

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
    }
  }, [isOpen, initialItem, catalogProduct, type, showFormFromCatalog]);

  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q)
    );
  }, [catalog, catalogSearch]);

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
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Overlay — tıklanınca kapat */}
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 transition-opacity duration-300"
        style={{ opacity: isOpen ? 1 : 0 }}
        aria-label="Modalı kapat"
      />

      {/* İçerik kutusu — tıklama overlay'e gitmesin */}
      <div
        ref={modalRef}
        className="relative w-full h-full max-h-screen overflow-y-auto bg-white shadow-lg dark:bg-zinc-900 sm:h-auto sm:max-w-md sm:rounded-xl sm:p-6 p-4 transition-all duration-300"
        style={{
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? "scale(1)" : "scale(0.95)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            {showFormFromCatalog && catalogProduct && (
              <button
                type="button"
                onClick={() => setShowFormFromCatalog(false)}
                className="rounded-lg p-1 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                aria-label="Geri"
                title="Geri"
              >
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h2 id="modal-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
            aria-label="Kapat"
          >
            <X className="size-5" />
          </button>
        </div>
        
        {/* CatalogProduct görünümü: Ürün detayları ve eksik/fazla bilgileri */}
        {isCatalogViewMode && catalogProduct ? (
          <div className="mt-4 flex flex-col gap-6">
            {/* Ürün bilgileri */}
            <div className="flex flex-col gap-4">
              {catalogProduct.imageUrl && (
                <div className="flex justify-center">
                  <img
                    src={catalogProduct.imageUrl}
                    alt={catalogProduct.name}
                    className="h-32 w-auto rounded-lg object-contain"
                  />
                </div>
              )}
              <div className="text-center">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  {catalogProduct.name}
                </h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Barkod: {catalogProduct.barcode}
                </p>
              </div>
              
              {/* Barkod görseli */}
              <div className="flex justify-center bg-white p-4 rounded-lg border border-zinc-200 dark:border-zinc-700">
                <BarcodeImage barcode={catalogProduct.barcode} width={2} height={80} />
              </div>
            </div>

            {/* Eksik/Fazla bilgileri */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  Toplam Eksik
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: "var(--color-missing)" }}>
                  {catalogProductItems.missing.reduce((sum, item) => sum + item.quantity, 0)}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {catalogProductItems.missing.length} kayıt
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  Toplam Fazla
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: "var(--color-extra)" }}>
                  {catalogProductItems.extra.reduce((sum, item) => sum + item.quantity, 0)}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {catalogProductItems.extra.length} kayıt
                </p>
              </div>
            </div>

            {/* Kayıt listesi */}
            {(catalogProductItems.missing.length > 0 || catalogProductItems.extra.length > 0) && (
              <div className="space-y-4">
                {catalogProductItems.missing.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      Eksik Ürün Kayıtları
                    </h4>
                    <div className="space-y-2">
                      {catalogProductItems.missing.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-800"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                Miktar: {item.quantity}
                              </p>
                              {item.notes && (
                                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                  {item.notes}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  if (onEditItem) {
                                    onEditItem(item);
                                  }
                                  onClose();
                                }}
                                className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                                aria-label="Kaydı düzenle"
                              >
                                <Pencil className="size-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {catalogProductItems.extra.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      Fazla Ürün Kayıtları
                    </h4>
                    <div className="space-y-2">
                      {catalogProductItems.extra.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-800"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                Miktar: {item.quantity}
                              </p>
                              {item.notes && (
                                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                  {item.notes}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  if (onEditItem) {
                                    onEditItem(item);
                                  }
                                  onClose();
                                }}
                                className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                                aria-label="Kaydı düzenle"
                              >
                                <Pencil className="size-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Ekleme butonları */}
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
                  ref={firstInputRef}
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
                      ref={!isEditMode ? firstInputRef : undefined}
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
                      <p className="px-3 py-4 text-center text-sm text-zinc-500 dark:text-zinc-400">Eşleşen ürün yok.</p>
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
              ref={showFormFromCatalog ? firstInputRef : undefined}
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
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { X, Calendar } from "lucide-react";
import type { ExpiringProductWithId } from "@/app/lib/types";

interface ExpiringProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: { barcode: string; name: string };
  existingProduct?: ExpiringProductWithId | null;
  onSuccess?: (message: string) => void;
}

export function ExpiringProductModal({
  isOpen,
  onClose,
  product,
  existingProduct,
  onSuccess,
}: ExpiringProductModalProps) {
  const [expiryDate, setExpiryDate] = useState("");
  const [removalDate, setRemovalDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = Boolean(existingProduct);

  // Modal açıldığında veya existingProduct değiştiğinde formu doldur
  useEffect(() => {
    if (isOpen) {
      if (existingProduct) {
        setExpiryDate(existingProduct.expiryDate);
        setRemovalDate(existingProduct.removalDate);
      } else {
        setExpiryDate("");
        setRemovalDate("");
      }
      setError(null);
      setIsSubmitting(false);
    } else {
      // Modal kapandığında temizle
      setExpiryDate("");
      setRemovalDate("");
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, existingProduct]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validasyon
    if (!expiryDate.trim()) {
      setError("SKT tarihi gerekli");
      return;
    }

    if (!removalDate.trim()) {
      setError("Çıkılması gereken tarih gerekli");
      return;
    }

    // Tarih formatı kontrolü (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(expiryDate.trim())) {
      setError("SKT tarihi formatı geçersiz. YYYY-MM-DD formatında olmalıdır.");
      return;
    }

    if (!dateRegex.test(removalDate.trim())) {
      setError("Çıkılması gereken tarih formatı geçersiz. YYYY-MM-DD formatında olmalıdır.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEditMode && existingProduct) {
        if (!existingProduct.id || typeof existingProduct.id !== "string") {
          throw new Error("Kayıt ID bulunamadı. Lütfen sayfayı yenileyip tekrar deneyin.");
        }
        // Güncelleme
        const response = await fetch(`/api/expiring-products/${existingProduct.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expiryDate: expiryDate.trim(),
            removalDate: removalDate.trim(),
          }),
        });

        let data: any = null;
        try {
          data = await response.json();
        } catch {
          data = null;
        }

        if (!response.ok || !data?.success) {
          throw new Error(
            data?.error ||
              `Güncelleme başarısız (HTTP ${response.status})`
          );
        }

        onSuccess?.("Yaklaşan SKT kaydı başarıyla güncellendi.");
        onClose();
      } else {
        // Yeni kayıt
        const response = await fetch("/api/expiring-products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            barcode: product.barcode,
            productName: product.name,
            expiryDate: expiryDate.trim(),
            removalDate: removalDate.trim(),
          }),
        });

        let data: any = null;
        try {
          data = await response.json();
        } catch {
          data = null;
        }

        if (!response.ok || !data?.success) {
          throw new Error(
            data?.error ||
              `Kayıt başarısız (HTTP ${response.status})`
          );
        }

        onSuccess?.("Yaklaşan SKT kaydı başarıyla eklendi.");
        onClose();
      }
    } catch (err) {
      console.error("Yaklaşan SKT kaydı işlemi başarısız:", err);
      setError(err instanceof Error ? err.message : "Bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-md rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-700">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {isEditMode ? "Yaklaşan SKT'yi Düzenle" : "Yaklaşan SKT Olarak İşaretle"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
            aria-label="Kapat"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4">
          {/* Ürün Bilgileri (Read-only) */}
          <div className="mb-4 space-y-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Ürün Adı
              </label>
              <div className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-base text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {product.name}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Barkod
              </label>
              <div className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-base text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {product.barcode}
              </div>
            </div>
          </div>

          {/* SKT Tarihi */}
          <div className="mb-4">
            <label
              htmlFor="expiryDate"
              className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              SKT Tarihi <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="date"
                id="expiryDate"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                required
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50 dark:focus:border-blue-400"
              />
              <Calendar className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-zinc-400" />
            </div>
          </div>

          {/* Çıkılması Gereken Tarih */}
          <div className="mb-4">
            <label
              htmlFor="removalDate"
              className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Çıkılması Gereken Tarih <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="date"
                id="removalDate"
                value={removalDate}
                onChange={(e) => setRemovalDate(e.target.value)}
                required
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50 dark:focus:border-blue-400"
              />
              <Calendar className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-zinc-400" />
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Bu tarih geldiğinde bildirim gösterilecektir.
            </p>
          </div>

          {/* Hata Mesajı */}
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
              <p className="text-sm font-medium text-red-800 dark:text-red-300">{error}</p>
            </div>
          )}

          {/* Butonlar */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {isSubmitting ? "Kaydediliyor..." : isEditMode ? "Güncelle" : "Kaydet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


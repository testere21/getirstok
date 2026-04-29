"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Calendar } from "lucide-react";
import type { ExpiringProductWithId } from "@/app/lib/types";

interface ExpiringProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** API gövdesi için gerekli; formda gösterilmez */
  product: { barcode: string; name: string };
  /** products.json / katalog: SKT'den kaç gün önce çıkılacak */
  supplierReturnDays?: number | null;
  existingProduct?: ExpiringProductWithId | null;
  onSuccess?: (message: string) => void;
}

/** YYYY-MM-DD — yerel takvimde `days` gün çıkarır */
function subtractCalendarDays(isoYmd: string, days: number): string {
  const parts = isoYmd.trim().split("-").map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return "";
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Kayıttaki SKT ile çıkış tarihi arasındaki tam gün farkı */
function inferDaysFromStoredPair(
  expiryYmd: string,
  removalYmd: string
): number | null {
  const pe = expiryYmd.trim().split("-").map((x) => parseInt(x, 10));
  const pr = removalYmd.trim().split("-").map((x) => parseInt(x, 10));
  if (pe.length !== 3 || pr.length !== 3 || pe.some(Number.isNaN) || pr.some(Number.isNaN))
    return null;
  const e = new Date(pe[0], pe[1] - 1, pe[2]);
  const r = new Date(pr[0], pr[1] - 1, pr[2]);
  const diff = Math.round((e.getTime() - r.getTime()) / 86400000);
  return Number.isFinite(diff) && diff >= 0 ? diff : null;
}

export function ExpiringProductModal({
  isOpen,
  onClose,
  product,
  supplierReturnDays,
  existingProduct,
  onSuccess,
}: ExpiringProductModalProps) {
  const [expiryDate, setExpiryDate] = useState("");
  const [removalDate, setRemovalDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = Boolean(existingProduct);

  const inferredFromRecord = useMemo(() => {
    if (!existingProduct?.expiryDate || !existingProduct?.removalDate) return null;
    return inferDaysFromStoredPair(
      existingProduct.expiryDate,
      existingProduct.removalDate
    );
  }, [existingProduct?.expiryDate, existingProduct?.removalDate]);

  const ruleDays = useMemo(() => {
    if (
      typeof supplierReturnDays === "number" &&
      Number.isFinite(supplierReturnDays) &&
      supplierReturnDays >= 0
    ) {
      return Math.floor(supplierReturnDays);
    }
    return inferredFromRecord;
  }, [supplierReturnDays, inferredFromRecord]);

  // Modal açılınca SKT’yi doldur; çıkış tarihi kural günü ile hesaplanacak
  useEffect(() => {
    if (!isOpen) {
      setExpiryDate("");
      setRemovalDate("");
      setError(null);
      setIsSubmitting(false);
      return;
    }
    setError(null);
    setIsSubmitting(false);
    if (existingProduct) {
      setExpiryDate(existingProduct.expiryDate);
    } else {
      setExpiryDate("");
      setRemovalDate("");
    }
  }, [isOpen, existingProduct?.id]);

  // SKT veya kural günü değişince tedarikçi iade (çıkış) tarihini güncelle
  useEffect(() => {
    if (!isOpen) return;
    const trimmed = expiryDate.trim();
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!trimmed || !dateRegex.test(trimmed)) {
      if (!existingProduct) setRemovalDate("");
      return;
    }
    if (ruleDays !== null) {
      setRemovalDate(subtractCalendarDays(trimmed, ruleDays));
    } else if (existingProduct && trimmed === existingProduct.expiryDate) {
      setRemovalDate(existingProduct.removalDate);
    }
  }, [isOpen, expiryDate, ruleDays, existingProduct]);

  const handleExpiryChange = (value: string) => {
    setExpiryDate(value);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!expiryDate.trim()) {
      setError("SKT tarihi gerekli");
      return;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(expiryDate.trim())) {
      setError("SKT tarihi formatı geçersiz.");
      return;
    }

    if (!removalDate.trim()) {
      setError(
        ruleDays === null
          ? "Tedarikçi iade tarihi hesaplanamadı. Ürün için katalogda supplierReturnDays yok veya kayıttan çıkarılamadı."
          : "Tedarikçi iade tarihi hesaplanamadı."
      );
      return;
    }

    if (!dateRegex.test(removalDate.trim())) {
      setError("Tedarikçi iade tarihi formatı geçersiz.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEditMode && existingProduct) {
        if (!existingProduct.id || typeof existingProduct.id !== "string") {
          throw new Error("Kayıt ID bulunamadı. Lütfen sayfayı yenileyip tekrar deneyin.");
        }
        const response = await fetch(`/api/expiring-products/${existingProduct.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expiryDate: expiryDate.trim(),
            removalDate: removalDate.trim(),
          }),
        });

        let data: unknown = null;
        try {
          data = await response.json();
        } catch {
          data = null;
        }

        const ok = data && typeof data === "object" && "success" in data && (data as { success?: boolean }).success;
        if (!response.ok || !ok) {
          const msg =
            data && typeof data === "object" && "error" in data
              ? String((data as { error?: string }).error)
              : `Güncelleme başarısız (HTTP ${response.status})`;
          throw new Error(msg);
        }

        onSuccess?.("Yaklaşan SKT kaydı başarıyla güncellendi.");
        onClose();
      } else {
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

        let data: unknown = null;
        try {
          data = await response.json();
        } catch {
          data = null;
        }

        const ok = data && typeof data === "object" && "success" in data && (data as { success?: boolean }).success;
        if (!response.ok || !ok) {
          const msg =
            data && typeof data === "object" && "error" in data
              ? String((data as { error?: string }).error)
              : `Kayıt başarısız (HTTP ${response.status})`;
          throw new Error(msg);
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

  const daysHint =
    ruleDays !== null ? `${ruleDays} gün önce` : "kayıtlı gün bilgisi yok";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-md rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-800">
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

        <form onSubmit={handleSubmit} className="p-4">
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
                onChange={(e) => handleExpiryChange(e.target.value)}
                required
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50 dark:focus:border-blue-400"
              />
              <Calendar className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-zinc-400" />
            </div>
          </div>

          <div className="mb-4">
            <label
              htmlFor="supplierReturnRemovalDate"
              className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Tedarikçi İade Tarihi
            </label>
            <div className="relative">
              <input
                type="date"
                id="supplierReturnRemovalDate"
                value={removalDate}
                readOnly
                tabIndex={-1}
                aria-readonly="true"
                className="w-full cursor-not-allowed rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-base text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-200"
              />
              <Calendar className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-zinc-400" />
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              SKT tarihinden <span className="font-medium">{daysHint}</span> çıkılması gerekir (
              bildirim bu tarihte gösterilir).
            </p>
          </div>

          {ruleDays === null && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
              <p className="text-sm text-amber-900 dark:text-amber-200">
                Bu ürün için katalogda <span className="font-medium">supplierReturnDays</span> bulunamadı.
                Önce ürün verisini güncelleyin veya kaydı düzenlerken mevcut tarihler korunur.
              </p>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
              <p className="text-sm font-medium text-red-800 dark:text-red-300">{error}</p>
            </div>
          )}

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
              disabled={
                isSubmitting ||
                !expiryDate.trim() ||
                !removalDate.trim() ||
                (ruleDays === null && !isEditMode)
              }
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

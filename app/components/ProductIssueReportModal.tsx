"use client";

import { useState, useRef } from "react";
import { X, AlertTriangle } from "lucide-react";
import type { ProductIssueType } from "@/app/lib/types";

interface ProductIssueReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: ProductIssueType;
  barcode: string;
  productName?: string;
  source?: string;
  onSuccess?: (message: string) => void;
}

export function ProductIssueReportModal({
  isOpen,
  onClose,
  type,
  barcode,
  productName,
  source,
  onSuccess,
}: ProductIssueReportModalProps) {
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSubmitRef = useRef<number | null>(null);

  if (!isOpen) return null;

  const typeLabel = type === "product_missing" ? "Ürün Yok Bildir" : "Stok Yok Bildir";
  const typeBadge =
    type === "product_missing" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setError(null);

    const trimmedBarcode = barcode.trim();
    if (!trimmedBarcode) {
      setError("Barkod bulunamadı.");
      return;
    }

    if (note.length > 250) {
      setError("Not en fazla 250 karakter olabilir.");
      return;
    }

    const now = Date.now();
    if (lastSubmitRef.current && now - lastSubmitRef.current < 5000) {
      setError("Bu ürün için kısa süre önce bildirim gönderdiniz. Lütfen biraz sonra tekrar deneyin.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/telegram/product-issue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type,
          barcode: trimmedBarcode,
          productName: productName?.trim() || undefined,
          note: note.trim() || undefined,
          source: source || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Bildirim gönderilemedi.");
      }

      lastSubmitRef.current = now;
      setNote("");
      onSuccess?.("Bildirim Telegram’a gönderildi.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bildirim gönderilirken bir hata oluştu.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Overlay */}
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
        aria-label="Bildirimi kapat"
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-md rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-500 text-white">
              <AlertTriangle className="size-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {typeLabel}
              </h2>
              <span
                className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${typeBadge}`}
              >
                {type === "product_missing" ? "Ürün Sistemde Yok" : "Stok Görünmüyor"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
            aria-label="Kapat"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                Barkod
              </label>
              <div className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100">
                {barcode}
              </div>
            </div>
            {productName && (
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  Ürün Adı
                </label>
                <div className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100">
                  {productName}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
              Açıklama (opsiyonel)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={250}
              className="w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              placeholder="İsterseniz kısa bir not ekleyin (maks. 250 karakter)..."
            />
            <p className="mt-0.5 text-right text-[11px] text-zinc-400 dark:text-zinc-500">
              {note.length}/250
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Gönderiliyor..." : "Telegram’a Gönder"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}



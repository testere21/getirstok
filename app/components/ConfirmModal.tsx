"use client";

import { X, AlertTriangle } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  /** "danger" = kırmızı onay butonu (silme), "neutral" = gri */
  variant?: "danger" | "neutral";
}

export function ConfirmModal({
  isOpen,
  onClose,
  title = "Emin misiniz?",
  message,
  confirmLabel = "Tamam",
  cancelLabel = "İptal",
  onConfirm,
  variant = "danger",
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-desc"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
        aria-label="Kapat"
      />
      <div
        className="relative w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                variant === "danger"
                  ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
              }`}
            >
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <h2
                id="confirm-modal-title"
                className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
              >
                {title}
              </h2>
              <p
                id="confirm-modal-desc"
                className="mt-1 text-sm text-zinc-600 dark:text-zinc-400"
              >
                {message}
              </p>
            </div>
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
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold text-white shadow transition ${
              variant === "danger"
                ? "bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
                : "bg-zinc-700 hover:bg-zinc-800 dark:bg-zinc-600 dark:hover:bg-zinc-500"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

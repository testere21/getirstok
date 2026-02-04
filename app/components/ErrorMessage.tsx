"use client";

import { X, AlertCircle } from "lucide-react";

interface ErrorMessageProps {
  message: string;
  onDismiss?: () => void;
  /** ARIA live region için kullanılır (ekran okuyucu desteği) */
  ariaLive?: "polite" | "assertive" | "off";
}

export function ErrorMessage({ message, onDismiss, ariaLive = "polite" }: ErrorMessageProps) {
  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200"
      role="alert"
      aria-live={ariaLive}
    >
      <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{message}</p>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded p-1 text-red-600 transition hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-900/50"
          aria-label="Hata mesajını kapat"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

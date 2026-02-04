"use client";

import { useEffect } from "react";
import { CheckCircle2, XCircle, X } from "lucide-react";

export type ToastType = "success" | "error";

interface ToastProps {
  message: string;
  type: ToastType;
  onDismiss: () => void;
  /** Otomatik kapanma süresi (ms). 0 ise otomatik kapanmaz. */
  autoClose?: number;
}

export function Toast({ message, type, onDismiss, autoClose = 5000 }: ToastProps) {
  useEffect(() => {
    if (autoClose > 0) {
      const timer = setTimeout(() => {
        onDismiss();
      }, autoClose);
      return () => clearTimeout(timer);
    }
  }, [autoClose, onDismiss]);

  const isSuccess = type === "success";
  const bgColor = isSuccess
    ? "bg-green-50 border-green-200 dark:bg-green-900/30 dark:border-green-800"
    : "bg-red-50 border-red-200 dark:bg-red-900/30 dark:border-red-800";
  const textColor = isSuccess
    ? "text-green-800 dark:text-green-200"
    : "text-red-800 dark:text-red-200";
  const iconColor = isSuccess
    ? "text-green-600 dark:text-green-400"
    : "text-red-600 dark:text-red-400";

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${bgColor} ${textColor}`}
      role="alert"
      aria-live="polite"
    >
      {isSuccess ? (
        <CheckCircle2 className={`mt-0.5 size-5 shrink-0 ${iconColor}`} aria-hidden />
      ) : (
        <XCircle className={`mt-0.5 size-5 shrink-0 ${iconColor}`} aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium">{message}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className={`shrink-0 rounded p-1 transition hover:opacity-70 ${textColor}`}
        aria-label="Bildirimi kapat"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

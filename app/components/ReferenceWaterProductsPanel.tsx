"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export type ReferenceWaterProductsPanelProps = {
  open: boolean;
  onClose: () => void;
  /** Faz 4: referans satırları + barkod görselleri */
  children?: ReactNode;
};

/**
 * Masaüstünde sağdan açılan referans su paneli kabuğu (backdrop, animasyon, kapatma).
 * `md` altında DOM’da yok (`hidden md:block`); tetikleyici de gizli olduğu için `open` pratikte sadece geniş ekranda kullanılır.
 */
export function ReferenceWaterProductsPanel({
  open,
  onClose,
  children,
}: ReferenceWaterProductsPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  /** Açılışta kapat butonuna odak; kapanınca tetikleyiciye dön (Faz 5.2) */
  useEffect(() => {
    if (!open) return;
    const previous =
      typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
    const id = requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(id);
      if (previous?.isConnected && typeof previous.focus === "function") {
        previous.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[56] hidden md:block" data-reference-water-panel-root>
      <div
        className="absolute inset-0 bg-gradient-to-br from-sky-900/55 via-slate-900/50 to-cyan-950/55 backdrop-blur-[2px] transition-opacity motion-reduce:transition-none motion-reduce:backdrop-blur-none"
        aria-hidden
        onClick={onClose}
        role="presentation"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Referans ürün barkodları"
        aria-describedby="reference-water-panel-desc"
        className="ref-water-drawer-panel absolute right-0 top-0 flex min-h-0 h-dvh w-full max-w-2xl flex-col border-l border-sky-200/70 bg-gradient-to-b from-sky-50/95 via-white to-cyan-50/90 shadow-2xl shadow-sky-900/15 ring-1 ring-sky-200/40 dark:border-cyan-500/25 dark:from-slate-900 dark:via-sky-950/80 dark:to-cyan-950/70 dark:shadow-cyan-950/40 dark:ring-cyan-500/20"
      >
        <p id="reference-water-panel-desc" className="sr-only">
          Seçili referans ürünlerin kısa adları ve barkod görselleri listelenir.
        </p>
        <header className="flex shrink-0 items-center justify-end gap-3 border-b border-sky-200/70 bg-gradient-to-r from-sky-100/90 via-cyan-50/80 to-transparent px-5 py-3 backdrop-blur-sm dark:border-cyan-600/30 dark:from-cyan-950/60 dark:via-sky-950/50 dark:to-transparent">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="flex h-10 min-h-10 min-w-10 shrink-0 items-center justify-center rounded-full bg-white/90 text-sky-700 shadow-sm ring-2 ring-sky-200/80 transition hover:bg-sky-100 hover:text-sky-900 hover:ring-sky-400/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:bg-cyan-950/70 dark:text-cyan-100 dark:ring-cyan-500/50 dark:hover:bg-cyan-900/80 dark:hover:text-white"
            aria-label="Paneli kapat"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 pb-6 pt-4">{children}</div>
      </aside>
    </div>
  );
}

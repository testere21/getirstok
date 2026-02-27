"use client";

import { useState } from "react";
import { Copy, Search } from "lucide-react";
import { BarcodeImage } from "./BarcodeImage";

interface BarkodOlusturucuModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Barkod input değeri (kontrollü) */
  value: string;
  /** Input değiştiğinde (örn. sadece rakam kabul) */
  onChange: (value: string) => void;
  /** Opsiyonel: barkodu arama alanına gönder (Faz 4.1) */
  onSendToSearch?: (barcode: string) => void;
}

export function BarkodOlusturucuModal({
  isOpen,
  onClose,
  value,
  onChange,
  onSendToSearch,
}: BarkodOlusturucuModalProps) {
  const [copied, setCopied] = useState(false);
  if (!isOpen) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value.replace(/\D/g, "");
    onChange(next);
  };

  const handleCopy = async () => {
    if (!value.trim()) return;
    try {
      await navigator.clipboard.writeText(value.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API yoksa sessizce geç
    }
  };

  const handleSendToSearch = () => {
    if (!value.trim()) return;
    onSendToSearch?.(value.trim());
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="barkod-olusturucu-title"
    >
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Kapat"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-md rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-600 dark:bg-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id="barkod-olusturucu-title"
            className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
          >
            Barkod Oluşturucu
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
            aria-label="Kapat"
          >
            <span className="sr-only">Kapat</span>
            <svg
              className="size-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="mt-4">
          <label htmlFor="barkod-olusturucu-input" className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Barkod numarası
          </label>
          <input
            id="barkod-olusturucu-input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]*"
            value={value}
            onChange={handleInputChange}
            placeholder="Rakamları yazın (örn. 8690570546989)"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-500"
            aria-describedby="barkod-olusturucu-hint"
          />
          <p id="barkod-olusturucu-hint" className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            En az 6–8 rakam girin; yazdıkça barkod görseli oluşur.
          </p>
        </div>
        {/* Yazarken otomatik barkod görseli (Faz 3.1, 3.3) */}
        <div className="mt-4 max-w-full overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-600 dark:bg-zinc-900/50">
          <BarcodeImage barcode={value} width={2} height={64} className="min-h-[80px]" />
        </div>
        {/* Kopyala / Aramaya gönder (Faz 4.1) */}
        {value.trim().length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              aria-label="Barkodu panoya kopyala"
            >
              <Copy className="size-4" aria-hidden />
              {copied ? "Kopyalandı!" : "Kopyala"}
            </button>
            {onSendToSearch && (
              <button
                type="button"
                onClick={handleSendToSearch}
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-700 dark:hover:bg-zinc-600"
                aria-label="Barkodu arama alanına gönder"
              >
                <Search className="size-4" aria-hidden />
                Aramaya gönder
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

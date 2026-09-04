"use client";

import { Search, X, Camera } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear?: () => void;
  onScanClick?: () => void;
  placeholder?: string;
}

export function SearchBar({
  value,
  onChange,
  onClear,
  onScanClick,
  placeholder = "Ürün ismi veya barkod ile ara",
}: SearchBarProps) {
  return (
    <label className="flex w-full items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-3 shadow-sm transition duration-200 hover:border-zinc-400 hover:shadow-md dark:border-zinc-600 dark:bg-zinc-800 dark:hover:border-zinc-500 dark:hover:shadow-lg dark:hover:shadow-black/40 focus-within:border-[var(--color-primary)] focus-within:shadow-md focus-within:ring-2 focus-within:ring-[var(--color-primary)]/20 focus-within:hover:border-[var(--color-primary)] motion-reduce:transition-none">
      <Search
        className="size-5 shrink-0 text-zinc-400 dark:text-zinc-500"
        aria-hidden
      />
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-base text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100 dark:placeholder:text-zinc-500"
        aria-label="Ürün ismi veya barkod ile ara"
      />
      {value && onClear && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="shrink-0 rounded-lg p-1.5 text-zinc-400 transition duration-200 hover:bg-zinc-200 hover:text-zinc-800 dark:hover:bg-zinc-600 dark:hover:text-zinc-50"
          aria-label="Aramayı temizle"
          title="Temizle"
        >
          <X className="size-4" />
        </button>
      )}
      {onScanClick && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onScanClick();
          }}
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg p-1.5 text-zinc-400 transition duration-200 hover:bg-zinc-200 hover:text-zinc-800 dark:hover:bg-zinc-600 dark:hover:text-zinc-50 sm:min-h-0 sm:min-w-0"
          aria-label="Barkod tara"
          title="Barkod Tara"
        >
          <Camera className="size-5" />
        </button>
      )}
    </label>
  );
}

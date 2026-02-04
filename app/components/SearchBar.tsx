"use client";

import { Search, X } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear?: () => void;
  placeholder?: string;
}

export function SearchBar({
  value,
  onChange,
  onClear,
  placeholder = "Ürün ismi veya barkod ile ara",
}: SearchBarProps) {
  return (
    <label className="flex w-full items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-3 shadow-sm transition focus-within:border-[var(--color-primary)] focus-within:ring-2 focus-within:ring-[var(--color-primary)]/20 dark:border-zinc-600 dark:bg-zinc-800">
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
          className="shrink-0 rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
          aria-label="Aramayı temizle"
          title="Temizle"
        >
          <X className="size-4" />
        </button>
      )}
    </label>
  );
}

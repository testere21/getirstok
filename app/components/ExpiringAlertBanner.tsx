"use client";

import { BellRing, X } from "lucide-react";

interface ExpiringAlertBannerProps {
  /** Bugün çıkılması gereken ürün sayısı */
  count: number;
  /** inline: mobilde üst kartın içinde şerit · floating: geniş ekranda sağ altta sabit rozet */
  variant: "inline" | "floating";
  onOpen: () => void;
  onDismiss: () => void;
}

/**
 * Yaklaşan SKT uyarısı. Dikkat çekmesi için halka dalgası, turuncu-kırmızı renk geçişi,
 * ışık süpürmesi ve çalan zil animasyonu var (stiller `globals.css` içinde `.skt-alert*`;
 * "hareketi azalt" ayarı açık cihazlarda animasyon kapanır).
 */
export function ExpiringAlertBanner({ count, variant, onOpen, onDismiss }: ExpiringAlertBannerProps) {
  const floating = variant === "floating";
  return (
    <div
      role="alert"
      className={`skt-alert items-stretch overflow-hidden text-white ${
        floating
          ? "fixed bottom-6 right-6 z-40 hidden w-[24rem] max-w-[calc(100vw-3rem)] rounded-2xl shadow-xl sm:flex"
          : "relative mb-4 flex rounded-xl shadow-md sm:hidden"
      }`}
    >
      <span className="skt-alert-shine" aria-hidden />
      <button
        type="button"
        onClick={onOpen}
        className="relative flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-black/10 active:bg-black/15"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/30">
          <BellRing className="skt-alert-bell size-5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold leading-tight sm:text-[15px]">Bugün çıkılacak ürün var!</span>
          <span className="mt-0.5 block text-xs font-medium leading-tight text-white/90">
            {count} ürün · görmek için dokunun
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="relative flex w-12 shrink-0 items-center justify-center border-l border-white/25 transition hover:bg-black/10 active:bg-black/15"
        aria-label="SKT uyarısını kapat"
        title="Uyarıyı kapat"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

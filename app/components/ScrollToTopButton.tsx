"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

interface ScrollToTopButtonProps {
  /** Konum sınıfları (alttaki sabit düğme/rozetlerin üstünde kalmak için sayfa belirler) */
  className?: string;
}

/** Sayfa aşağı kaydırılınca sağ altta beliren "en üste çık" düğmesi */
export function ScrollToTopButton({ className = "bottom-5 right-4" }: ScrollToTopButtonProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 500);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      }}
      aria-label="Sayfanın başına çık"
      title="Başa dön"
      tabIndex={visible ? 0 : -1}
      className={`fixed z-30 flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/30 ring-1 ring-white/30 transition duration-200 hover:scale-105 active:scale-95 motion-reduce:transition-none ${className} ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <ArrowUp className="size-5" aria-hidden />
    </button>
  );
}

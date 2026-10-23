"use client";

import { useEffect, useState } from "react";
import { Check, MapPin, PackageCheck, ShoppingBasket, Trash2, X } from "lucide-react";
import { deletePickingOrder } from "@/app/lib/pickingOrderStore";
import type { PickingOrder, PickingOrderItem } from "@/app/lib/pickingOrders";

function ImageLightbox({ item, onClose }: { item: PickingOrderItem; onClose: () => void }) {
  useEffect(() => {
    // Önce çalışsın ve yalnız görseli kapatsın (alttaki toplama penceresi açık kalsın)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-black/90 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.name} görseli`}
      onClick={onClose}
    >
      <div className="flex shrink-0 justify-end pb-2">
        <button
          type="button"
          className="flex size-10 items-center justify-center rounded-full bg-zinc-800 text-zinc-100 ring-1 ring-zinc-600/80 transition hover:bg-zinc-700"
          aria-label="Kapat"
          onClick={onClose}
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- harici CDN ürün görseli */}
        <img
          src={item.imageUrl ?? ""}
          alt={item.name}
          className="max-h-full max-w-full rounded-2xl bg-white object-contain p-4"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <div className="shrink-0 pt-3 text-center" onClick={(e) => e.stopPropagation()}>
        <p className="text-base font-semibold text-white">{item.name}</p>
        {item.barcode && <p className="mt-0.5 font-mono text-sm text-zinc-400">{item.barcode}</p>}
      </div>
    </div>
  );
}

interface PickingOrdersTabContentProps {
  orders: PickingOrder[];
  onError: (message: string) => void;
}

function timeAgo(iso: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60000);
  if (!Number.isFinite(minutes) || minutes < 1) return "az önce";
  if (minutes < 60) return `${minutes} dk önce`;
  return `${Math.floor(minutes / 60)} sa önce`;
}

/** Eklentinin eski sürümü lokasyonları birleşik gönderebiliyordu ("BNK.017BNK.088") */
function splitLocations(locations: string[]): string[] {
  return [...new Set(locations.flatMap((l) => l.match(/[a-zçğıöşü]+\.\d+/gi) ?? [l]))];
}

function totalQuantity(order: PickingOrder): number {
  return order.items.reduce((sum, it) => {
    const n = Number(it.quantity.replace(",", "."));
    return sum + (Number.isInteger(n) && n > 0 ? n : 1);
  }, 0);
}

function PickingOrderCard({
  order,
  now,
  picked,
  onTogglePicked,
  onOpenImage,
  onDelete,
}: {
  order: PickingOrder;
  now: number;
  picked: ReadonlySet<number>;
  onTogglePicked: (index: number) => void;
  onOpenImage: (item: PickingOrderItem) => void;
  onDelete: () => void;
}) {
  const done = picked.size;
  const total = order.items.length;
  const allPicked = done === total;
  return (
    <section
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition dark:bg-zinc-900 ${
        allPicked ? "border-emerald-300 dark:border-emerald-700" : "border-zinc-200 dark:border-zinc-700"
      }`}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-zinc-100 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/50">
        <span className="font-mono text-sm font-bold text-violet-700 dark:text-violet-300" title={order.orderId}>
          #{order.orderId.slice(-6)}
        </span>
        {splitLocations(order.locations).map((loc) => (
          <span
            key={loc}
            className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-800 dark:bg-violet-950/60 dark:text-violet-200"
          >
            <MapPin className="size-3" aria-hidden />
            {loc}
          </span>
        ))}
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {total} ürün · {totalQuantity(order)} adet · {timeAgo(order.addedAt, now)}
        </span>
        <span
          className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${
            allPicked
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
              : "bg-zinc-200/70 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
          }`}
        >
          {done}/{total}
        </span>
      </header>

      <ul role="list" className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {order.items.map((item, index) => {
          const isPicked = picked.has(index);
          return (
            <li
              key={`${item.name}-${index}`}
              className={`flex min-h-[64px] items-center transition ${
                isPicked
                  ? "bg-emerald-50/70 dark:bg-emerald-950/30"
                  : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
              }`}
            >
              {/* Satır üç parça: işaret | görsel (büyütür) | ad + adet; işaret ve ad aynı işi yapar */}
              <button
                type="button"
                tabIndex={-1}
                aria-hidden
                onClick={() => onTogglePicked(index)}
                className="flex self-stretch items-center pl-4 pr-3"
              >
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition ${
                    isPicked
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-900"
                  }`}
                >
                  {isPicked && <Check className="size-3.5" strokeWidth={3} />}
                </span>
              </button>
              {item.imageUrl ? (
                <button
                  type="button"
                  onClick={() => onOpenImage(item)}
                  aria-label={`${item.name} görselini büyüt`}
                  className="shrink-0 rounded-lg transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-violet-500"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- harici CDN ürün görseli */}
                  <img
                    src={item.imageUrl}
                    alt=""
                    className={`size-12 cursor-zoom-in rounded-lg border border-zinc-200 bg-white object-contain p-0.5 dark:border-zinc-700 ${
                      isPicked ? "opacity-50" : ""
                    }`}
                  />
                </button>
              ) : (
                <span className="size-12 shrink-0 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-700" />
              )}
              <button
                type="button"
                onClick={() => onTogglePicked(index)}
                aria-pressed={isPicked}
                className="flex min-w-0 flex-1 items-center gap-3 self-stretch py-2 pl-3 pr-4 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-sm font-semibold leading-snug ${
                      isPicked ? "text-zinc-400 line-through dark:text-zinc-500" : "text-zinc-900 dark:text-zinc-100"
                    }`}
                  >
                    {item.name}
                  </span>
                  {item.barcode && (
                    <span className="mt-0.5 block font-mono text-xs text-zinc-400 dark:text-zinc-500">{item.barcode}</span>
                  )}
                </span>
                <span
                  className={`shrink-0 rounded-xl px-3 py-1 text-xl font-black tabular-nums ${
                    isPicked
                      ? "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
                      : "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-200"
                  }`}
                >
                  ×{item.quantity}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <footer className="flex justify-end border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={onDelete}
          className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${
            allPicked
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "border border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          }`}
        >
          {allPicked ? <PackageCheck className="size-4" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
          Listeyi sil
        </button>
      </footer>
    </section>
  );
}

/** Başlıktaki "Toplama" butonuyla açılan pencere; telefonda tam ekran */
export function PickingOrdersModal({
  isOpen,
  onClose,
  orders,
  onError,
}: PickingOrdersTabContentProps & { isOpen: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="picking-modal-title"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-5xl flex-col overflow-hidden bg-zinc-50 shadow-2xl sm:max-h-[92vh] sm:rounded-2xl dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white">
            <ShoppingBasket className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="picking-modal-title" className="text-base font-bold text-zinc-900 dark:text-zinc-50">
              Toplama
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {orders.length > 0 ? `${orders.length} sipariş bekliyor` : "Bekleyen sipariş yok"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-10 items-center justify-center rounded-xl text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            aria-label="Kapat"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <PickingOrdersTabContent orders={orders} onError={onError} />
        </div>
      </div>
    </div>
  );
}

export function PickingOrdersTabContent({ orders, onError }: PickingOrdersTabContentProps) {
  const [now, setNow] = useState(() => Date.now());
  /** sipariş → işaretlenen ürün sıraları (yalnız bu cihazda; liste silinince gider) */
  const [pickedByOrder, setPickedByOrder] = useState<Record<string, number[]>>({});
  const [zoomItem, setZoomItem] = useState<PickingOrderItem | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const togglePicked = (orderId: string, index: number) => {
    setPickedByOrder((prev) => {
      const current = new Set(prev[orderId] ?? []);
      if (current.has(index)) current.delete(index);
      else current.add(index);
      return { ...prev, [orderId]: [...current] };
    });
  };

  const remove = async (order: PickingOrder) => {
    try {
      await deletePickingOrder(order.orderId);
      setPickedByOrder((prev) => {
        const next = { ...prev };
        delete next[order.orderId];
        return next;
      });
    } catch (error) {
      console.error("[Toplama modu] Silinemedi:", error);
      onError("Toplama listesi silinemedi. Tekrar deneyin.");
    }
  };

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <ShoppingBasket className="size-10 text-zinc-300 dark:text-zinc-600" aria-hidden />
        <p className="text-base font-semibold text-zinc-700 dark:text-zinc-200">Toplanacak sipariş yok</p>
        <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400">
          Depo panelinde bir siparişin detayını açıp sağ alttaki <strong>TM</strong> butonuna basınca ürünleri burada
          listelenir. Birden fazla siparişi aynı anda ekleyebilirsin.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-2">
      {orders.map((order) => {
        const picked = new Set(pickedByOrder[order.orderId] ?? []);
        return (
          <PickingOrderCard
            key={order.orderId}
            order={order}
            now={now}
            picked={picked}
            onTogglePicked={(index) => togglePicked(order.orderId, index)}
            onOpenImage={setZoomItem}
            onDelete={() => void remove(order)}
          />
        );
      })}
      {zoomItem && <ImageLightbox item={zoomItem} onClose={() => setZoomItem(null)} />}
    </div>
  );
}

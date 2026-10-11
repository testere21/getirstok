"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ClipboardList, MapPin, Package, X } from "lucide-react";
import { ConfirmModal } from "./ConfirmModal";
import {
  KASA_PALET_PRODUCTS,
  type KasaPaletProduct,
} from "@/app/lib/kasaPaletProducts";

interface KasaPaletSayimTabContentProps {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

function KasaPaletRow({
  product,
  checked,
  disabled,
  onToggle,
}: {
  product: KasaPaletProduct;
  checked: boolean;
  disabled: boolean;
  onToggle: (productId: string) => void;
}) {
  return (
    <li>
      <label
        className={`flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition ${
          checked
            ? "border-violet-500 bg-violet-50 dark:border-violet-400 dark:bg-violet-950/40"
            : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600 dark:hover:bg-zinc-700/60"
        } ${disabled ? "pointer-events-none opacity-60" : ""}`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={() => onToggle(product.productId)}
          className="sr-only"
        />
        <span
          className={`flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition ${
            checked
              ? "border-violet-600 bg-violet-600 text-white dark:border-violet-400 dark:bg-violet-400 dark:text-zinc-900"
              : "border-zinc-300 bg-white dark:border-zinc-500 dark:bg-zinc-900"
          }`}
          aria-hidden
        >
          {checked && <Check className="size-3.5" strokeWidth={3} />}
        </span>
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- harici CDN ürün görseli
          <img
            src={product.imageUrl}
            alt=""
            className="size-10 shrink-0 rounded-md border border-zinc-200 bg-white object-contain dark:border-zinc-700"
          />
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
            <Package className="size-5 text-zinc-400" aria-hidden />
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {product.name}
          </span>
          <span className="block text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
            {product.barcode}
          </span>
        </span>
      </label>
    </li>
  );
}

function LocationModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kasa-palet-location-title"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
        aria-label="Kapat"
      />
      <div className="relative w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
          aria-label="Kapat"
        >
          <X className="size-5" />
        </button>
        {/* Koyu temada da okunabilsin diye QR beyaz zemin üzerinde */}
        <div className="mx-auto mt-6 w-full max-w-[18rem] rounded-lg bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- statik QR görseli */}
          <img
            src="/kasa-palet-lokasyon.png"
            alt="Kasa/Palet lokasyonu QR kodu"
            className="block h-auto w-full"
          />
        </div>
        <p
          id="kasa-palet-location-title"
          className="mt-3 text-center text-base font-semibold text-zinc-900 dark:text-zinc-50"
        >
          Kasa/Palet lokasyonu
        </p>
      </div>
    </div>
  );
}

export function KasaPaletSayimTabContent({
  onSuccess,
  onError,
}: KasaPaletSayimTabContentProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const closeLocation = useCallback(() => setLocationOpen(false), []);
  /** Açılmış ama henüz depo panelinde onaylanmamış sayım */
  const [pendingCheck, setPendingCheck] = useState<{
    id: string;
    productNames: string[];
  } | null>(null);
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const approvingRef = useRef(false);
  // State güncellenmeden gelen ikinci tıklama da ikinci sayımı açmasın
  const creatingRef = useRef(false);

  const selectedProducts = useMemo(
    () => KASA_PALET_PRODUCTS.filter((p) => selectedIds.has(p.productId)),
    [selectedIds]
  );
  const selectedCount = selectedProducts.length;
  const allSelected = selectedCount === KASA_PALET_PRODUCTS.length;

  const toggle = (productId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const createInventoryCheck = async () => {
    if (creatingRef.current || selectedProducts.length === 0) return;
    creatingRef.current = true;
    setCreating(true);
    const products = selectedProducts;
    try {
      const res = await fetch("/api/warehouse-inventory-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: products.map((p) => p.productId) }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        inventoryCheckId?: string;
        error?: string;
      } | null;

      if (res.ok && data?.success && data.inventoryCheckId) {
        setSelectedIds(new Set());
        setPendingCheck({
          id: data.inventoryCheckId,
          productNames: products.map((p) => p.name),
        });
        setApproveConfirmOpen(true);
      } else {
        onError(data?.error || `Sayım açılamadı (HTTP ${res.status}).`);
      }
    } catch {
      onError(
        "Sunucuya bağlanılamadı. Sayım açılmış olabilir; tekrar denemeden önce depo panelindeki sayım listesine bakın."
      );
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  const approveInventoryCheck = async () => {
    const check = pendingCheck;
    if (!check || approvingRef.current) return;
    approvingRef.current = true;
    setApproving(true);
    try {
      const res = await fetch("/api/warehouse-inventory-check/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventoryCheckId: check.id }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;

      if (res.ok && data?.success) {
        setPendingCheck(null);
        onSuccess(
          `Sayım açıldı ve onaylandı: ${check.productNames.length} ürün (${check.productNames.join(
            ", "
          )}). Sayım no: ${check.id}`
        );
      } else {
        onError(
          `Sayım açıldı ama onaylanamadı: ${
            data?.error || `HTTP ${res.status}`
          } Sekmedeki "Onayla" ile tekrar deneyebilirsiniz.`
        );
      }
    } catch {
      onError(
        "Sunucuya bağlanılamadı. Sayım onaylanmış olabilir; tekrar denemeden önce depo panelinde sayımın durumuna bakın."
      );
    } finally {
      approvingRef.current = false;
      setApproving(false);
    }
  };

  return (
    <div className="flex max-h-[55vh] min-h-[8rem] flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800/50">
        <button
          type="button"
          onClick={() =>
            setSelectedIds(
              allSelected
                ? new Set()
                : new Set(KASA_PALET_PRODUCTS.map((p) => p.productId))
            )
          }
          disabled={creating}
          className="rounded-lg px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-200 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          {allSelected ? "Tümünü kaldır" : "Tümünü seç"}
        </button>
        {selectedCount > 0 && !allSelected && (
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            disabled={creating}
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-200 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Seçimi temizle
          </button>
        )}
        <button
          type="button"
          onClick={() => setLocationOpen(true)}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-white px-2.5 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-50 dark:border-violet-700 dark:bg-zinc-900 dark:text-violet-300 dark:hover:bg-violet-950/40"
        >
          <MapPin className="size-3.5" aria-hidden />
          Lokasyon göster
        </button>
        <span className="text-xs text-zinc-600 dark:text-zinc-300">
          <strong className="tabular-nums">{selectedCount}</strong> /{" "}
          {KASA_PALET_PRODUCTS.length} seçili
        </span>
      </div>

      {pendingCheck && !approveConfirmOpen && (
        <div
          className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100"
          role="status"
        >
          <p className="min-w-0 flex-1">
            <strong className="font-semibold">Onay bekliyor:</strong> sayım
            açıldı ama depo panelinde onaylanmadı ({pendingCheck.productNames.join(", ")}
            ). Sayım no:{" "}
            <span className="tabular-nums">{pendingCheck.id}</span>
          </p>
          <button
            type="button"
            onClick={() => setApproveConfirmOpen(true)}
            disabled={approving}
            className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:cursor-wait disabled:opacity-50"
          >
            <Check className="size-3.5" aria-hidden />
            {approving ? "Onaylanıyor…" : "Onayla"}
          </button>
          <button
            type="button"
            onClick={() => setPendingCheck(null)}
            disabled={approving}
            className="rounded-lg p-1 text-amber-800 transition hover:bg-amber-200/70 disabled:opacity-50 dark:text-amber-200 dark:hover:bg-amber-900/50"
            aria-label="Uyarıyı kapat (sayım onaysız kalır)"
            title="Kapat (sayım depo panelinde onaysız kalır)"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <ul className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {KASA_PALET_PRODUCTS.map((product) => (
            <KasaPaletRow
              key={product.productId}
              product={product}
              checked={selectedIds.has(product.productId)}
              disabled={creating}
              onToggle={toggle}
            />
          ))}
        </ul>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-800/50">
        <p className="min-w-0 flex-1 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
          Seçilen ürünler depo panelinde tek bir sayımda açılır · Kısmi ·
          Stoklara dair şüphelerim var
        </p>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={selectedCount === 0 || creating}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ClipboardList className="size-4" aria-hidden />
          {creating
            ? "Sayım açılıyor…"
            : selectedCount > 0
              ? `Sayım oluştur (${selectedCount})`
              : "Sayım oluştur"}
        </button>
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Sayım açılsın mı?"
        message={`${selectedCount} ürünle depo panelinde sayım açılacak: ${selectedProducts
          .map((p) => p.name)
          .join(", ")}. Emin misiniz?`}
        confirmLabel="Eminim"
        cancelLabel="Vazgeç"
        variant="neutral"
        onConfirm={() => {
          void createInventoryCheck();
        }}
      />

      <ConfirmModal
        isOpen={approveConfirmOpen && pendingCheck !== null}
        onClose={() => setApproveConfirmOpen(false)}
        title="Sayım onaylansın mı?"
        message={`Sayım açıldı (${pendingCheck?.productNames.length ?? 0} ürün: ${
          pendingCheck?.productNames.join(", ") ?? ""
        }). Depo panelinde onaylansın mı? Onaylanınca görevler el terminaline düşer.`}
        confirmLabel="Evet"
        cancelLabel="Hayır"
        variant="neutral"
        onConfirm={() => {
          void approveInventoryCheck();
        }}
      />

      {locationOpen && <LocationModal onClose={closeLocation} />}
    </div>
  );
}

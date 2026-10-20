"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2, UserPlus, X } from "lucide-react";
import { FRANCHISE_WAREHOUSES } from "@/app/lib/franchiseWarehouses";
import { pickerWarehouseId, type PickerEntry } from "@/app/lib/pickerStatsMerge";
import {
  PickerListError,
  addPicker,
  removeManualPicker,
  setPickerActive,
  setPickerWarehouse,
} from "@/app/lib/pickerStatsStore";

interface PickerManageModalProps {
  pickers: Record<string, PickerEntry>;
  /** Yeni kişi formunda seçili gelen depo */
  defaultWarehouseId: string;
  onClose: () => void;
  /** Liste değişti; durum yeniden okunmalı */
  onChanged: () => void;
  /** Yeni kişi eklendi; işaretlenen raporlar yeniden okunmalı */
  onAdded: (reprocess: number) => void;
  /** Bir kişinin siparişleri başka depoya taşındı; gün verisi yeniden okunmalı */
  onMoved: () => void;
}

function errorMessage(error: unknown): string {
  if (error instanceof PickerListError) return error.message;
  return "İşlem yapılamadı. İnternet bağlantısını kontrol edip tekrar deneyin.";
}

const selectClass =
  "min-h-[32px] rounded-lg border border-zinc-300 bg-white px-2 text-xs text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

export function PickerManageModal({
  pickers,
  defaultWarehouseId,
  onClose,
  onChanged,
  onAdded,
  onMoved,
}: PickerManageModalProps) {
  const [name, setName] = useState("");
  const [newWarehouseId, setNewWarehouseId] = useState(defaultWarehouseId);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmRemoveKey, setConfirmRemoveKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const groups = useMemo(
    () =>
      FRANCHISE_WAREHOUSES.map((w) => ({
        warehouse: w,
        rows: Object.entries(pickers)
          .filter(([, p]) => pickerWarehouseId(p) === w.id)
          .sort(([, a], [, b]) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "tr")),
      })),
    [pickers]
  );

  const run = async (key: string, action: () => Promise<void>) => {
    setBusyKey(key);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyKey(null);
    }
  };

  const onAdd = (e: React.FormEvent) => {
    e.preventDefault();
    void run("__add__", async () => {
      const { reprocess } = await addPicker(name, newWarehouseId);
      setName("");
      onChanged();
      onAdded(reprocess);
    });
  };

  const onMove = (key: string, p: PickerEntry, warehouseId: string) => {
    void run(key, async () => {
      const moved = await setPickerWarehouse(key, warehouseId);
      const target = FRANCHISE_WAREHOUSES.find((w) => w.id === warehouseId)?.name ?? "";
      setNotice(`${p.name} → ${target}: ${moved} sipariş taşındı.`);
      onChanged();
      onMoved();
    });
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="picker-manage-title"
    >
      <button type="button" onClick={onClose} className="absolute inset-0 bg-black/50" aria-label="Kapat" />
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <h3 id="picker-manage-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Toplayıcılar
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
            aria-label="Kapat"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4">
          {groups.map(({ warehouse, rows }) => (
            <section key={warehouse.id} className="py-2">
              <h4 className="sticky top-0 z-10 bg-white py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                {warehouse.name} · {rows.filter(([, p]) => p.active).length} aktif
              </h4>
              {rows.length === 0 ? (
                <p className="py-2 text-xs text-zinc-400">Bu depoda kayıtlı toplayıcı yok.</p>
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {rows.map(([key, p]) => {
                    const busy = busyKey === key;
                    return (
                      <li key={key} className="flex items-center gap-2 py-2">
                        <div className="min-w-0 flex-1">
                          <p
                            className={`truncate text-sm font-medium ${
                              p.active
                                ? "text-zinc-900 dark:text-zinc-100"
                                : "text-zinc-400 line-through dark:text-zinc-500"
                            }`}
                          >
                            {p.name}
                          </p>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            {p.source === "auto" ? "Raporlardan eklendi" : "Elle eklendi"}
                          </p>
                        </div>
                        <select
                          value={pickerWarehouseId(p)}
                          disabled={busy}
                          onChange={(e) => onMove(key, p, e.target.value)}
                          className={selectClass}
                          aria-label={`${p.name} deposu`}
                          title="Deposunu değiştir (kayıtlı siparişleri de taşınır)"
                        >
                          {FRANCHISE_WAREHOUSES.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                        {p.source === "manual" &&
                          (confirmRemoveKey === key ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void run(key, async () => {
                                  await removeManualPicker(key);
                                  setConfirmRemoveKey(null);
                                  onChanged();
                                })
                              }
                              className="min-h-[32px] rounded-lg bg-red-600 px-2.5 text-xs font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
                            >
                              Kaldır?
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmRemoveKey(key)}
                              className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                              aria-label={`${p.name} listeden kaldır`}
                              title="Listeden kaldır (yanlış yazılan isim için)"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          ))}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={p.active}
                          aria-label={`${p.name} ${p.active ? "aktif" : "pasif"}`}
                          disabled={busy}
                          onClick={() =>
                            void run(key, async () => {
                              await setPickerActive(key, !p.active);
                              onChanged();
                            })
                          }
                          className={`inline-flex min-h-[32px] min-w-[4.5rem] items-center justify-center gap-1 rounded-full px-3 text-xs font-semibold transition disabled:opacity-60 ${
                            p.active
                              ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300"
                              : "bg-zinc-200 text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300"
                          }`}
                        >
                          {busy && <Loader2 className="size-3 animate-spin" aria-hidden />}
                          {p.active ? "Aktif" : "Pasif"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>

        <form onSubmit={onAdd} className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <label htmlFor="picker-add-name" className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
            Yeni toplayıcı ekle
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="picker-add-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ad Soyad (rapordaki gibi)"
              maxLength={60}
              className="min-h-[40px] min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
            <select
              value={newWarehouseId}
              onChange={(e) => setNewWarehouseId(e.target.value)}
              className={`${selectClass} min-h-[40px] text-sm`}
              aria-label="Yeni toplayıcının deposu"
            >
              {FRANCHISE_WAREHOUSES.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={name.trim().length < 3 || busyKey === "__add__"}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-teal-600 px-3 text-sm font-medium text-white transition hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-500 dark:text-zinc-900 dark:hover:bg-teal-400"
            >
              {busyKey === "__add__" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <UserPlus className="size-4" aria-hidden />
              )}
              Ekle
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            Raporlardaki yeni kişiler deposuyla kendiliğinden eklenir. Elle eklenen kişinin son 8 gündeki
            siparişleri raporlardan yeniden okunur. Pasif yapılan kişi tabloda görünmez, geçmiş verisi silinmez.
          </p>
          {notice && <p className="mt-2 text-sm text-teal-700 dark:text-teal-400">{notice}</p>}
          {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </form>
      </div>
    </div>
  );
}

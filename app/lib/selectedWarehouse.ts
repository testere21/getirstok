/**
 * Panelde seçili depo: bu tarayıcıda `localStorage`'da tutulur, açık sekmeler arasında senkron olur.
 * Seçici arayüzü ve depoya göre filtreleme sonraki adımlarda bu yardımcıya bağlanır.
 */
import { useSyncExternalStore } from "react";
import {
  DEFAULT_PANEL_WAREHOUSE_ID,
  SELECTED_WAREHOUSE_STORAGE_KEY,
  normalizeWarehouseId,
} from "./franchiseWarehouses";

export { SELECTED_WAREHOUSE_STORAGE_KEY };
const CHANGE_EVENT = "getirstok:warehouse-change";

export function readSelectedWarehouseId(): string {
  if (typeof window === "undefined") return DEFAULT_PANEL_WAREHOUSE_ID;
  try {
    return normalizeWarehouseId(window.localStorage.getItem(SELECTED_WAREHOUSE_STORAGE_KEY));
  } catch {
    return DEFAULT_PANEL_WAREHOUSE_ID;
  }
}

export function writeSelectedWarehouseId(id: string): void {
  if (typeof window === "undefined") return;
  const next = normalizeWarehouseId(id);
  try {
    window.localStorage.setItem(SELECTED_WAREHOUSE_STORAGE_KEY, next);
  } catch {
    /* depolama kapalı: seçim sadece bu oturumda geçerli olmaz */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Seçili depo değişince (bu sekmede ya da başka sekmede) çağrılır; aboneliği bırakan işlev döner */
export { subscribe as subscribeSelectedWarehouse };

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === SELECTED_WAREHOUSE_STORAGE_KEY) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Seçili depo kimliği; sunucuda/ilk çizimde varsayılan, tarayıcıda kayıtlı değer */
export function useSelectedWarehouseId(): string {
  return useSyncExternalStore(subscribe, readSelectedWarehouseId, () => DEFAULT_PANEL_WAREHOUSE_ID);
}

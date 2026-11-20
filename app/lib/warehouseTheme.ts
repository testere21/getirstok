/**
 * Depoya göre panel teması. Seçili depo kök elemente `data-warehouse` olarak yazılır;
 * renkler `app/globals.css` içinde bu özniteliğe göre değişir.
 *   Soğukkuyu → mor (varsayılan, CSS'te ek kural yok)
 *   Bostanlı  → mavi
 */
import { BOSTANLI_WAREHOUSE_ID } from "./franchiseWarehouses";

export const WAREHOUSE_THEME_ATTRIBUTE = "data-warehouse";

export type WarehouseTheme = "sogukkuyu" | "bostanli";

export function warehouseThemeOf(warehouseId: string | null | undefined): WarehouseTheme {
  return warehouseId === BOSTANLI_WAREHOUSE_ID ? "bostanli" : "sogukkuyu";
}

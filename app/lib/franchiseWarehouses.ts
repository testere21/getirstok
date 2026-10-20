/** Bayinin depoları (DPS raporlarındaki `warehouse_ids` ve "depo adı" ile aynı). */

export interface FranchiseWarehouse {
  id: string;
  name: string;
}

export const SOGUKKUYU_WAREHOUSE_ID = "6113e59fbb8549d0f20e65f5";

export const FRANCHISE_WAREHOUSES: readonly FranchiseWarehouse[] = [
  { id: SOGUKKUYU_WAREHOUSE_ID, name: "Soğukkuyu" },
  { id: "5dc32dc9734a192200caddfb", name: "Bostanlı" },
  { id: "60b4d307df4c67250e096bfb", name: "Ulupark" },
];

export const FRANCHISE_WAREHOUSE_IDS: readonly string[] = FRANCHISE_WAREHOUSES.map((w) => w.id);

export function isFranchiseWarehouseId(id: string): boolean {
  return FRANCHISE_WAREHOUSE_IDS.includes(id);
}

export function warehouseName(id: string | null | undefined): string {
  return FRANCHISE_WAREHOUSES.find((w) => w.id === id)?.name ?? "Bilinmeyen depo";
}

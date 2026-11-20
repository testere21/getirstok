/**
 * Panelin çalıştığı depolar (DPS raporlarındaki `warehouse_ids` ve "depo adı" ile aynı).
 * Ulupark bilerek yok: panelde gösterilmez, istatistiği toplanmaz (eski kayıtları Firestore'da durur).
 */

export interface FranchiseWarehouse {
  id: string;
  name: string;
}

export const SOGUKKUYU_WAREHOUSE_ID = "6113e59fbb8549d0f20e65f5";
export const BOSTANLI_WAREHOUSE_ID = "5dc32dc9734a192200caddfb";

export const FRANCHISE_WAREHOUSES: readonly FranchiseWarehouse[] = [
  { id: SOGUKKUYU_WAREHOUSE_ID, name: "Soğukkuyu" },
  { id: BOSTANLI_WAREHOUSE_ID, name: "Bostanlı" },
];

export const FRANCHISE_WAREHOUSE_IDS: readonly string[] = FRANCHISE_WAREHOUSES.map((w) => w.id);

/** Seçili deponun tarayıcıda (`localStorage`) tutulduğu anahtar; sunucu bileşenleri de okuyabilsin diye burada */
export const SELECTED_WAREHOUSE_STORAGE_KEY = "getirstok.warehouse";

/** Panelde açılışta seçili gelen depo */
export const DEFAULT_PANEL_WAREHOUSE_ID = SOGUKKUYU_WAREHOUSE_ID;

export function isFranchiseWarehouseId(id: string): boolean {
  return FRANCHISE_WAREHOUSE_IDS.includes(id);
}

export function warehouseName(id: string | null | undefined): string {
  return FRANCHISE_WAREHOUSES.find((w) => w.id === id)?.name ?? "Bilinmeyen depo";
}

/**
 * Bildirim metninin başına eklenecek depo etiketi. Varsayılan depo (Soğukkuyu) için boş döner:
 * mevcut mesajlar aynı kalır, yalnızca diğer depodan gelen bildirimler "📍 Depo: …" ile başlar.
 */
export function warehouseLabelPrefix(warehouseId: string | null | undefined): string {
  if (!warehouseId || warehouseId === DEFAULT_PANEL_WAREHOUSE_ID || !isFranchiseWarehouseId(warehouseId)) return "";
  return `📍 Depo: ${warehouseName(warehouseId)}\n`;
}

/**
 * İstekten gelen depo kimliğini doğrular (API uçları için).
 * - verilmemiş/boş → varsayılan depo (depo bilmeyen eski istemciler Soğukkuyu'dur)
 * - panelde olan depo → o depo
 * - başka her şey → `null` (istek reddedilmeli; başka depoya sessizce düşmez)
 */
export function resolvePanelWarehouseId(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return DEFAULT_PANEL_WAREHOUSE_ID;
  return typeof value === "string" && isFranchiseWarehouseId(value) ? value : null;
}

/**
 * Yazma/aksiyon uçları için (sayım açma gibi): depo AÇIKÇA verilmek zorunda.
 * `resolvePanelWarehouseId`'den farkı: boş/eksik değer Soğukkuyu'ya düşmez, `null` döner.
 * Böylece depo bilgisi kaybolan bir istek yanlışlıkla Soğukkuyu'da işlem açamaz.
 */
export function requireExplicitWarehouseId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return isFranchiseWarehouseId(value) ? value : null;
}

/** Kayıtlı/bozuk bir değeri geçerli depo kimliğine çevirir; tanınmayan değer varsayılan depoya düşer */
export function normalizeWarehouseId(value: unknown): string {
  return typeof value === "string" && isFranchiseWarehouseId(value) ? value : DEFAULT_PANEL_WAREHOUSE_ID;
}

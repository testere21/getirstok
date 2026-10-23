/**
 * Toplama modu: depo panelindeki sipariş detayından (eklenti) gönderilen geçici toplama listeleri.
 * Müşteri bilgisi tutulmaz; yalnız ürünler, adetler ve raf lokasyonları.
 */

/** Silinmeyi unutulan listeler bu süreden sonra kendiliğinden kalkar */
export const PICKING_ORDER_TTL_MS = 24 * 60 * 60 * 1000;
export const PICKING_ORDER_MAX_ITEMS = 200;

export interface PickingOrderItem {
  name: string;
  /** Ekranda görünen adet ("2", "1,5 kg") */
  quantity: string;
  imageUrl: string | null;
  barcode: string | null;
}

export interface PickingOrder {
  orderId: string;
  locations: string[];
  items: PickingOrderItem[];
  /** ISO zaman */
  addedAt: string;
}

const ORDER_ID_RE = /^[a-f0-9]{24}$/i;

function cleanText(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanImageUrl(v: unknown): string | null {
  const url = cleanText(v, 500);
  return /^https:\/\/[^\s]+$/i.test(url) ? url : null;
}

/** Eklentiden gelen gövdeyi doğrular; geçersizse null */
export function sanitizePickingOrder(input: unknown, now: Date = new Date()): PickingOrder | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const orderId = cleanText(raw.orderId, 24).toLowerCase();
  if (!ORDER_ID_RE.test(orderId)) return null;

  const items: PickingOrderItem[] = [];
  for (const it of Array.isArray(raw.items) ? raw.items.slice(0, PICKING_ORDER_MAX_ITEMS) : []) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const name = cleanText(r.name, 200);
    if (!name) continue;
    const barcode = cleanText(r.barcode, 20);
    items.push({
      name,
      quantity: cleanText(r.quantity, 20) || "1",
      imageUrl: cleanImageUrl(r.imageUrl),
      barcode: /^\d{4,20}$/.test(barcode) ? barcode : null,
    });
  }
  if (items.length === 0) return null;

  const locations = [
    ...new Set(
      (Array.isArray(raw.locations) ? raw.locations : [])
        .map((l) => cleanText(l, 40))
        .filter(Boolean)
    ),
  ].slice(0, 20);

  return { orderId, locations, items, addedAt: now.toISOString() };
}

export function isPickingOrderExpired(order: Pick<PickingOrder, "addedAt">, now: number = Date.now()): boolean {
  const at = Date.parse(order.addedAt);
  return !Number.isFinite(at) || now - at > PICKING_ORDER_TTL_MS;
}

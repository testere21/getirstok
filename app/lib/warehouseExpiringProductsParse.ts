export type WarehouseExpiryCalendarRow = {
  id: string;
  fullName: string | null;
  removeFromSaleDate: string | null;
  expiryDate: string | null;
  count: number | null;
};

/** Getir ürün / depo satır id (24 hex). Karşılaştırma her zaman küçük harf. */
export const WAREHOUSE_PRODUCT_ID_RE = /^[a-f0-9]{24}$/i;

export function normalizeWarehouseProductId(id: string): string | null {
  const wanted = id.trim().toLowerCase();
  if (!WAREHOUSE_PRODUCT_ID_RE.test(wanted)) return null;
  return wanted;
}

function pickString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function pickNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function truthyFlag(value: unknown): boolean {
  return value === true;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Yakalanan Getir cevabı sayfalama yok: tek `data[]`, hepsi taranır.
 * Limit/offset/hasNext gibi yarım liste işareti varsa kaydetmeyiz (eksik taramayalım).
 */
export function warehouseExpiryPayloadHasUnfetchedPages(
  payload: unknown
): boolean {
  const root = asRecord(payload);
  if (!root) return false;

  const data = root.data;
  const dataLen = Array.isArray(data) ? data.length : 0;

  if (truthyFlag(root.hasNext) || truthyFlag(root.hasMore) || truthyFlag(root.hasNextPage)) {
    return true;
  }
  if (root.next != null && root.next !== false && root.next !== "") {
    return true;
  }

  const total = finiteNumber(root.total) ?? finiteNumber(root.totalCount);
  if (total != null && total > dataLen) return true;

  const pagination = asRecord(root.pagination);
  if (pagination) {
    if (
      truthyFlag(pagination.hasNext) ||
      truthyFlag(pagination.hasMore) ||
      truthyFlag(pagination.hasNextPage)
    ) {
      return true;
    }
    if (
      pagination.next != null &&
      pagination.next !== false &&
      pagination.next !== ""
    ) {
      return true;
    }
    const pagTotal =
      finiteNumber(pagination.total) ?? finiteNumber(pagination.totalCount);
    if (pagTotal != null && pagTotal > dataLen) return true;
  }

  return false;
}

export function parseWarehouseExpiringProductsPayload(
  payload: unknown
): WarehouseExpiryCalendarRow[] {
  const root = asRecord(payload);
  if (!root) return [];
  const raw = root.data;
  if (!Array.isArray(raw)) return [];

  const out: WarehouseExpiryCalendarRow[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    if (!row) continue;
    const id = normalizeWarehouseProductId(
      pickString(row, "id") || pickString(row, "_id") || ""
    );
    if (!id) continue;
    out.push({
      id,
      fullName: pickString(row, "fullName") || pickString(row, "name"),
      removeFromSaleDate: pickString(row, "removeFromSaleDate"),
      expiryDate: pickString(row, "expiryDate"),
      count: pickNumber(row, "count"),
    });
  }
  return out;
}

export function warehouseExpiryCalendarHasProductId(
  rows: readonly WarehouseExpiryCalendarRow[],
  productId: string
): boolean {
  const wanted = normalizeWarehouseProductId(productId);
  if (!wanted) return false;
  return rows.some((row) => row.id === wanted);
}

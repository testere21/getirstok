import type { CatalogProduct } from "@/app/lib/types";

export function normalizeBarcode(x: string): string {
  return x.trim().replace(/\s+/g, "");
}

/**
 * Barkod -> görsel adresi dizini. `catalogProductMatchesBarcode` ile ilk eşleşen
 * ürünün görseli kazanır (eski `find` davranışıyla aynı), ama arama O(1).
 */
export function buildCatalogImageIndex(
  products: ReadonlyArray<
    Pick<CatalogProduct, "barcode" | "barcodes" | "imageUrl">
  >
): Map<string, string | undefined> {
  const index = new Map<string, string | undefined>();
  for (const p of products) {
    const keys = [p.barcode, ...(p.barcodes ?? [])];
    for (const k of keys) {
      if (typeof k !== "string") continue;
      const b = normalizeBarcode(k);
      if (b && !index.has(b)) index.set(b, p.imageUrl);
    }
  }
  return index;
}

export function catalogProductMatchesBarcode(
  product: Pick<CatalogProduct, "barcode" | "barcodes">,
  barcode: string
): boolean {
  const b = normalizeBarcode(barcode);
  if (!b) return false;
  if (normalizeBarcode(product.barcode) === b) return true;
  const alts = product.barcodes ?? [];
  return alts.some((x) => normalizeBarcode(x) === b);
}


import type { CatalogProduct } from "@/app/lib/types";

function normalizeBarcode(x: string): string {
  return x.trim().replace(/\s+/g, "");
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


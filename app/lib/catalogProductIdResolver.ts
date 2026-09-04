import { readFile } from "fs/promises";
import { join } from "path";
import type { CatalogProduct } from "./types";
import {
  fetchAllSupplementalCatalogAsCatalogProducts,
  mergeProductsJsonWithSupplemental,
  normalizeCatalogBarcodeKey,
} from "./supplementalCatalogProductService";

/**
 * `data/products.json` + Firestore `supplemental_catalog_products` birleşiminden
 * (`GET /api/products` ile aynı kaynak) barkoda karşılık gelen Getir productId'yi döndürür.
 * Firestore `barcode_product_mappings` dışındaki kaynak — stok sorgusunda hızlı yol için kullanılır.
 */
export async function getProductIdsFromMergedCatalog(
  barcodes: readonly string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const unique = [
    ...new Set(barcodes.map((b) => b.trim()).filter((b) => b.length > 0)),
  ];
  if (unique.length === 0) return result;

  let jsonProducts: CatalogProduct[] = [];
  try {
    const path = join(process.cwd(), "data", "products.json");
    const content = await readFile(path, "utf-8");
    const data = JSON.parse(content) as CatalogProduct[];
    jsonProducts = Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("[catalogProductIdResolver] products.json okunamadı:", e);
  }

  let merged: CatalogProduct[] = jsonProducts;
  try {
    const supplemental = await fetchAllSupplementalCatalogAsCatalogProducts();
    merged = mergeProductsJsonWithSupplemental(jsonProducts, supplemental);
  } catch (e) {
    console.warn("[catalogProductIdResolver] supplemental yüklenemedi:", e);
  }

  const byNorm = new Map<string, string>();
  for (const x of merged) {
    const pid = x.productId?.trim();
    const k = normalizeCatalogBarcodeKey(x.barcode);
    if (!pid || !k) continue;
    byNorm.set(k, pid);
  }

  for (const barcode of unique) {
    const k = normalizeCatalogBarcodeKey(barcode);
    const pid = k ? byNorm.get(k) : undefined;
    if (pid) result.set(barcode, pid);
  }
  return result;
}

export async function getProductIdFromMergedCatalog(
  barcode: string
): Promise<string | null> {
  const m = await getProductIdsFromMergedCatalog([barcode]);
  return m.get(barcode.trim()) ?? null;
}

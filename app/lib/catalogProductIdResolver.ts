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
export async function getProductIdFromMergedCatalog(
  barcode: string
): Promise<string | null> {
  const key = normalizeCatalogBarcodeKey(barcode);
  if (!key) return null;

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

  const p = merged.find(
    (x) => normalizeCatalogBarcodeKey(x.barcode) === key
  );
  const pid = p?.productId?.trim();
  return pid || null;
}

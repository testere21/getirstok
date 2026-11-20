import type { CatalogProduct } from "./types";
import { loadCatalogJson } from "./catalogLoader";
import {
  fetchAllSupplementalCatalogAsCatalogProducts,
  mergeProductsJsonWithSupplemental,
  normalizeCatalogBarcodeKey,
} from "./supplementalCatalogProductService";

/** `warehouseId` Bostanlı ise yalnızca Bostanlı'da olan ürünler de kataloğa dahil edilir */
async function loadMergedCatalog(warehouseId?: string): Promise<CatalogProduct[]> {
  let jsonProducts: CatalogProduct[] = [];
  try {
    const data = await loadCatalogJson(warehouseId);
    jsonProducts = Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("[catalogProductIdResolver] products.json okunamadı:", e);
  }

  try {
    const supplemental = await fetchAllSupplementalCatalogAsCatalogProducts();
    return mergeProductsJsonWithSupplemental(jsonProducts, supplemental);
  } catch (e) {
    console.warn("[catalogProductIdResolver] supplemental yüklenemedi:", e);
    return jsonProducts;
  }
}

export async function getProductIdsFromMergedCatalog(
  barcodes: readonly string[],
  warehouseId?: string
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const unique = [
    ...new Set(barcodes.map((b) => b.trim()).filter((b) => b.length > 0)),
  ];
  if (unique.length === 0) return result;

  const merged = await loadMergedCatalog(warehouseId);
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

export async function getCatalogInfoByProductIds(
  productIds: readonly string[],
  warehouseId?: string
): Promise<Map<string, { barcode: string; name: string }>> {
  const result = new Map<string, { barcode: string; name: string }>();
  const wanted = new Set(
    productIds
      .map((id) => id.trim().toLowerCase())
      .filter((id) => /^[a-f0-9]{24}$/.test(id))
  );
  if (wanted.size === 0) return result;

  const merged = await loadMergedCatalog(warehouseId);
  for (const x of merged) {
    const pid = x.productId?.trim().toLowerCase();
    if (!pid || !wanted.has(pid)) continue;
    const barcode = x.barcode?.trim() || "";
    const name = x.name?.trim() || "";
    if (!result.has(pid)) {
      result.set(pid, { barcode, name });
    }
  }
  return result;
}

export async function getProductIdFromMergedCatalog(
  barcode: string,
  warehouseId?: string
): Promise<string | null> {
  const m = await getProductIdsFromMergedCatalog([barcode], warehouseId);
  return m.get(barcode.trim()) ?? null;
}

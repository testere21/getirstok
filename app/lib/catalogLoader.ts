import { readFile } from "fs/promises";
import { join } from "path";
import { BOSTANLI_WAREHOUSE_ID } from "./franchiseWarehouses";
import type { CatalogProduct } from "./types";

/**
 * `data/` altındaki katalog dosyalarını okur (yalnızca sunucu).
 * - `products.json`: Soğukkuyu kataloğu (her depo için temel)
 * - `products-bostanli.json`: yalnızca Bostanlı'da olan ürünler (`npm run sync-bostanli-catalog`);
 *   yalnızca Bostanlı seçiliyse eklenir, böylece Soğukkuyu'nun kataloğu/yükü değişmez.
 */

async function readCatalogFile(fileName: string, required: boolean): Promise<CatalogProduct[]> {
  try {
    const content = await readFile(join(process.cwd(), "data", fileName), "utf-8");
    const data = JSON.parse(content) as CatalogProduct[];
    return Array.isArray(data) ? data : [];
  } catch (err) {
    // Bostanlı dosyası henüz üretilmemiş olabilir: sessizce boş sayılır
    if (required) console.error(`${fileName} okunamadı:`, err);
    return [];
  }
}

export async function loadCatalogJson(warehouseId?: string | null): Promise<CatalogProduct[]> {
  const base = await readCatalogFile("products.json", true);
  if (warehouseId !== BOSTANLI_WAREHOUSE_ID) return base;
  const extra = await readCatalogFile("products-bostanli.json", false);
  return extra.length > 0 ? [...base, ...extra] : base;
}

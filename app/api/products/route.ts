import { NextResponse } from "next/server";
import type { CatalogProduct } from "@/app/lib/types";
import { loadCatalogJson } from "@/app/lib/catalogLoader";
import { resolvePanelWarehouseId } from "@/app/lib/franchiseWarehouses";
import {
  fetchAllSupplementalCatalogAsCatalogProducts,
  mergeProductsJsonWithSupplemental,
} from "@/app/lib/supplementalCatalogProductService";

export type { CatalogProduct };

/**
 * Birleşik katalog. `?warehouseId=` verilmezse Soğukkuyu kataloğu (eski istemciler değişmez);
 * Bostanlı verilirse yalnızca Bostanlı'da olan ürünler de eklenir.
 */
export async function GET(request: Request) {
  const warehouseId = resolvePanelWarehouseId(new URL(request.url).searchParams.get("warehouseId"));
  if (!warehouseId) {
    return NextResponse.json({ error: "Geçersiz depo." }, { status: 400 });
  }

  const jsonProducts = await loadCatalogJson(warehouseId);

  try {
    const supplemental =
      await fetchAllSupplementalCatalogAsCatalogProducts();
    const merged = mergeProductsJsonWithSupplemental(
      jsonProducts,
      supplemental
    );
    return NextResponse.json(merged);
  } catch (err) {
    console.error("[api/products] Firestore birleştirme:", err);
    return NextResponse.json(jsonProducts);
  }
}

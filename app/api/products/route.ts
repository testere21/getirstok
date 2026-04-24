import { readFile } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";
import type { CatalogProduct } from "@/app/lib/types";
import {
  fetchAllSupplementalCatalogAsCatalogProducts,
  mergeProductsJsonWithSupplemental,
} from "@/app/lib/supplementalCatalogProductService";

export type { CatalogProduct };

export async function GET() {
  let jsonProducts: CatalogProduct[] = [];
  try {
    const path = join(process.cwd(), "data", "products.json");
    const content = await readFile(path, "utf-8");
    const data = JSON.parse(content) as CatalogProduct[];
    jsonProducts = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("products.json okunamadı:", err);
    jsonProducts = [];
  }

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

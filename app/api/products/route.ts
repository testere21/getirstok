import { readFile } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";

/** Ürün kataloğu (dosyadan okunur) */
export interface CatalogProduct {
  name: string;
  barcode: string;
  imageUrl?: string;
  productId?: string;
}

export async function GET() {
  try {
    const path = join(process.cwd(), "data", "products.json");
    const content = await readFile(path, "utf-8");
    const data = JSON.parse(content) as CatalogProduct[];
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (err) {
    console.error("products.json okunamadı:", err);
    return NextResponse.json([], { status: 200 });
  }
}

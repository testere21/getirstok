import { readFile } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * products.json'da productId olmayan ürünlerin barcode'larını döndürür
 */
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Sadece development ortamında kullanılabilir." },
      { status: 403, headers: CORS_HEADERS }
    );
  }

  try {
    const productsPath = join(process.cwd(), "data", "products.json");
    const productsData = await readFile(productsPath, "utf-8");
    const products = JSON.parse(productsData);

    // productId olmayan ürünlerin barcode'larını çıkar
    const missingBarcodes = products
      .filter((p: { productId?: string; barcode?: string }) => !p.productId && p.barcode)
      .map((p: { barcode: string }) => p.barcode.trim())
      .filter((barcode: string) => barcode.length > 0);

    return NextResponse.json(
      {
        success: true,
        count: missingBarcodes.length,
        barcodes: missingBarcodes,
      },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("[Missing Barcodes] Hata:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Bilinmeyen hata",
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}


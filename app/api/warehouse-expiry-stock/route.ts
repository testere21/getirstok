import { NextResponse } from "next/server";
import { resolveProductIdsForBarcodes } from "@/app/lib/getirApiService";
import { createBarcodeProductIdCache } from "@/app/lib/barcodeProductIdCache";
import { GetirWarehouseApiError } from "@/app/lib/getirWarehouseApiService";
import {
  EXPIRY_STOCK_MAX_PRODUCTS,
  fetchExpiryStocks,
} from "@/app/lib/getirWarehouseExpiringProductsService";

export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Sayım penceresi her açılışta 100+ barkod gönderiyor; çözümleme katalog dosyası + Firestore
 * okuması gerektirdiği için sonuçlar sunucu belleğinde tutulur.
 */
const productIdCache = createBarcodeProductIdCache(resolveProductIdsForBarcodes);

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()) : [];
}

/**
 * SKT kayıtlarından tarih bazlı stok. Body: `{ barcodes?: string[], productIds?: string[] }`.
 * Barkodlar katalogdan ürün kimliğine çevrilir. Cevap:
 * `{ barcodeToProductId: { barkod: id }, stocks: { id: { total, lots } } }` — SKT kaydı olmayan
 * ürün `stocks`'ta yer almaz.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { barcodes?: unknown; productIds?: unknown } | null;
  const barcodes = [...new Set(stringList(body?.barcodes))];
  const directIds = stringList(body?.productIds);
  if (barcodes.length + directIds.length === 0) {
    return NextResponse.json({ success: true, barcodeToProductId: {}, stocks: {} }, { headers: CORS_HEADERS });
  }
  if (barcodes.length + directIds.length > EXPIRY_STOCK_MAX_PRODUCTS * 3) {
    return NextResponse.json(
      { success: false, error: "Çok fazla ürün gönderildi." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const barcodeToProductId = Object.fromEntries(await productIdCache.resolve(barcodes));
    const productIds = [...new Set([...directIds, ...Object.values(barcodeToProductId)])].slice(
      0,
      EXPIRY_STOCK_MAX_PRODUCTS
    );
    const stocks = Object.fromEntries(await fetchExpiryStocks(productIds));
    return NextResponse.json({ success: true, barcodeToProductId, stocks }, { headers: CORS_HEADERS });
  } catch (error) {
    if (error instanceof GetirWarehouseApiError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode || 500, headers: CORS_HEADERS }
      );
    }
    console.error("[Expiry Stock] Beklenmeyen hata:", error);
    return NextResponse.json(
      { success: false, error: "SKT stokları alınırken beklenmeyen bir hata oluştu." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

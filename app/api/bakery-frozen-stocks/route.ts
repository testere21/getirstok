import { NextResponse } from "next/server";
import {
  GetirWarehouseApiError,
  getWarehouseFrozenStocksByBarcodes,
} from "@/app/lib/getirWarehouseApiService";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** Fırın barkodları için warehouse donuk stok */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { barcodes?: unknown };
    const barcodes = Array.isArray(body?.barcodes)
      ? body.barcodes.filter((b): b is string => typeof b === "string")
      : [];

    if (barcodes.length === 0) {
      return NextResponse.json(
        { stocks: {}, success: true },
        { status: 200, headers: CORS_HEADERS }
      );
    }

    if (barcodes.length > 50) {
      return NextResponse.json(
        { stocks: {}, error: "En fazla 50 barkod gönderilebilir.", success: false },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const stocks = await getWarehouseFrozenStocksByBarcodes(barcodes);
    return NextResponse.json(
      { stocks, success: true },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    if (error instanceof GetirWarehouseApiError) {
      const statusCode = error.statusCode || 500;
      console.error(
        "[Bakery frozen stock] Warehouse error:",
        error.message,
        error.code
      );
      return NextResponse.json(
        {
          stocks: {},
          error: error.message,
          code: error.code,
          success: false,
        },
        { status: statusCode, headers: CORS_HEADERS }
      );
    }

    console.error("[Bakery frozen stock] Unexpected error:", error);
    return NextResponse.json(
      {
        stocks: {},
        error: error instanceof Error ? error.message : "Bilinmeyen hata oluştu",
        success: false,
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

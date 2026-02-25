import { NextResponse } from "next/server";
import {
  getGetirSupplierReturnDate,
  GetirWarehouseApiError,
} from "@/app/lib/getirWarehouseApiService";

/** CORS header'ları */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** Preflight request handler */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** Getir tedarikçi iade tarihi endpoint'i - Barkod'a göre tedarikçi iade tarihini (gün sayısı) döndürür */
export async function GET(request: Request) {
  console.log("[Getir Supplier Return Date API] GET request received");
  try {
    // Query parameter'dan barcode al
    const { searchParams } = new URL(request.url);
    const barcode = searchParams.get("barcode");

    // Barcode validasyonu
    if (!barcode || barcode.trim().length === 0) {
      return NextResponse.json(
        {
          days: null,
          error: "Barkod parametresi gerekli",
          success: false,
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const trimmedBarcode = barcode.trim();
    console.log(
      "[Getir Supplier Return Date API] Fetching supplier return date for barcode:",
      trimmedBarcode
    );
    
    // Getir Warehouse API'den tedarikçi iade tarihini (veya cache'ten) çek
    const days = await getGetirSupplierReturnDate(trimmedBarcode);
    
    console.log("[Getir Supplier Return Date API] Supplier return date result:", days, "days");

    // Başarılı response
    return NextResponse.json(
      {
        days,
        success: true,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    // GetirWarehouseApiError ise detaylı hata mesajı döndür
    if (error instanceof GetirWarehouseApiError) {
      const statusCode = error.statusCode || 500;
      console.error("[Getir Supplier Return Date API] GetirWarehouseApiError:", error.message, "Code:", error.code, "Status:", statusCode);
      
      return NextResponse.json(
        {
          days: null,
          error: error.message,
          code: error.code,
          success: false,
        },
        { status: statusCode, headers: CORS_HEADERS }
      );
    }

    // Beklenmeyen hatalar
    console.error("[Getir Supplier Return Date API] Beklenmeyen hata:", error);

    return NextResponse.json(
      {
        days: null,
        error: error instanceof Error ? error.message : "Bilinmeyen hata oluştu",
        success: false,
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}


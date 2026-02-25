import { NextResponse } from "next/server";
import { getCachedSupplierReturnDays } from "@/app/lib/supplierReturnCacheService";

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

/** Getir tedarikçi iade tarihi cache endpoint'i - Sadece cache'i kontrol eder, Getir API'ye gitmez */
export async function GET(request: Request) {
  console.log("[Getir Supplier Return Date Cache API] GET request received");
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
          fromCache: false,
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    console.log("[Getir Supplier Return Date Cache API] Checking cache for barcode:", barcode.trim());
    
    // Cache'ten tedarikçi iade tarihini çek (Getir API'ye gitmeden)
    const days = await getCachedSupplierReturnDays(barcode.trim());
    
    console.log("[Getir Supplier Return Date Cache API] Cache result:", days !== null ? `${days} days (from cache)` : "not found");

    // Başarılı response (cache'te varsa days, yoksa null)
    return NextResponse.json(
      {
        days,
        success: true,
        fromCache: true,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    // Beklenmeyen hatalar
    console.error("[Getir Supplier Return Date Cache API] Beklenmeyen hata:", error);

    return NextResponse.json(
      {
        days: null,
        error: error instanceof Error ? error.message : "Bilinmeyen hata oluştu",
        success: false,
        fromCache: false,
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}


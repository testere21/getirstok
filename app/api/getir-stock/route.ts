import { NextResponse } from "next/server";
import { getGetirStock, GetirApiError } from "@/app/lib/getirApiService";

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

/** Getir stok bilgisi endpoint'i - Barkod'a göre stok miktarını döndürür */
export async function GET(request: Request) {
  console.log("[Getir Stock API] GET request received");
  try {
    // Query parameter'dan barcode al
    const { searchParams } = new URL(request.url);
    const barcode = searchParams.get("barcode");

    // Barcode validasyonu
    if (!barcode || barcode.trim().length === 0) {
      return NextResponse.json(
        {
          stock: null,
          error: "Barkod parametresi gerekli",
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    console.log("[Getir Stock API] Fetching stock for barcode:", barcode.trim());
    
    // Getir API'den stok bilgisini çek
    const stock = await getGetirStock(barcode.trim());
    
    console.log("[Getir Stock API] Stock result:", stock);

    // Başarılı response
    return NextResponse.json(
      {
        stock,
        success: true,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    // GetirApiError ise detaylı hata mesajı döndür
    if (error instanceof GetirApiError) {
      const statusCode = error.statusCode || 500;
      console.error("[Getir Stock API] GetirApiError:", error.message, "Code:", error.code, "Status:", statusCode);
      
      return NextResponse.json(
        {
          stock: null,
          error: error.message,
          code: error.code,
        },
        { status: statusCode, headers: CORS_HEADERS }
      );
    }

    // Beklenmeyen hatalar
    console.error("[Getir Stock API] Beklenmeyen hata:", error);

    return NextResponse.json(
      {
        stock: null,
        error: error instanceof Error ? error.message : "Bilinmeyen hata oluştu",
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}


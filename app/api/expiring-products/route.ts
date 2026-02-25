import { NextResponse } from "next/server";
import {
  addExpiringProduct,
  getExpiringProducts,
  getExpiringProductsByRemovalDate,
  type AddExpiringProductParams,
} from "@/app/lib/expiringProductService";

/** CORS header'ları */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** Preflight request handler */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** Yaklaşan SKT kayıtlarını listeleme endpoint'i */
export async function GET(request: Request) {
  console.log("[Expiring Products API] GET request received");
  try {
    const { searchParams } = new URL(request.url);
    const removalDate = searchParams.get("removalDate");
    const barcode = searchParams.get("barcode");

    // Eğer removalDate query param'ı varsa, o tarihte çıkılması gereken ürünleri getir
    if (removalDate) {
      console.log("[Expiring Products API] Fetching products by removal date:", removalDate);
      const products = await getExpiringProductsByRemovalDate(removalDate);
      return NextResponse.json(
        {
          products,
          success: true,
        },
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // Eğer barcode query param'ı varsa, o barkod için kayıt kontrolü yap
    if (barcode) {
      console.log("[Expiring Products API] Fetching product by barcode:", barcode);
      const { getExpiringProductByBarcode } = await import("@/app/lib/expiringProductService");
      const product = await getExpiringProductByBarcode(barcode);
      return NextResponse.json(
        {
          product,
          success: true,
        },
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // Hiçbir query param yoksa tüm kayıtları getir
    console.log("[Expiring Products API] Fetching all products");
    const products = await getExpiringProducts();
    return NextResponse.json(
      {
        products,
        success: true,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("[Expiring Products API] GET error:", error);
    return NextResponse.json(
      {
        products: [],
        error: error instanceof Error ? error.message : "Bilinmeyen hata oluştu",
        success: false,
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

/** Yeni yaklaşan SKT kaydı ekleme endpoint'i */
export async function POST(request: Request) {
  console.log("[Expiring Products API] POST request received");
  try {
    const body = await request.json();
    const { barcode, productName, expiryDate, removalDate } = body;

    // Validasyon
    if (!barcode || typeof barcode !== "string" || barcode.trim().length === 0) {
      return NextResponse.json(
        {
          id: null,
          error: "Barkod gerekli",
          success: false,
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!productName || typeof productName !== "string" || productName.trim().length === 0) {
      return NextResponse.json(
        {
          id: null,
          error: "Ürün adı gerekli",
          success: false,
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!expiryDate || typeof expiryDate !== "string" || expiryDate.trim().length === 0) {
      return NextResponse.json(
        {
          id: null,
          error: "SKT tarihi gerekli",
          success: false,
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Tarih formatı kontrolü (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(expiryDate.trim())) {
      return NextResponse.json(
        {
          id: null,
          error: "SKT tarihi formatı geçersiz. YYYY-MM-DD formatında olmalıdır.",
          success: false,
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!removalDate || typeof removalDate !== "string" || removalDate.trim().length === 0) {
      return NextResponse.json(
        {
          id: null,
          error: "Çıkılması gereken tarih gerekli",
          success: false,
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!dateRegex.test(removalDate.trim())) {
      return NextResponse.json(
        {
          id: null,
          error: "Çıkılması gereken tarih formatı geçersiz. YYYY-MM-DD formatında olmalıdır.",
          success: false,
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const params: AddExpiringProductParams = {
      barcode: barcode.trim(),
      productName: productName.trim(),
      expiryDate: expiryDate.trim(),
      removalDate: removalDate.trim(),
    };

    console.log("[Expiring Products API] Adding new product:", params);
    const id = await addExpiringProduct(params);

    return NextResponse.json(
      {
        id,
        success: true,
      },
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("[Expiring Products API] POST error:", error);
    return NextResponse.json(
      {
        id: null,
        error: error instanceof Error ? error.message : "Bilinmeyen hata oluştu",
        success: false,
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}


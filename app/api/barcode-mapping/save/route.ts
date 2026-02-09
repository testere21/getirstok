/**
 * Barkod -> Ürün ID mapping kaydetme endpoint'i
 * POST /api/barcode-mapping/save
 * Body: { barcode: string, productId: string, productName?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { saveBarcodeMapping } from "@/app/lib/barcodeProductMappingService";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { barcode, productId, productName } = body;

    if (!barcode || !productId) {
      return NextResponse.json(
        { error: "barcode ve productId parametreleri gerekli" },
        {
          status: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    console.log(
      "[Barcode Mapping API] Saving mapping:",
      barcode,
      "->",
      productId
    );

    await saveBarcodeMapping(barcode, productId, productName);

    return NextResponse.json(
      { success: true, message: "Mapping kaydedildi" },
      {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("[Barcode Mapping API] Error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Bilinmeyen hata oluştu",
      },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}


/**
 * Toplu barkod -> ürün ID mapping kaydetme endpoint'i
 * POST /api/barcode-mapping/batch-save
 * Body: { mappings: [{ barcode: string, productId: string, productName?: string }] }
 */

import { NextRequest, NextResponse } from "next/server";
import { saveBarcodeMappingsBatch } from "@/app/lib/barcodeProductMappingService";

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
    const { mappings } = body;

    if (!Array.isArray(mappings) || mappings.length === 0) {
      return NextResponse.json(
        { error: "mappings array'i gerekli ve boş olamaz" },
        {
          status: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    console.log(
      `[Barcode Mapping API] Saving ${mappings.length} mappings in batch...`
    );

    await saveBarcodeMappingsBatch(mappings);

    return NextResponse.json(
      {
        success: true,
        message: `${mappings.length} mapping kaydedildi`,
        count: mappings.length,
      },
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


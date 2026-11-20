/**
 * Getir API - Ürün ID'si ile stok sorgulama endpoint'i (TEST İÇİN)
 * GET /api/getir-stock-by-product-id?productId=...
 */

import { NextRequest, NextResponse } from "next/server";
import { getGetirStockByProductId, GetirApiError } from "@/app/lib/getirApiService";
import { resolvePanelWarehouseId } from "@/app/lib/franchiseWarehouses";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const productId = searchParams.get("productId");

    if (!productId) {
      return NextResponse.json(
        { error: "productId parametresi gerekli" },
        {
          status: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    console.log("[Getir Stock API] GET request received for product ID:", productId);

    // Depo verilmezse Soğukkuyu (eski istemciler); tanınmayan depo reddedilir
    const warehouseId = resolvePanelWarehouseId(searchParams.get("warehouseId"));
    if (!warehouseId) {
      return NextResponse.json(
        { error: "Geçersiz depo." },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const stock = await getGetirStockByProductId(productId, warehouseId);

    return NextResponse.json(
      { stock, productId },
      {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("[Getir Stock API] Error:", error);

    if (error instanceof GetirApiError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          statusCode: error.statusCode,
        },
        {
          status: error.statusCode || 500,
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    return NextResponse.json(
      { error: "Bilinmeyen hata oluştu" },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}


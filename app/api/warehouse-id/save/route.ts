import { NextResponse } from "next/server";
import {
  isValidWarehouseObjectId,
  saveGetirWarehouseId,
} from "@/app/lib/getirTokenService";
import { SOGUKKUYU_WAREHOUSE_ID } from "@/app/lib/franchiseWarehouses";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** Chrome eklentisinin yakaladığı depo ID'sini kaydeder */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const warehouseId =
      typeof body?.warehouseId === "string" ? body.warehouseId.trim() : "";

    if (!warehouseId) {
      return NextResponse.json(
        { error: "warehouseId gerekli" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!isValidWarehouseObjectId(warehouseId)) {
      return NextResponse.json(
        { error: "Geçersiz depo ID formatı" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Depo kimliği artık token ile birlikte gelir ve her depo için ayrı tutulur; bu uç yalnızca
    // eski eklentilerin çağrısı bozulmasın diye durur. Eski tek kayıt Soğukkuyu'ya aittir, bu yüzden
    // başka bir deponun (Bostanlı) kimliği onu ezmesin diye yazılmaz.
    if (warehouseId !== SOGUKKUYU_WAREHOUSE_ID) {
      return NextResponse.json(
        {
          success: true,
          message: "Depo ID ayrı kaydedilmiyor (token ile birlikte gönderilir)",
          warehouseId,
          saved: false,
        },
        { status: 200, headers: CORS_HEADERS }
      );
    }

    await saveGetirWarehouseId(warehouseId);

    return NextResponse.json(
      {
        success: true,
        message: "Depo ID kaydedildi",
        warehouseId,
        saved: true,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("[Warehouse ID Save API] Hata:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Depo ID kaydedilemedi",
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

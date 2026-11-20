import { NextResponse } from "next/server";
import {
  approveInventoryCheck,
  isValidInventoryCheckId,
} from "@/app/lib/getirInventoryCheckService";
import { GetirWarehouseApiError } from "@/app/lib/getirWarehouseApiService";
import { requireExplicitWarehouseId } from "@/app/lib/franchiseWarehouses";

/**
 * Kasa/Palet sekmesinden açılan sayımı depo panelinde onaylar.
 * Sayım açma route'u gibi CORS başlığı yok: başka bir site tarayıcı
 * üzerinden bu isteği tetikleyemesin.
 */
export async function POST(request: Request) {
  let body: { inventoryCheckId?: unknown; warehouseId?: unknown };
  try {
    body = (await request.json()) as { inventoryCheckId?: unknown; warehouseId?: unknown };
  } catch {
    return NextResponse.json(
      { success: false, error: "Geçersiz istek gövdesi." },
      { status: 400 }
    );
  }

  // Depo AÇIKÇA verilmeli: eksik/tanınmayan depo reddedilir, sessizce Soğukkuyu'ya düşmez
  const warehouseId = requireExplicitWarehouseId(body.warehouseId);
  if (!warehouseId) {
    return NextResponse.json(
      { success: false, error: "Depo belirtilmedi veya geçersiz." },
      { status: 400 }
    );
  }

  const inventoryCheckId =
    typeof body.inventoryCheckId === "string" ? body.inventoryCheckId.trim() : "";
  if (!isValidInventoryCheckId(inventoryCheckId)) {
    return NextResponse.json(
      { success: false, error: "Geçersiz sayım numarası." },
      { status: 400 }
    );
  }

  try {
    await approveInventoryCheck(inventoryCheckId, warehouseId);
    console.log("[Kasa/Palet Sayım] Sayım onaylandı:", inventoryCheckId);
    return NextResponse.json({ success: true, inventoryCheckId });
  } catch (error) {
    if (error instanceof GetirWarehouseApiError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode || 500 }
      );
    }
    console.error("[Kasa/Palet Sayım] Onay sırasında beklenmeyen hata:", error);
    return NextResponse.json(
      { success: false, error: "Sayım onaylanırken beklenmeyen bir hata oluştu." },
      { status: 500 }
    );
  }
}

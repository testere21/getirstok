import { NextResponse } from "next/server";
import { createInventoryCheck } from "@/app/lib/getirInventoryCheckService";
import { GetirWarehouseApiError } from "@/app/lib/getirWarehouseApiService";
import { KASA_PALET_PRODUCTS } from "@/app/lib/kasaPaletProducts";
import {
  buildInventoryCheckMessage,
  sendTelegramMessage,
} from "@/app/lib/telegramService";

const KASA_PALET_BY_ID = new Map(KASA_PALET_PRODUCTS.map((p) => [p.productId, p]));

/**
 * Seçilen kasa/palet ürünleriyle depo panelinde tek bir kısmi sayım açar.
 * Gerçek sayım açtığı için CORS başlığı yok: başka bir site tarayıcı
 * üzerinden bu isteği tetikleyemesin.
 */
export async function POST(request: Request) {
  let body: { productIds?: unknown };
  try {
    body = (await request.json()) as { productIds?: unknown };
  } catch {
    return NextResponse.json(
      { success: false, error: "Geçersiz istek gövdesi." },
      { status: 400 }
    );
  }

  const raw = Array.isArray(body.productIds) ? body.productIds : [];
  const productIds = [
    ...new Set(
      raw.filter((id): id is string => typeof id === "string").map((id) => id.trim())
    ),
  ].filter(Boolean);

  if (productIds.length === 0) {
    return NextResponse.json(
      { success: false, error: "Sayım için en az bir ürün seçin." },
      { status: 400 }
    );
  }

  const unknown = productIds.filter((id) => !KASA_PALET_BY_ID.has(id));
  if (unknown.length > 0) {
    return NextResponse.json(
      {
        success: false,
        error: "Sadece kasa/palet listesindeki ürünlerle sayım açılabilir.",
        unknownProductIds: unknown,
      },
      { status: 400 }
    );
  }

  const products = productIds.map((id) => {
    const p = KASA_PALET_BY_ID.get(id)!;
    return { productId: p.productId, barcode: p.barcode, name: p.name };
  });

  try {
    const inventoryCheckId = await createInventoryCheck(productIds);
    console.log(
      "[Kasa/Palet Sayım] Sayım açıldı:",
      inventoryCheckId,
      products.map((p) => p.name).join(", ")
    );
    // sendTelegramMessage hata fırlatmaz; Telegram sorunu sayım sonucunu değiştirmez.
    await sendTelegramMessage(
      buildInventoryCheckMessage({
        inventoryCheckId,
        productNames: products.map((p) => p.name),
      })
    );
    return NextResponse.json({ success: true, inventoryCheckId, products });
  } catch (error) {
    if (error instanceof GetirWarehouseApiError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode || 500 }
      );
    }
    console.error("[Kasa/Palet Sayım] Beklenmeyen hata:", error);
    return NextResponse.json(
      { success: false, error: "Sayım açılırken beklenmeyen bir hata oluştu." },
      { status: 500 }
    );
  }
}

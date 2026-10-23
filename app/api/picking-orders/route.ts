import { NextResponse } from "next/server";
import { sanitizePickingOrder } from "@/app/lib/pickingOrders";
import { savePickingOrder } from "@/app/lib/pickingOrderStore";

/** Chrome eklentisi çağırıyor (depo panelindeki sipariş detayından "Toplama modu") */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** `{ orderId, locations, items: [{ name, quantity, imageUrl, barcode }] }` — aynı sipariş güncellenir */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const order = sanitizePickingOrder(body);
  if (!order) {
    return NextResponse.json(
      { success: false, error: "Sipariş kimliği ya da ürün listesi okunamadı." },
      { status: 400, headers: CORS_HEADERS }
    );
  }
  try {
    await savePickingOrder(order);
    return NextResponse.json({ success: true, orderId: order.orderId, items: order.items.length }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("[Toplama modu] Kaydedilemedi:", error);
    return NextResponse.json(
      { success: false, error: "Toplama listesi kaydedilemedi." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

import { NextResponse } from "next/server";
import {
  buildBakeryBakeAlertMessage,
  sendTelegramMessage,
  type BakeryBakeAlertItem,
} from "@/app/lib/telegramService";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      items?: unknown;
      slotLabel?: unknown;
    };
    const raw = Array.isArray(body.items) ? body.items : [];
    const items: BakeryBakeAlertItem[] = [];
    for (const row of raw.slice(0, 40)) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const name = typeof r.name === "string" ? r.name.trim() : "";
      const barcode = typeof r.barcode === "string" ? r.barcode.trim() : "";
      const bakeQty =
        typeof r.bakeQty === "number" && Number.isFinite(r.bakeQty)
          ? Math.max(0, Math.floor(r.bakeQty))
          : 0;
      if (!name || bakeQty <= 0) continue;
      items.push({ name, barcode, bakeQty });
    }
    if (items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Pişirilecek ürün yok." },
        { status: 400, headers: CORS_HEADERS }
      );
    }
    const slotLabel =
      typeof body.slotLabel === "string" ? body.slotLabel.trim() : null;
    await sendTelegramMessage(buildBakeryBakeAlertMessage(items, slotLabel));
    return NextResponse.json({ success: true }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("[telegram bakery-bake-alert]", error);
    return NextResponse.json(
      { success: false, error: "Telegram bildirimi gönderilemedi." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

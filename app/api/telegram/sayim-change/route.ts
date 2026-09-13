import { NextResponse } from "next/server";
import {
  buildSayimChangeMessage,
  sendTelegramMessage,
  type SayimChangeTelegramSide,
} from "@/app/lib/telegramService";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** Gövdeden tek bir tarafı (fazla/eksik) doğrulayıp çıkarır */
function parseSide(raw: unknown): SayimChangeTelegramSide | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  const barcode = typeof r.barcode === "string" ? r.barcode.trim() : "";
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const quantity = num(r.quantity);
  const unitPrice = num(r.unitPrice);
  const total = num(r.total);
  if (!name || quantity === null || unitPrice === null || total === null) {
    return null;
  }
  return { name, barcode, quantity, unitPrice, total };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      category?: unknown;
      extra?: unknown;
      missing?: unknown;
      net?: unknown;
      warning?: unknown;
    };

    const extra = parseSide(body.extra);
    const missing = parseSide(body.missing);
    const net =
      typeof body.net === "number" && Number.isFinite(body.net) ? body.net : null;

    if (!extra || !missing || net === null) {
      return NextResponse.json(
        { success: false, error: "extra, missing ve net alanları zorunludur." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    await sendTelegramMessage(
      buildSayimChangeMessage({
        category: typeof body.category === "string" ? body.category : "",
        extra,
        missing,
        net,
        warning: typeof body.warning === "string" ? body.warning : undefined,
      })
    );

    return NextResponse.json({ success: true }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("[telegram sayim-change]", error);
    return NextResponse.json(
      { success: false, error: "Telegram bildirimi gönderilemedi." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

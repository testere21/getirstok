import { NextResponse } from "next/server";
import {
  isValidOverrideBarcode,
  readOrderBarcodeOverrides,
  setOrderBarcodeOverride,
} from "@/app/lib/orderBarcodeOverrideService";

/** Chrome eklentisi çağırıyor (token kaydetme uçlarıyla aynı) */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** Elle düzeltilmiş barkodların tamamı: `{ overrides: { [nameKey]: { name, barcode, updatedAt } } }` */
export async function GET() {
  try {
    const overrides = await readOrderBarcodeOverrides();
    return NextResponse.json({ success: true, overrides }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("[Barkod düzeltme] Okunamadı:", error);
    return NextResponse.json(
      { success: false, error: "Barkod düzeltmeleri okunamadı." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

/** `{ name, barcode }` kaydeder; `barcode: null` düzeltmeyi siler */
export async function POST(request: Request) {
  let body: { name?: unknown; barcode?: unknown };
  try {
    body = (await request.json()) as { name?: unknown; barcode?: unknown };
  } catch {
    return NextResponse.json({ success: false, error: "Geçersiz istek gövdesi." }, { status: 400, headers: CORS_HEADERS });
  }

  const name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim() : "";
  if (name.length < 2 || name.length > 200) {
    return NextResponse.json({ success: false, error: "Ürün adı geçersiz." }, { status: 400, headers: CORS_HEADERS });
  }
  const barcode = body.barcode === null ? null : typeof body.barcode === "string" ? body.barcode.trim() : undefined;
  if (barcode === undefined || (barcode !== null && !isValidOverrideBarcode(barcode))) {
    return NextResponse.json(
      { success: false, error: "Barkod 4–20 haneli rakam olmalı." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const key = await setOrderBarcodeOverride(name, barcode);
    console.log("[Barkod düzeltme]", barcode == null ? "silindi:" : "kaydedildi:", name, barcode ?? "");
    return NextResponse.json({ success: true, key }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("[Barkod düzeltme] Kaydedilemedi:", error);
    return NextResponse.json(
      { success: false, error: "Barkod düzeltmesi kaydedilemedi." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

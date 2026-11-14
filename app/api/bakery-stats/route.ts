import { NextResponse } from "next/server";
import {
  addDaysYmd,
  BAKERY_STATS_KEEP_DAYS,
  isBakeryStatsWarehouseId,
  parseBakeryStatsPush,
  validateBakeryStatsRange,
} from "@/app/lib/bakeryStats";
import { loadBakeryStatsDays, mergeBakeryStatsDays, pruneBakeryStatsDays } from "@/app/lib/bakeryStatsStore";

/** Chrome eklentisi çağırıyor (depo panelindeki Pişirme Önerileri istatistikleri) */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** `?warehouseId=…&from=YYYY-MM-DD&to=YYYY-MM-DD` → `{ days: { ymd: { h, ih, slots } } }` */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const warehouseId = url.searchParams.get("warehouseId")?.toLowerCase() ?? "";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!isBakeryStatsWarehouseId(warehouseId)) {
    return NextResponse.json({ success: false, error: "Depo kimliği geçersiz." }, { status: 400, headers: CORS_HEADERS });
  }
  const rangeError = validateBakeryStatsRange(from, to);
  if (rangeError) {
    return NextResponse.json({ success: false, error: rangeError }, { status: 400, headers: CORS_HEADERS });
  }
  try {
    const days = await loadBakeryStatsDays(warehouseId, from as string, to as string);
    return NextResponse.json({ success: true, days }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("[Pişirme istatistikleri] Okunamadı:", error);
    return NextResponse.json({ success: false, error: "İstatistikler okunamadı." }, { status: 500, headers: CORS_HEADERS });
  }
}

/** `{ warehouseId, days: { ymd: { h, ih, slots } } }` — mevcut kayıtla dakika bazında birleşir */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const push = parseBakeryStatsPush(body);
  if (!push) {
    return NextResponse.json({ success: false, error: "Kayıt okunamadı." }, { status: 400, headers: CORS_HEADERS });
  }
  try {
    await mergeBakeryStatsDays(push.warehouseId, push.days);
    // Ara sıra eski günleri temizle (her yazmada sorgu atmamak için)
    if (Math.random() < 0.02) {
      const today = new Date().toISOString().slice(0, 10);
      void pruneBakeryStatsDays(push.warehouseId, addDaysYmd(today, -BAKERY_STATS_KEEP_DAYS)).catch(() => {});
    }
    return NextResponse.json({ success: true, days: Object.keys(push.days).length }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("[Pişirme istatistikleri] Kaydedilemedi:", error);
    return NextResponse.json({ success: false, error: "İstatistik kaydedilemedi." }, { status: 500, headers: CORS_HEADERS });
  }
}

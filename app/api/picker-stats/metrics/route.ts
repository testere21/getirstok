import { NextResponse } from "next/server";
import { DpsReportApiError } from "@/app/lib/getirDpsReportService";
import { isYmd } from "@/app/lib/pickerStatsPeriod";
import { syncPickerMetrics } from "@/app/lib/pickerStatsSync";

export const runtime = "nodejs";

/**
 * Seçilen aralığın eksik günlük SKU / problemli kayıtlarını ve yıldız ortalamasını Getir'den
 * tamamlar. Body: `{ from, to, refreshSince? }` — `refreshSince` sadece "Güncelle"de gönderilir.
 * Panel `remaining` 0 olana kadar tekrar çağırır. CORS başlığı yok.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { from?: unknown; to?: unknown; refreshSince?: unknown }
    | null;
  const from = typeof body?.from === "string" ? body.from : "";
  const to = typeof body?.to === "string" ? body.to : "";
  if (!isYmd(from) || !isYmd(to)) {
    return NextResponse.json(
      { success: false, error: "Tarih YYYY-MM-DD biçiminde olmalı." },
      { status: 400 }
    );
  }
  const refreshSince =
    typeof body?.refreshSince === "string" && !Number.isNaN(Date.parse(body.refreshSince))
      ? body.refreshSince
      : null;

  try {
    const result = await syncPickerMetrics({ from, to }, refreshSince);
    if (result.fetchedDays.length > 0 || result.ratingFetched) {
      console.log(
        "[Toplayıcı metrikleri] Getir'den çekildi:",
        result.fetchedDays.join(", ") || "-",
        result.ratingFetched ? `+ yıldız ${from}–${to}` : "",
        `kalan ${result.remaining}`
      );
    }
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof DpsReportApiError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode || 500 }
      );
    }
    console.error("[Toplayıcı metrikleri] Beklenmeyen hata:", error);
    return NextResponse.json(
      { success: false, error: "Toplayıcı metrikleri alınırken beklenmeyen bir hata oluştu." },
      { status: 500 }
    );
  }
}

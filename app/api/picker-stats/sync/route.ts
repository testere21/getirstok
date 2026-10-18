import { NextResponse } from "next/server";
import { DpsReportParseError } from "@/app/lib/dpsReportParse";
import { DpsReportApiError } from "@/app/lib/getirDpsReportService";
import { syncNextDpsReport } from "@/app/lib/pickerStatsSync";

export const runtime = "nodejs";

/**
 * Okunmamış bir DPS raporunu işler. Panel `remaining` 0 olana kadar tekrar çağırır.
 * CORS başlığı yok: sadece kendi panelimiz tetikleyebilsin.
 */
export async function POST() {
  try {
    const result = await syncNextDpsReport();
    if (result.report) {
      console.log(
        "[Toplayıcı Performansı] Rapor işlendi:",
        result.report.id,
        `${result.report.kept}/${result.report.orders} sipariş`,
        `${result.report.ordersWritten} yazıldı`,
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
    if (error instanceof DpsReportParseError) {
      return NextResponse.json(
        { success: false, error: error.message, code: "PARSE" },
        { status: 422 }
      );
    }
    console.error("[Toplayıcı Performansı] Senkron hatası:", error);
    return NextResponse.json(
      { success: false, error: "Raporlar okunurken beklenmeyen bir hata oluştu." },
      { status: 500 }
    );
  }
}

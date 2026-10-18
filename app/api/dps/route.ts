import { NextResponse } from "next/server";
import { DpsParseError } from "@/app/lib/dpsParse";
import { dpsRetentionCutoff, validateDpsRange } from "@/app/lib/dpsRange";
import { deleteDpsScoresBefore, readDpsScore, writeDpsScore } from "@/app/lib/dpsStore";
import { DpsApiError, fetchDpsCriteria } from "@/app/lib/getirDpsService";
import { istanbulTodayYmd } from "@/app/lib/pickerStatsPeriod";

export const runtime = "nodejs";

/**
 * Soğukkuyu DPS puanları. Kayıt varsa kayıttan, yoksa Getir'den çekip kaydeder.
 * `?from=YYYY-MM-DD&to=YYYY-MM-DD[&rank=1]`. CORS başlığı yok.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const singleDay = from === to;
  // Sıralama sadece tek gün için anlamlı; tek günde Getir'e her zaman sıralamalı gidilir
  const wantRank = singleDay && url.searchParams.get("rank") === "1";

  const today = istanbulTodayYmd();
  const invalid = validateDpsRange(from, to, today);
  if (invalid) {
    return NextResponse.json({ success: false, error: invalid }, { status: 400 });
  }

  try {
    const cached = await readDpsScore(from, to);
    if (cached && (!wantRank || cached.ranked)) {
      return NextResponse.json({ success: true, empty: false, source: "cache", score: cached });
    }

    const result = await fetchDpsCriteria({ from, to, ranked: singleDay });
    if (result.empty) {
      return NextResponse.json({ success: true, empty: true, source: null, score: null });
    }

    const score = { ...result.snapshot, from, to, ranked: singleDay, fetchedAt: new Date().toISOString() };
    await writeDpsScore(score);
    console.log("[DPS] Getir'den çekildi ve kaydedildi:", from, to, singleDay ? `sıra ${score.rank}` : "");

    // Yeni kayıt yazılırken 5 aydan eski kayıtlar temizlenir; hata olursa cevap bozulmasın
    try {
      const removed = await deleteDpsScoresBefore(dpsRetentionCutoff(today));
      if (removed > 0) console.log("[DPS] 5 aydan eski kayıt silindi:", removed);
    } catch (cleanupError) {
      console.warn("[DPS] Eski kayıt temizliği başarısız:", cleanupError);
    }

    return NextResponse.json({ success: true, empty: false, source: "getir", score });
  } catch (error) {
    if (error instanceof DpsApiError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode || 500 }
      );
    }
    if (error instanceof DpsParseError) {
      return NextResponse.json({ success: false, error: error.message, code: "PARSE" }, { status: 502 });
    }
    console.error("[DPS] Beklenmeyen hata:", error);
    return NextResponse.json(
      { success: false, error: "DPS puanları alınırken beklenmeyen bir hata oluştu." },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { saveGetirToken } from "@/app/lib/getirTokenService";

/** CORS header'ları - Chrome eklentisi ve diğer origin'lerden gelen istekler için */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // Chrome extension ve diğer origin'ler için
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** Preflight request handler */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** Token kaydetme endpoint'i - Chrome eklentisinden gelen token'ı Firestore'a kaydeder */
export async function POST(request: Request) {
  try {
    // Request body'yi parse et
    const body = await request.json();
    const { token, type } = body;

    // Token validasyonu
    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Token gerekli ve string olmalıdır" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Type validasyonu (opsiyonel, varsayılan: "franchise")
    const tokenType = type === "warehouse" ? "warehouse" : "franchise";

    // Token boş değil mi kontrol et
    const trimmedToken = token.trim();
    if (trimmedToken.length === 0) {
      return NextResponse.json(
        { error: "Token boş olamaz" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Token formatını kontrol et (JWT formatı: eyJ ile başlamalı)
    if (!trimmedToken.startsWith("eyJ")) {
      return NextResponse.json(
        { error: "Geçersiz token formatı" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Token uzunluğunu kontrol et (min 50 karakter - güvenlik için)
    if (trimmedToken.length < 50) {
      return NextResponse.json(
        { error: "Token çok kısa" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Token'ı Firestore'a kaydet (type bilgisi ile)
    await saveGetirToken(trimmedToken, tokenType);

    // Başarılı response (token'ın ilk 10 karakterini logla, tam token'ı loglama)
    const panelName = tokenType === "franchise" ? "Bayi Paneli" : "Depo Paneli";
    console.log(
      `[Token Save API] ${panelName} token başarıyla kaydedildi: ${trimmedToken.substring(0, 10)}...`
    );

    return NextResponse.json(
      {
        success: true,
        message: `${panelName} token başarıyla kaydedildi`,
        type: tokenType,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("[Token Save API] Hata:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Token kaydedilemedi",
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}


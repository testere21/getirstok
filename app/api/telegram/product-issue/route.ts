import { NextResponse } from "next/server";
import { buildProductIssueMessage, sendTelegramMessage } from "@/app/lib/telegramService";
import { createProductIssueReport } from "@/app/lib/productIssueService";
import type { ProductIssueType } from "@/app/lib/types";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

interface RequestBody {
  type?: ProductIssueType;
  barcode?: string;
  productName?: string;
  note?: string;
  source?: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;

    const { type, barcode, productName, note, source } = body;

    // Temel validasyon
    if (!type || (type !== "product_missing" && type !== "stock_missing")) {
      return NextResponse.json(
        { success: false, error: "Geçersiz bildirim tipi." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!barcode || typeof barcode !== "string" || barcode.trim().length < 6) {
      return NextResponse.json(
        { success: false, error: "Geçerli bir barkod zorunludur." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (note && note.length > 250) {
      return NextResponse.json(
        { success: false, error: "Not en fazla 250 karakter olabilir." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    let telegramSent = false;
    let telegramError: string | undefined;

    try {
      const message = buildProductIssueMessage({
        type,
        barcode: barcode.trim(),
        productName: productName?.trim(),
        note: note?.trim(),
        source: source?.trim(),
      });

      await sendTelegramMessage(message);
      telegramSent = true;
    } catch (err) {
      telegramSent = false;
      telegramError =
        err instanceof Error ? err.message : "Telegram mesajı gönderilemedi.";
    }

    // Firestore'a kayıt et (telegram başarılı olsun/olmasın)
    await createProductIssueReport({
      type,
      barcode: barcode.trim(),
      productName: productName?.trim(),
      note: note?.trim(),
      source: source?.trim(),
      telegramSent,
      telegramError,
    });

    return NextResponse.json(
      { success: true, telegramSent },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("[product-issue] POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Beklenmeyen bir hata oluştu.",
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}



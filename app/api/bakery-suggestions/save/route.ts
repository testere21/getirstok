import { NextResponse } from "next/server";
import { saveBakeryBakeSuggestions, parseBakeryBakeSuggestionItems } from "@/app/lib/bakeryBakeSuggestionService";

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
    const body = await request.json();
    const items = parseBakeryBakeSuggestionItems(body?.items);
    if (items.length === 0) {
      return NextResponse.json(
        { error: "Geçerli pişirme önerisi yok" },
        { status: 400, headers: CORS_HEADERS }
      );
    }
    await saveBakeryBakeSuggestions(items);
    return NextResponse.json(
      { success: true, count: items.length },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("[Bakery suggestions save]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Kaydedilemedi",
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

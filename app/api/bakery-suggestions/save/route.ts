import { NextResponse } from "next/server";
import {
  BAKE_SLOT_KEYS,
  type BakeryBakeSuggestionItem,
  type BakeSlotKey,
  type BakeSlotMap,
} from "@/app/lib/bakeryBakeSuggestions";
import { saveBakeryBakeSuggestions } from "@/app/lib/bakeryBakeSuggestionService";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function parseItems(raw: unknown): BakeryBakeSuggestionItem[] {
  if (!Array.isArray(raw)) return [];
  const out: BakeryBakeSuggestionItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const name = String((row as { name?: string }).name || "").trim();
    if (name.length < 3) continue;
    const slotsIn = (row as { slots?: BakeSlotMap }).slots || {};
    const slots: BakeSlotMap = {};
    for (const key of BAKE_SLOT_KEYS) {
      const n = Number((slotsIn as Record<string, unknown>)[key]);
      if (Number.isFinite(n) && n >= 0) slots[key as BakeSlotKey] = Math.round(n);
    }
    const productId = String(
      (row as { productId?: string }).productId || ""
    ).trim();
    const item: BakeryBakeSuggestionItem = { name, slots };
    if (productId) item.productId = productId;
    out.push(item);
  }
  return out;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const items = parseItems(body?.items);
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

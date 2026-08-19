import { NextResponse } from "next/server";
import {
  getCurrentBakeSlot,
  BAKE_SLOT_LABELS,
} from "@/app/lib/bakeryBakeSuggestions";
import { getBakeryBakeSuggestions } from "@/app/lib/bakeryBakeSuggestionService";

export async function GET() {
  try {
    const { items, updatedAt } = await getBakeryBakeSuggestions();
    const slot = getCurrentBakeSlot();
    return NextResponse.json({
      items,
      updatedAt,
      currentSlot: slot,
      currentSlotLabel: slot ? BAKE_SLOT_LABELS[slot] : null,
    });
  } catch (error) {
    console.error("[Bakery suggestions get]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Okunamadı", items: [] },
      { status: 500 }
    );
  }
}

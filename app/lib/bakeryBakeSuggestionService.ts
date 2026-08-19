import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { GETIR_TOKEN_COLLECTION } from "./types";
import type { BakeryBakeSuggestionItem } from "./bakeryBakeSuggestions";

/** getir_tokens içinde (mevcut Firestore kurallarıyla yazılabilir) */
export const BAKERY_BAKE_SUGGESTIONS_DOC_ID = "bakery_bake_suggestions";

export async function saveBakeryBakeSuggestions(
  items: BakeryBakeSuggestionItem[]
): Promise<void> {
  const now = new Date().toISOString();
  const sanitized = items.map((item) => {
    const slots: Record<string, number> = {};
    for (const [k, v] of Object.entries(item.slots || {})) {
      if (typeof v === "number" && Number.isFinite(v)) slots[k] = v;
    }
    const row: Record<string, unknown> = {
      name: String(item.name || "").trim(),
      slots,
    };
    if (item.productId && String(item.productId).trim()) {
      row.productId = String(item.productId).trim();
    }
    return row;
  });
  const ref = doc(
    db,
    GETIR_TOKEN_COLLECTION,
    BAKERY_BAKE_SUGGESTIONS_DOC_ID
  );
  await setDoc(ref, { items: sanitized, updatedAt: now }, { merge: true });
}

export async function getBakeryBakeSuggestions(): Promise<{
  items: BakeryBakeSuggestionItem[];
  updatedAt: string | null;
}> {
  const ref = doc(
    db,
    GETIR_TOKEN_COLLECTION,
    BAKERY_BAKE_SUGGESTIONS_DOC_ID
  );
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return { items: [], updatedAt: null };
  }
  const data = snap.data();
  const items = Array.isArray(data?.items) ? data.items : [];
  return {
    items,
    updatedAt: typeof data?.updatedAt === "string" ? data.updatedAt : null,
  };
}

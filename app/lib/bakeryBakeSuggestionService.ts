import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { GETIR_TOKEN_COLLECTION } from "./types";
import {
  BAKE_SLOT_KEYS,
  type BakeryBakeSuggestionItem,
  type BakeSlotKey,
  type BakeSlotMap,
} from "./bakeryBakeSuggestions";

/** getir_tokens içinde (mevcut Firestore kurallarıyla yazılabilir) */
export const BAKERY_BAKE_SUGGESTIONS_DOC_ID = "bakery_bake_suggestions";

function bakeSuggestionsDocRef() {
  return doc(db, GETIR_TOKEN_COLLECTION, BAKERY_BAKE_SUGGESTIONS_DOC_ID);
}

export function parseBakeryBakeSuggestionItems(
  raw: unknown
): BakeryBakeSuggestionItem[] {
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
  await setDoc(
    bakeSuggestionsDocRef(),
    { items: sanitized, updatedAt: now },
    { merge: true }
  );
}

export async function getBakeryBakeSuggestions(): Promise<{
  items: BakeryBakeSuggestionItem[];
  updatedAt: string | null;
}> {
  const snap = await getDoc(bakeSuggestionsDocRef());
  if (!snap.exists()) {
    return { items: [], updatedAt: null };
  }
  const data = snap.data();
  return {
    items: parseBakeryBakeSuggestionItems(data?.items),
    updatedAt: typeof data?.updatedAt === "string" ? data.updatedAt : null,
  };
}

/** Panel: dakikalık API yok; eklenti yazınca anında gelir. */
export function subscribeBakeryBakeSuggestions(
  onData: (items: BakeryBakeSuggestionItem[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    bakeSuggestionsDocRef(),
    (snap) => {
      if (!snap.exists()) {
        onData([]);
        return;
      }
      onData(parseBakeryBakeSuggestionItems(snap.data()?.items));
    },
    (error) => {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  );
}

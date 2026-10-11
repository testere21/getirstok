import {
  arrayRemove,
  arrayUnion,
  doc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { GETIR_TOKEN_COLLECTION } from "./types";

/** getir_tokens içinde (mevcut Firestore kurallarıyla yazılabilir) */
export const BAKERY_INACTIVE_DOC_ID = "bakery_inactive_products";

function inactiveDocRef() {
  return doc(db, GETIR_TOKEN_COLLECTION, BAKERY_INACTIVE_DOC_ID);
}

function parseBarcodes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((b): b is string => typeof b === "string")
    .map((b) => b.trim())
    .filter(Boolean);
}

/** Deaktif fırın ürünleri stok 0 olsa da "Beni pişir" / ses / Telegram uyarısı vermez. */
export async function setBakeryProductActive(
  barcode: string,
  active: boolean
): Promise<void> {
  const b = barcode.trim();
  if (!b) return;
  await setDoc(
    inactiveDocRef(),
    {
      barcodes: active ? arrayRemove(b) : arrayUnion(b),
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

export function subscribeBakeryInactiveBarcodes(
  onData: (barcodes: Set<string>) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    inactiveDocRef(),
    (snap) => {
      onData(new Set(snap.exists() ? parseBarcodes(snap.data()?.barcodes) : []));
    },
    (error) => {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  );
}

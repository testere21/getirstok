import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { GETIR_TOKEN_COLLECTION } from "./types";
import {
  BAKERY_PRODUCTS_DOC_ID,
  parseBakeryEntries,
  type BakeryProductEntry,
} from "./bakeryProducts";

/** getir_tokens içinde (diğer ayar belgeleri gibi; mevcut Firestore kurallarıyla yazılabilir) */
function bakeryProductsDocRef() {
  return doc(db, GETIR_TOKEN_COLLECTION, BAKERY_PRODUCTS_DOC_ID);
}

/**
 * Fırın çık ürün listesini okur (tek belge okuması, dinleyici yok).
 * Belge yoksa/bozuksa `null` — çağıran varsayılan listeyi kullanır.
 */
export async function readBakeryProducts(): Promise<BakeryProductEntry[] | null> {
  const snap = await getDoc(bakeryProductsDocRef());
  if (!snap.exists()) return null;
  return parseBakeryEntries(snap.data()?.items);
}

/** Listenin tamamını yazar (sıra dahil). */
export async function saveBakeryProducts(entries: readonly BakeryProductEntry[]): Promise<void> {
  await setDoc(bakeryProductsDocRef(), {
    items: entries.map((e) => (e.name ? { barcode: e.barcode, name: e.name } : { barcode: e.barcode })),
    updatedAt: new Date().toISOString(),
  });
}

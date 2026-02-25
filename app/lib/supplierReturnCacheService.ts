import { collection, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { db } from "./firebase";
import {
  SUPPLIER_RETURN_CACHE_COLLECTION,
  type SupplierReturnCache,
} from "./types";

/**
 * Belirli bir barkod için cache'te kayıtlı tedarikçi iade gününü döndürür.
 * Kayıt yoksa `null` döner.
 */
export async function getCachedSupplierReturnDays(
  barcode: string
): Promise<number | null> {
  const trimmed = barcode.trim();
  if (!trimmed) return null;

  const cacheCol = collection(db, SUPPLIER_RETURN_CACHE_COLLECTION);
  const q = query(cacheCol, where("barcode", "==", trimmed));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return null;
  }

  const docData = snapshot.docs[0].data() as SupplierReturnCache;
  return typeof docData.days === "number" ? docData.days : null;
}

/**
 * Belirli bir barkod için tedarikçi iade gününü cache'e yazar/günceller.
 * Barkodu doküman ID'si olarak kullanır (tek kayıt).
 */
export async function saveSupplierReturnDays(
  barcode: string,
  days: number
): Promise<void> {
  const trimmed = barcode.trim();
  if (!trimmed || typeof days !== "number" || Number.isNaN(days)) return;

  const now = new Date().toISOString();
  const cacheDocRef = doc(db, SUPPLIER_RETURN_CACHE_COLLECTION, trimmed);

  await setDoc(cacheDocRef, {
    barcode: trimmed,
    days,
    updatedAt: now,
  } as SupplierReturnCache);
}

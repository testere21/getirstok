import {
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import type { Timestamp } from "firebase/firestore";
import { db, stockItemsCollectionRef } from "./firebase";
import { STOCK_ITEMS_COLLECTION } from "./types";
import type { StockItemType } from "./types";
import type { StockItemWithId } from "./types";

/** Ekleme için parametreler (notes ve imageUrl opsiyonel) */
export interface AddStockItemParams {
  name: string;
  barcode: string;
  quantity: number;
  notes?: string;
  type: StockItemType;
  imageUrl?: string;
}

/** Güncelleme için kısmi alanlar (gönderilen alanlar güncellenir) */
export interface UpdateStockItemParams {
  name?: string;
  barcode?: string;
  quantity?: number;
  notes?: string;
  type?: StockItemType;
  imageUrl?: string;
}

/**
 * Yeni stok kalemi ekler (eksik veya fazla).
 * @returns Eklenen dokümanın ID'si
 */
export async function addStockItem(
  params: AddStockItemParams
): Promise<string> {
  const { name, barcode, quantity, notes, type, imageUrl } = params;
  try {
    const docRef = await addDoc(stockItemsCollectionRef, {
      name,
      barcode,
      quantity,
      notes: notes ?? "",
      type,
      imageUrl: imageUrl ?? "",
      createdAt: serverTimestamp(),
    });
    console.log("✅ Ürün Firestore'a eklendi:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("❌ Firestore ekleme hatası:", error);
    throw error;
  }
}

/**
 * Stok kalemini doküman ID ile siler.
 */
export async function deleteStockItem(id: string): Promise<void> {
  const docRef = doc(db, STOCK_ITEMS_COLLECTION, id);
  await deleteDoc(docRef);
}

/**
 * Stok kalemini doküman ID ile günceller (sadece verilen alanlar değişir).
 * Not: `type` alanı güvenlik nedeniyle güncellenemez (eksik/fazla tipi değiştirilemez).
 * `updatedAt` alanı otomatik olarak serverTimestamp() ile set edilir.
 */
export async function updateStockItem(
  id: string,
  fields: UpdateStockItemParams
): Promise<void> {
  const docRef = doc(db, STOCK_ITEMS_COLLECTION, id);
  // type alanını filtrele - güvenlik: eksik/fazla tipi değiştirilemez
  const { type, ...updateFields } = fields;
  // updatedAt alanını otomatik olarak ekle
  await updateDoc(docRef, {
    ...updateFields,
    updatedAt: serverTimestamp(),
  } as Record<string, unknown>);
}

/** Timestamp alanını Firestore Timestamp'ten ISO string'e çevirir */
function timestampToString(value: unknown): string {
  if (value && typeof (value as Timestamp).toDate === "function") {
    return (value as Timestamp).toDate().toISOString();
  }
  return typeof value === "string" ? value : "";
}

/**
 * stock_items koleksiyonunu real-time dinler; değişiklikte callback'i liste ile çağırır.
 * @param callback Veri geldiğinde çağrılır (items, isFromCache)
 * @param onError Hata durumunda çağrılır (opsiyonel)
 * @returns Unsubscribe fonksiyonu (useEffect cleanup için kullan)
 */
export function subscribeStockItems(
  callback: (items: StockItemWithId[], isFromCache?: boolean) => void,
  onError?: (error: Error) => void
): () => void {
  console.log("📡 Firestore subscription başlatılıyor...");
  return onSnapshot(
    stockItemsCollectionRef,
    (snapshot) => {
      const items: StockItemWithId[] = snapshot.docs.map((d) => {
        const data = d.data();
      return {
        id: d.id,
        name: data.name ?? "",
        barcode: data.barcode ?? "",
        quantity: typeof data.quantity === "number" ? data.quantity : 0,
        notes: data.notes ?? "",
        type: data.type === "extra" ? "extra" : "missing",
        createdAt: timestampToString(data.createdAt),
        updatedAt: data.updatedAt ? timestampToString(data.updatedAt) : undefined,
        imageUrl: data.imageUrl ?? undefined,
      };
      });
      // Metadata'dan cache durumunu kontrol et
      const isFromCache = snapshot.metadata.fromCache;
      console.log(
        `📦 Firestore'dan ${items.length} kayıt alındı (${isFromCache ? "cache" : "server"})`
      );
      callback(items, isFromCache);
    },
    (error) => {
      // Firestore hata callback'i
      console.error("❌ Firestore subscription hatası:", error);
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  );
}

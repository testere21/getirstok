import {
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import type { Timestamp } from "firebase/firestore";
import { db, stockItemsCollectionRef } from "./firebase";
import { STOCK_ITEMS_COLLECTION } from "./types";
import type { StockItemType, StockItemWithId } from "./types";

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

    // Telegram bildirimi için backend API'ine fire-and-forget istek at
    try {
      void fetch("/api/telegram/stock-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "add",
          item: {
            name,
            barcode,
            quantity,
            notes: notes ?? "",
            type,
          },
        }),
      });
    } catch (err) {
      console.error("Telegram bildirim isteği gönderilemedi (addStockItem):", err);
    }

    return docRef.id;
  } catch (error) {
    console.error("❌ Firestore ekleme hatası:", error);
    throw error;
  }
}

/**
 * Stok kalemini doküman ID ile siler.
 * `skipTelegram`: çağıran taraf kendi toplu bildirimini gönderiyorsa
 * (ör. sayım change'i iki kaydı birlikte kapatıyor) tek tek "ürün silindi"
 * mesajı atılmaz.
 */
export async function deleteStockItem(
  id: string,
  options?: { skipTelegram?: boolean }
): Promise<void> {
  const docRef = doc(db, STOCK_ITEMS_COLLECTION, id);
  const skipTelegram = options?.skipTelegram === true;

  // Silme öncesi son durumu oku (Telegram için)
  let itemBeforeDelete: StockItemWithId | null = null;
  if (!skipTelegram) {
    try {
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        const data = snapshot.data();
        itemBeforeDelete = {
          id: snapshot.id,
          name: (data.name as string) ?? "",
          barcode: (data.barcode as string) ?? "",
          quantity: typeof data.quantity === "number" ? data.quantity : 0,
          notes: (data.notes as string) ?? "",
          type: (data.type as StockItemType) === "extra" ? "extra" : "missing",
          createdAt: "", // Telegram mesajında kullanılmıyor
          imageUrl: (data.imageUrl as string) ?? "",
        };
      }
    } catch (err) {
      console.error("Silme öncesi doküman okunamadı:", err);
    }
  }

  await deleteDoc(docRef);

  // Telegram bildirimi için backend API'ine fire-and-forget istek at
  if (itemBeforeDelete) {
    try {
      void fetch("/api/telegram/stock-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "delete",
          item: {
            name: itemBeforeDelete.name,
            barcode: itemBeforeDelete.barcode,
            quantity: itemBeforeDelete.quantity,
            notes: itemBeforeDelete.notes,
            type: itemBeforeDelete.type,
          },
        }),
      });
    } catch (err) {
      console.error("Telegram bildirim isteği gönderilemedi (deleteStockItem):", err);
    }
  }
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

  // Güncelleme öncesi dokümanı oku (Telegram için "before" verisi)
  let beforeItem: StockItemWithId | null = null;
  try {
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      const data = snapshot.data();
      beforeItem = {
        id: snapshot.id,
        name: (data.name as string) ?? "",
        barcode: (data.barcode as string) ?? "",
        quantity: typeof data.quantity === "number" ? data.quantity : 0,
        notes: (data.notes as string) ?? "",
        type: (data.type as StockItemType) === "extra" ? "extra" : "missing",
        createdAt: "", // Telegram mesajında kullanılmıyor
        updatedAt: undefined,
        imageUrl: (data.imageUrl as string) ?? "",
      };
    }
  } catch (err) {
    console.error("Güncelleme öncesi doküman okunamadı:", err);
  }

  await updateDoc(docRef, {
    ...updateFields,
    updatedAt: serverTimestamp(),
  } as Record<string, unknown>);

  // Telegram bildirimi için backend API'ine fire-and-forget istek at
  if (beforeItem) {
    try {
      const afterItem: StockItemWithId = {
        ...beforeItem,
        ...updateFields,
      };

      void fetch("/api/telegram/stock-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "update",
          beforeItem: {
            name: beforeItem.name,
            barcode: beforeItem.barcode,
            quantity: beforeItem.quantity,
            notes: beforeItem.notes,
            type: beforeItem.type,
          },
          item: {
            name: afterItem.name,
            barcode: afterItem.barcode,
            quantity: afterItem.quantity,
            notes: afterItem.notes,
            type: afterItem.type,
          },
        }),
      });
    } catch (err) {
      console.error("Telegram bildirim isteği gönderilemedi (updateStockItem):", err);
    }
  }
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

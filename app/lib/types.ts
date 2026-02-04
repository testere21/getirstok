/**
 * Stok takip paneli — Firestore doküman şeması ve tipler
 */

/** Eksik veya fazla ürün tipi */
export type StockItemType = "missing" | "extra";

/** Firestore'da saklanan stok kalemi (doküman gövdesi) */
export interface StockItem {
  name: string;
  barcode: string;
  quantity: number;
  notes: string;
  type: StockItemType;
  createdAt: string;
  imageUrl?: string; // Ürün görseli URL'i (opsiyonel)
}

/** ID ile birlikte stok kalemi (listeleme/okuma için) */
export interface StockItemWithId extends StockItem {
  id: string;
}

/** Koleksiyon adı — projede tutarlı kullanım için */
export const STOCK_ITEMS_COLLECTION = "stock_items";

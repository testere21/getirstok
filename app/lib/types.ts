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
  updatedAt?: string; // Son güncellenme tarihi (opsiyonel, sadece güncelleme yapıldığında set edilir)
  imageUrl?: string; // Ürün görseli URL'i (opsiyonel)
}

/** ID ile birlikte stok kalemi (listeleme/okuma için) */
export interface StockItemWithId extends StockItem {
  id: string;
}

/** Koleksiyon adı — projede tutarlı kullanım için */
export const STOCK_ITEMS_COLLECTION = "stock_items";

/** Getir API token tipi */
export type GetirTokenType = "franchise" | "warehouse";

/** Getir API token'ı (Firestore'da saklanan) */
export interface GetirToken {
  token: string; // Bearer token (eyJ...)
  type?: GetirTokenType; // Token tipi: "franchise" (bayi paneli) veya "warehouse" (depo paneli)
  createdAt: string; // ISO string - oluşturulma zamanı
  updatedAt?: string; // ISO string - son güncelleme zamanı
  isValid?: boolean; // Token geçerli mi (opsiyonel, API test sonucu)
  lastUsedAt?: string; // ISO string - son kullanım zamanı (opsiyonel)
}

/** ID ile birlikte Getir token (listeleme/okuma için) */
export interface GetirTokenWithId extends GetirToken {
  id: string;
}

/** Getir token koleksiyon adı — singleton pattern (tek aktif token) */
export const GETIR_TOKEN_COLLECTION = "getir_tokens";

/** Aktif token doküman ID'leri (her tip için ayrı) */
export const ACTIVE_FRANCHISE_TOKEN_DOC_ID = "active_franchise"; // Bayi paneli token'ı
export const ACTIVE_WAREHOUSE_TOKEN_DOC_ID = "active_warehouse"; // Depo paneli token'ı

/** Eski aktif token doküman ID'si (geriye dönük uyumluluk için) */
export const ACTIVE_TOKEN_DOC_ID = "active";

/** Varsayılan warehouse ID (Getir panelinde seçili olan warehouse) */
export const DEFAULT_WAREHOUSE_ID = "5dc32d8b734a192200caddf8";

/** Barkod -> Ürün ID mapping (Firestore'da saklanan) */
export interface BarcodeProductMapping {
  barcode: string; // Ürün barkodu (unique)
  productId: string; // Getir ürün ID'si (MongoDB ObjectId formatında)
  productName?: string; // Ürün adı (opsiyonel, cache için)
  createdAt: string; // ISO string - oluşturulma zamanı
  updatedAt?: string; // ISO string - son güncelleme zamanı
}

/** ID ile birlikte mapping (listeleme/okuma için) */
export interface BarcodeProductMappingWithId extends BarcodeProductMapping {
  id: string;
}

/** Barkod -> Ürün ID mapping koleksiyon adı */
export const BARCODE_PRODUCT_MAPPING_COLLECTION = "barcode_product_mappings";

/** Tedarikçi iade tarihi cache (Firestore'da saklanan) */
export interface SupplierReturnCache {
  barcode: string; // Ürün barkodu (unique)
  days: number; // Kaç gün önceden çıkılacak
  updatedAt: string; // ISO string - son güncelleme zamanı
}

/** ID ile birlikte tedarikçi iade cache kaydı */
export interface SupplierReturnCacheWithId extends SupplierReturnCache {
  id: string;
}

/** Tedarikçi iade cache koleksiyon adı */
export const SUPPLIER_RETURN_CACHE_COLLECTION = "supplier_return_cache";

/** Yaklaşan SKT (Son Kullanma Tarihi) kaydı (Firestore'da saklanan) */
export interface ExpiringProduct {
  barcode: string; // Ürün barkodu
  productName: string; // Ürün adı (cache için)
  expiryDate: string; // SKT tarihi (ISO format: YYYY-MM-DD)
  removalDate: string; // Çıkılması gereken tarih (ISO format: YYYY-MM-DD)
  createdAt: string; // ISO string - oluşturulma zamanı
  updatedAt?: string; // ISO string - son güncelleme zamanı
  isNotified?: boolean; // Opsiyonel: bildirim gösterildi mi?
}

/** ID ile birlikte yaklaşan SKT kaydı */
export interface ExpiringProductWithId extends ExpiringProduct {
  id: string;
}

/** Yaklaşan SKT koleksiyon adı */
export const EXPIRING_PRODUCTS_COLLECTION = "expiring_products";

/**
 * Ürün / stok problemi bildirimi (ÜRÜN YOK / STOK YOK)
 */
export type ProductIssueType = "product_missing" | "stock_missing";

export interface ProductIssueReport {
  barcode: string;
  productName?: string;
  type: ProductIssueType;
  note?: string;
  source?: string;
  createdAt: string;
  telegramSent: boolean;
  telegramError?: string;
}

export interface ProductIssueReportWithId extends ProductIssueReport {
  id: string;
}

export const PRODUCT_ISSUE_REPORTS_COLLECTION = "product_issue_reports";


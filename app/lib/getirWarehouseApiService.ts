import { getActiveWarehouseId, getGetirWarehouseToken } from "./getirTokenService";
import { getProductIdByBarcode } from "./barcodeProductMappingService";
import {
  getCachedSupplierReturnDays,
  saveSupplierReturnDays,
} from "./supplierReturnCacheService";

/** Getir Depo Paneli API'den veri çekme hatası */
export class GetirWarehouseApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public code?: string
  ) {
    super(message);
    this.name = "GetirWarehouseApiError";
  }
}

/**
 * Getir Depo Paneli API'sinden barkod ile ürün arama (filter endpoint)
 * @param barcode Ürün barkodu
 * @returns Promise<string | null> Ürün ID'si (bulunamazsa null)
 * @throws GetirWarehouseApiError Token yoksa veya network hatası varsa
 */
export async function searchProductByBarcode(barcode: string): Promise<string | null> {
  try {
    // Önce Firestore'dan productId'yi kontrol et (daha hızlı)
    const productIdFromMapping = await getProductIdByBarcode(barcode);
    if (productIdFromMapping) {
      console.log("[Getir Warehouse API] Product ID found in mapping:", productIdFromMapping);
      return productIdFromMapping;
    }

    // Firebase'den depo paneli token'ı al
    const token = await getGetirWarehouseToken();

    if (!token) {
      throw new GetirWarehouseApiError(
        "Depo paneli token'ı bulunamadı. Lütfen Chrome eklentisini kullanarak token ekleyin.",
        undefined,
        "NO_TOKEN"
      );
    }

    const warehouseId = await getActiveWarehouseId();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 saniye timeout

    try {
      console.log("[Getir Warehouse API] Searching product by barcode (no mapping found):", barcode);

      // Warehouse API'sine minimal request - sadece barcodes array gönderiyoruz
      const requestBody = {
        barcodes: [barcode.trim()], // Sadece barcodes array
      };

      console.log("[Getir Warehouse API] Filter request body:", JSON.stringify(requestBody, null, 2));

      const response = await fetch(
        `https://warehouse-panel-api-gateway.getirapi.com/warehouse/${warehouseId}/products?offset=0&limit=10`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            countrycode: "TR",
            language: "tr",
            "x-requester-client": "warehouse-panel-frontend",
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      console.log("[Getir Warehouse API] Filter response status:", response.status);

      if (response.status === 401) {
        throw new GetirWarehouseApiError(
          "Depo paneli token'ı geçersiz. Lütfen Chrome eklentisini kullanarak yeni token ekleyin.",
          401,
          "UNAUTHORIZED"
        );
      }

      if (response.status === 403) {
        throw new GetirWarehouseApiError(
          "Bu işlem için yetkiniz yok. Lütfen token'ı kontrol edin.",
          403,
          "FORBIDDEN"
        );
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Getir Warehouse API] Filter error response:", errorText);
        console.error("[Getir Warehouse API] Filter request URL:", `https://warehouse-panel-api-gateway.getirapi.com/warehouse/${warehouseId}/products?offset=0&limit=10`);
        console.error("[Getir Warehouse API] Filter request body:", JSON.stringify(requestBody, null, 2));
        console.error("[Getir Warehouse API] Filter request headers:", {
          Authorization: `Bearer ${token.substring(0, 20)}...`,
          "Content-Type": "application/json",
          countrycode: "TR",
          language: "tr",
          "x-requester-client": "warehouse-panel-frontend",
        });
        
        // Hata mesajını daha detaylı göster
        let errorMessage = `API hatası: ${response.status} ${response.statusText}`;
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.message) {
            errorMessage += ` - ${errorJson.message}`;
          }
        } catch {
          if (errorText) {
            errorMessage += ` - ${errorText.substring(0, 200)}`;
          }
        }
        
        throw new GetirWarehouseApiError(
          errorMessage,
          response.status,
          "API_ERROR"
        );
      }

      const data = await response.json();
      console.log("[Getir Warehouse API] Filter response data:", JSON.stringify(data, null, 2));

      // Response yapısı: { data: { data: { products: [...] } } }
      const products = data?.data?.data?.products || [];
      
      if (products.length === 0) {
        console.log("[Getir Warehouse API] No products found for barcode:", barcode);
        return null;
      }

      // İlk ürünün ID'sini al
      const productId = products[0]?.id || products[0]?._id;
      
      if (!productId) {
        console.warn("[Getir Warehouse API] Product found but no ID:", products[0]);
        return null;
      }

      console.log("[Getir Warehouse API] Product ID found:", productId);
      return productId;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof GetirWarehouseApiError) {
        throw error;
      }
      
      if (error instanceof Error && error.name === "AbortError") {
        throw new GetirWarehouseApiError(
          "İstek zaman aşımına uğradı. Lütfen tekrar deneyin.",
          undefined,
          "TIMEOUT"
        );
      }
      
      throw new GetirWarehouseApiError(
        `Ürün arama hatası: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
        undefined,
        "SEARCH_ERROR"
      );
    }
  } catch (error) {
    if (error instanceof GetirWarehouseApiError) {
      throw error;
    }
    
    console.error("[Getir Warehouse API] Unexpected error:", error);
    throw new GetirWarehouseApiError(
      `Beklenmeyen hata: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      undefined,
      "UNKNOWN_ERROR"
    );
  }
}

/**
 * Getir Depo Paneli API'sinden ürün detaylarını çeker ve tedarikçi iade tarihini döndürür
 * @param productId Ürün ID'si (MongoDB ObjectId formatında)
 * @returns Promise<number | null> Tedarikçi iade tarihi (gün sayısı, bulunamazsa null)
 * @throws GetirWarehouseApiError Token yoksa veya network hatası varsa
 */
export async function getProductSupplierReturnDate(productId: string): Promise<number | null> {
  try {
    // Firebase'den depo paneli token'ı al
    const token = await getGetirWarehouseToken();

    if (!token) {
      throw new GetirWarehouseApiError(
        "Depo paneli token'ı bulunamadı. Lütfen Chrome eklentisini kullanarak token ekleyin.",
        undefined,
        "NO_TOKEN"
      );
    }

    const warehouseId = await getActiveWarehouseId();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 saniye timeout

    try {
      console.log("[Getir Warehouse API] Fetching product details for product ID:", productId);

      const requestBody = {
        productIds: [productId],
      };

      console.log("[Getir Warehouse API] Products request body:", JSON.stringify(requestBody, null, 2));

      const response = await fetch(
        `https://warehouse-panel-api-gateway.getirapi.com/warehouse/${warehouseId}/products?offset=0&limit=20`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            countrycode: "TR",
            language: "tr",
            "x-requester-client": "warehouse-panel-frontend",
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      console.log("[Getir Warehouse API] Products response status:", response.status);

      if (response.status === 401) {
        throw new GetirWarehouseApiError(
          "Depo paneli token'ı geçersiz. Lütfen Chrome eklentisini kullanarak yeni token ekleyin.",
          401,
          "UNAUTHORIZED"
        );
      }

      if (response.status === 403) {
        throw new GetirWarehouseApiError(
          "Bu işlem için yetkiniz yok. Lütfen token'ı kontrol edin.",
          403,
          "FORBIDDEN"
        );
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Getir Warehouse API] Products error response:", errorText);
        console.error("[Getir Warehouse API] Request URL:", `https://warehouse-panel-api-gateway.getirapi.com/warehouse/${warehouseId}/products?offset=0&limit=20`);
        console.error("[Getir Warehouse API] Request body:", JSON.stringify(requestBody, null, 2));
        console.error("[Getir Warehouse API] Request headers:", {
          Authorization: `Bearer ${token.substring(0, 20)}...`,
          "Content-Type": "application/json",
          countrycode: "TR",
          language: "tr",
          "x-requester-client": "warehouse-panel-frontend",
        });
        
        // Hata mesajını daha detaylı göster
        let errorMessage = `API hatası: ${response.status} ${response.statusText}`;
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.message) {
            errorMessage += ` - ${errorJson.message}`;
          }
        } catch {
          if (errorText) {
            errorMessage += ` - ${errorText.substring(0, 200)}`;
          }
        }
        
        throw new GetirWarehouseApiError(
          errorMessage,
          response.status,
          "API_ERROR"
        );
      }

      const data = await response.json();
      console.log("[Getir Warehouse API] Products response data:", JSON.stringify(data, null, 2));

      // Response yapısı: { data: { data: { products: [{ expDays: { dead: 3 } }] } } }
      const products = data?.data?.data?.products || [];
      
      if (products.length === 0) {
        console.log("[Getir Warehouse API] No product details found for product ID:", productId);
        return null;
      }

      // İlk ürünün expDays.dead değerini al
      const supplierReturnDate = products[0]?.expDays?.dead;
      
      if (supplierReturnDate === undefined || supplierReturnDate === null) {
        console.warn("[Getir Warehouse API] Product found but no supplier return date:", products[0]);
        return null;
      }

      console.log("[Getir Warehouse API] Supplier return date found:", supplierReturnDate, "days");
      return typeof supplierReturnDate === "number" ? supplierReturnDate : parseInt(String(supplierReturnDate), 10);
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof GetirWarehouseApiError) {
        throw error;
      }
      
      if (error instanceof Error && error.name === "AbortError") {
        throw new GetirWarehouseApiError(
          "İstek zaman aşımına uğradı. Lütfen tekrar deneyin.",
          undefined,
          "TIMEOUT"
        );
      }
      
      throw new GetirWarehouseApiError(
        `Ürün detayları çekme hatası: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
        undefined,
        "FETCH_ERROR"
      );
    }
  } catch (error) {
    if (error instanceof GetirWarehouseApiError) {
      throw error;
    }
    
    console.error("[Getir Warehouse API] Unexpected error:", error);
    throw new GetirWarehouseApiError(
      `Beklenmeyen hata: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      undefined,
      "UNKNOWN_ERROR"
    );
  }
}

/**
 * Barkod'dan direkt tedarikçi iade tarihini çeker (ana servis fonksiyonu)
 * @param barcode Ürün barkodu
 * @returns Promise<number | null> Tedarikçi iade tarihi (gün sayısı, bulunamazsa null)
 * @throws GetirWarehouseApiError Token yoksa, ürün bulunamazsa veya network hatası varsa
 */
export async function getGetirSupplierReturnDate(barcode: string): Promise<number | null> {
  try {
    console.log("[Getir Warehouse API] Getting supplier return date for barcode:", barcode);

    const trimmedBarcode = barcode.trim();

    // 0. Adım: Cache kontrolü
    try {
      const cachedDays = await getCachedSupplierReturnDays(trimmedBarcode);
      if (cachedDays !== null) {
        console.log(
          "[Getir Warehouse API] Supplier return date cache hit for barcode:",
          trimmedBarcode,
          "days:",
          cachedDays
        );
        return cachedDays;
      }
      console.log(
        "[Getir Warehouse API] Supplier return date cache miss for barcode:",
        trimmedBarcode
      );
    } catch (cacheError) {
      console.warn(
        "[Getir Warehouse API] Supplier return cache read error:",
        cacheError
      );
      // Cache hatası, ana akışı bozmasın
    }

    // 1. Adım: Barkod ile ürün ID'sini bul
    let productId: string | null;
    try {
      productId = await searchProductByBarcode(trimmedBarcode);
      console.log("[Getir Warehouse API] searchProductByBarcode result:", productId);
    } catch (error) {
      console.error("[Getir Warehouse API] Error in searchProductByBarcode:", error);
      if (error instanceof GetirWarehouseApiError) {
        throw error;
      }
      throw new GetirWarehouseApiError(
        `Ürün arama hatası: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
        undefined,
        "SEARCH_ERROR"
      );
    }

    if (!productId) {
      console.log("[Getir Warehouse API] Product not found for barcode:", barcode);
      throw new GetirWarehouseApiError(
        `Ürün bulunamadı. Barkod: ${trimmedBarcode}`,
        undefined,
        "PRODUCT_NOT_FOUND"
      );
    }

    console.log("[Getir Warehouse API] Product ID found:", productId);

    // 2. Adım: Ürün ID'si ile tedarikçi iade tarihini çek
    let supplierReturnDate: number | null;
    try {
      supplierReturnDate = await getProductSupplierReturnDate(productId);
      console.log("[Getir Warehouse API] getProductSupplierReturnDate result:", supplierReturnDate);
    } catch (error) {
      console.error("[Getir Warehouse API] Error in getProductSupplierReturnDate:", error);
      if (error instanceof GetirWarehouseApiError) {
        throw error;
      }
      throw new GetirWarehouseApiError(
        `Tedarikçi iade tarihi çekme hatası: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
        undefined,
        "FETCH_ERROR"
      );
    }

    if (supplierReturnDate === null) {
      console.log("[Getir Warehouse API] Supplier return date not found for product ID:", productId);
      throw new GetirWarehouseApiError(
        `Tedarikçi iade tarihi bulunamadı. Ürün ID: ${productId}`,
        undefined,
        "SUPPLIER_RETURN_DATE_NOT_FOUND"
      );
    }

    console.log(
      "[Getir Warehouse API] Supplier return date retrieved successfully:",
      supplierReturnDate,
      "days"
    );

    // 3. Adım: Cache'e yaz
    try {
      await saveSupplierReturnDays(trimmedBarcode, supplierReturnDate);
      console.log(
        "[Getir Warehouse API] Supplier return date cached for barcode:",
        trimmedBarcode
      );
    } catch (cacheError) {
      console.warn(
        "[Getir Warehouse API] Supplier return cache write error:",
        cacheError
      );
      // Cache hatası ana akışı bozmasın
    }

    return supplierReturnDate;
  } catch (error) {
    if (error instanceof GetirWarehouseApiError) {
      throw error;
    }

    console.error("[Getir Warehouse API] Unexpected error in getGetirSupplierReturnDate:", error);
    throw new GetirWarehouseApiError(
      `Tedarikçi iade tarihi çekme hatası: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      undefined,
      "UNKNOWN_ERROR"
    );
  }
}

const WAREHOUSE_PRODUCTS_BATCH = 20;

function warehouseProductsFromResponse(data: unknown): Record<string, unknown>[] {
  const nested = (data as { data?: { data?: { products?: unknown } } })?.data
    ?.data?.products;
  if (Array.isArray(nested)) {
    return nested.filter(
      (p): p is Record<string, unknown> => !!p && typeof p === "object"
    );
  }
  return [];
}

function collectBarcodesFromWarehouseProduct(
  product: Record<string, unknown>
): string[] {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === "string" && v.trim()) out.add(v.trim());
  };
  add(product.barcode);
  add(product.masterBarcode);
  if (Array.isArray(product.barcodes)) {
    for (const b of product.barcodes) add(b);
  }
  const walk = (node: unknown, depth: number) => {
    if (depth > 5 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) {
        if (typeof item === "string") add(item);
        else walk(item, depth + 1);
      }
      return;
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (/barcode/i.test(k)) add(v);
      else if (v && typeof v === "object") walk(v, depth + 1);
    }
  };
  walk(product, 0);
  return [...out];
}

const FROZEN_KEY_RE =
  /^(frozen|frozenstock|frozenamount|frozencount|frozenqty|frozenquantity|freezerstock|freezer|donuk|donukstok|donukadet)$/i;

function normalizeStockKey(key: string): string {
  return key.replace(/[_\s-]/g, "");
}

function pickNumericFrozen(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Depo paneli ürününden donuk stok (Satılan / Rezerve / Donuk / Raf kartındaki Donuk). */
export function extractFrozenStockFromWarehouseProduct(
  product: Record<string, unknown>
): number | null {
  const directKeys = [
    "frozen",
    "frozenStock",
    "frozenCount",
    "frozenAmount",
    "frozenQty",
    "frozenQuantity",
    "freezerStock",
    "donuk",
    "donukStok",
  ];
  for (const k of directKeys) {
    const n = pickNumericFrozen(product[k]);
    if (n !== null) return n;
  }

  const nestedObjs = [
    product.stock,
    product.stocks,
    product.stockInfo,
    product.stockCounts,
    product.counts,
    product.inventory,
    product.warehouseStock,
    product.freshBakery,
    product.bakery,
    product.bakeryStock,
  ];
  for (const obj of nestedObjs) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) continue;
    const rec = obj as Record<string, unknown>;
    for (const k of directKeys) {
      const n = pickNumericFrozen(rec[k]);
      if (n !== null) return n;
    }
    for (const [k, v] of Object.entries(rec)) {
      if (FROZEN_KEY_RE.test(normalizeStockKey(k))) {
        const n = pickNumericFrozen(v);
        if (n !== null) return n;
      }
    }
  }

  const arrays = [product.stocks, product.stockByType, product.storageStocks];
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue;
    for (const row of arr) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      const label = [
        rec.type,
        rec.name,
        rec.storageType,
        rec.stockType,
        rec.key,
      ]
        .map((x) => String(x ?? ""))
        .join(" ");
      if (!/frozen|donuk|freezer/i.test(label)) continue;
      const n =
        pickNumericFrozen(rec.amount) ??
        pickNumericFrozen(rec.count) ??
        pickNumericFrozen(rec.quantity) ??
        pickNumericFrozen(rec.stock) ??
        pickNumericFrozen(rec.value);
      if (n !== null) return n;
    }
  }

  const seen = new Set<unknown>();
  const walk = (node: unknown, depth: number): number | null => {
    if (depth > 6 || !node || typeof node !== "object") return null;
    if (seen.has(node)) return null;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walk(item, depth + 1);
        if (found !== null) return found;
      }
      return null;
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (FROZEN_KEY_RE.test(normalizeStockKey(k))) {
        const n = pickNumericFrozen(v);
        if (n !== null) return n;
      }
      const found = walk(v, depth + 1);
      if (found !== null) return found;
    }
    return null;
  };

  return walk(product, 0);
}

async function postWarehouseProducts(body: Record<string, unknown>, limit: number) {
  const token = await getGetirWarehouseToken();
  if (!token) {
    throw new GetirWarehouseApiError(
      "Depo paneli token'ı bulunamadı. Lütfen Chrome eklentisini kullanarak token ekleyin.",
      undefined,
      "NO_TOKEN"
    );
  }

  const warehouseId = await getActiveWarehouseId();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(
      `https://warehouse-panel-api-gateway.getirapi.com/warehouse/${warehouseId}/products?offset=0&limit=${limit}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          countrycode: "TR",
          language: "tr",
          "x-requester-client": "warehouse-panel-frontend",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );

    if (response.status === 401) {
      throw new GetirWarehouseApiError(
        "Depo paneli token'ı geçersiz. Lütfen Chrome eklentisini kullanarak yeni token ekleyin.",
        401,
        "UNAUTHORIZED"
      );
    }
    if (response.status === 403) {
      throw new GetirWarehouseApiError(
        "Bu işlem için yetkiniz yok. Lütfen token'ı kontrol edin.",
        403,
        "FORBIDDEN"
      );
    }
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new GetirWarehouseApiError(
        `API hatası: ${response.status} ${response.statusText}${
          errorText ? ` - ${errorText.slice(0, 200)}` : ""
        }`,
        response.status,
        "API_ERROR"
      );
    }

    return warehouseProductsFromResponse(await response.json());
  } catch (error) {
    if (error instanceof GetirWarehouseApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new GetirWarehouseApiError(
        "İstek zaman aşımına uğradı. Lütfen tekrar deneyin.",
        undefined,
        "TIMEOUT"
      );
    }
    throw new GetirWarehouseApiError(
      `Depo ürün sorgusu hatası: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      undefined,
      "FETCH_ERROR"
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fırın barkodları için depo paneli donuk stokları.
 * Tek istekte en fazla 20 barkod (depo products limit).
 */
export async function getWarehouseFrozenStocksByBarcodes(
  barcodes: string[]
): Promise<Record<string, number | null>> {
  const unique = [
    ...new Set(barcodes.map((b) => b.trim()).filter(Boolean)),
  ];
  const result: Record<string, number | null> = {};
  for (const bc of unique) result[bc] = null;
  if (unique.length === 0) return result;

  for (let i = 0; i < unique.length; i += WAREHOUSE_PRODUCTS_BATCH) {
    const chunk = unique.slice(i, i + WAREHOUSE_PRODUCTS_BATCH);
    const products = await postWarehouseProducts(
      { barcodes: chunk },
      Math.max(chunk.length, 10)
    );

    if (products.length > 0 && extractFrozenStockFromWarehouseProduct(products[0]) === null) {
      console.warn(
        "[Getir Warehouse API] Donuk stok alanı bulunamadı, ürün anahtarları:",
        Object.keys(products[0]).slice(0, 40)
      );
    }

    for (const product of products) {
      const frozen = extractFrozenStockFromWarehouseProduct(product);
      const productBarcodes = collectBarcodesFromWarehouseProduct(product);
      let matched = false;
      for (const wanted of chunk) {
        if (
          productBarcodes.some(
            (b) => b === wanted || b.includes(wanted) || wanted.includes(b)
          )
        ) {
          result[wanted] = frozen;
          matched = true;
        }
      }
      if (!matched && chunk.length === 1) {
        result[chunk[0]] = frozen;
      }
    }
  }

  return result;
}


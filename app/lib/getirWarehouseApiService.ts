import { getGetirWarehouseToken } from "./getirTokenService";
import { DEFAULT_WAREHOUSE_ID } from "./types";
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
        `https://warehouse-panel-api-gateway.getirapi.com/warehouse/${DEFAULT_WAREHOUSE_ID}/products?offset=0&limit=10`,
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
        console.error("[Getir Warehouse API] Filter request URL:", `https://warehouse-panel-api-gateway.getirapi.com/warehouse/${DEFAULT_WAREHOUSE_ID}/products?offset=0&limit=10`);
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 saniye timeout

    try {
      console.log("[Getir Warehouse API] Fetching product details for product ID:", productId);

      const requestBody = {
        productIds: [productId],
      };

      console.log("[Getir Warehouse API] Products request body:", JSON.stringify(requestBody, null, 2));

      const response = await fetch(
        `https://warehouse-panel-api-gateway.getirapi.com/warehouse/${DEFAULT_WAREHOUSE_ID}/products?offset=0&limit=20`,
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
        console.error("[Getir Warehouse API] Request URL:", `https://warehouse-panel-api-gateway.getirapi.com/warehouse/${DEFAULT_WAREHOUSE_ID}/products?offset=0&limit=20`);
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


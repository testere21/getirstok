import { getGetirToken } from "./getirTokenService";
import { getProductIdByBarcode } from "./barcodeProductMappingService";
import { DEFAULT_WAREHOUSE_ID } from "./types";

/** Getir API'den stok bilgisi çekme hatası */
export class GetirApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public code?: string
  ) {
    super(message);
    this.name = "GetirApiError";
  }
}

/**
 * Getir API'den belirli bir ürün ID'si için stok miktarını çeker (HIZLI YÖNTEM)
 * @param productId Ürün ID'si (MongoDB ObjectId formatında)
 * @param warehouseIds Depo ID'leri (opsiyonel, boş array ise tüm depolardan getirir)
 * @returns Promise<number | null> Stok miktarı (ürün bulunamazsa veya hata varsa null)
 * @throws GetirApiError Token yoksa veya network hatası varsa
 */
export async function getGetirStockByProductId(
  productId: string,
  warehouseIds: string[] = []
): Promise<number | null> {
  try {
    // Firebase'den token al
    const token = await getGetirToken();

    if (!token) {
      throw new GetirApiError(
        "Token bulunamadı. Lütfen Chrome eklentisini kullanarak token ekleyin.",
        undefined,
        "NO_TOKEN"
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 saniye timeout (tek istek)

    try {
      console.log("[Getir API] Fetching stock by product ID:", productId);

      // Not: warehouseIds boş array ise tüm warehouse'ları getirir
      // Ama Getir panelinde genelde belirli bir warehouse seçilidir
      // Varsayılan warehouse ID'sini kullan (Getir panelinde seçili olan)
      const finalWarehouseIds = warehouseIds.length > 0 
        ? warehouseIds 
        : [DEFAULT_WAREHOUSE_ID]; // Varsayılan warehouse ID'si

      const requestBody = {
        warehouseIds: finalWarehouseIds,
        productIds: [productId], // Ürün ID'si ile filtrele
        sort: {
          available: 1,
        },
      };

      console.log("[Getir API] Request body:", JSON.stringify(requestBody, null, 2));

      const response = await fetch(
        "https://franchise-api-gateway.getirapi.com/stocks?limit=100&offset=0",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      console.log("[Getir API] Response status:", response.status);

      if (response.status === 401) {
        throw new GetirApiError(
          "Token geçersiz. Lütfen Chrome eklentisini kullanarak yeni token ekleyin.",
          401,
          "UNAUTHORIZED"
        );
      }

      if (response.status === 403) {
        throw new GetirApiError(
          "Bu işlem için yetkiniz yok. Lütfen token'ı kontrol edin.",
          403,
          "FORBIDDEN"
        );
      }

      if (response.status === 404) {
        throw new GetirApiError(
          "API endpoint bulunamadı.",
          404,
          "NOT_FOUND"
        );
      }

      if (!response.ok) {
        throw new GetirApiError(
          `API hatası: ${response.status} ${response.statusText}`,
          response.status,
          "API_ERROR"
        );
      }

      const responseData = await response.json();

      console.log("[Getir API] Response data keys:", Object.keys(responseData || {}));
      console.log("[Getir API] Data array length:", responseData?.data?.length || 0);
      console.log("[Getir API] Full response (first 2000 chars):", JSON.stringify(responseData).substring(0, 2000));

      if (
        responseData &&
        typeof responseData === "object" &&
        Array.isArray(responseData.data) &&
        responseData.data.length > 0
      ) {
        const product = responseData.data[0]; // productIds ile filtrelediğimiz için ilk item bizim ürünümüz

        console.log("[Getir API] Product object:", JSON.stringify(product, null, 2).substring(0, 1000));
        console.log("[Getir API] Product available value:", product.available, "Type:", typeof product.available);

        if (product && typeof product.available === "number") {
          console.log("[Getir API] Product found! Available:", product.available);
          return product.available;
        }
      }

      console.log("[Getir API] Product not found or available quantity is missing");
      return null;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new GetirApiError(
          "İstek zaman aşımına uğradı. Lütfen tekrar deneyin.",
          undefined,
          "TIMEOUT"
        );
      }

      if (error instanceof GetirApiError) {
        throw error;
      }

      throw new GetirApiError(
        "Bağlantı hatası. Lütfen internet bağlantınızı kontrol edin ve tekrar deneyin.",
        undefined,
        "NETWORK_ERROR"
      );
    }
  } catch (error) {
    if (error instanceof GetirApiError) {
      throw error;
    }

    console.error("[Getir API] Beklenmeyen hata:", error);
    throw new GetirApiError(
      error instanceof Error ? error.message : "Bilinmeyen hata oluştu.",
      undefined,
      "UNKNOWN_ERROR"
    );
  }
}

/**
 * Getir API'den belirli bir barkod için stok miktarını çeker
 * Önce barkod -> ürün ID mapping'inden ürün ID'sini bulur, sonra hızlı stok sorgulama yapar
 * Eğer mapping'de yoksa, eski yöntemle (pagination) arama yapar
 * @param barcode Ürün barkodu
 * @returns Promise<number | null> Stok miktarı (ürün bulunamazsa veya hata varsa null)
 * @throws GetirApiError Token yoksa veya network hatası varsa
 */
export async function getGetirStock(barcode: string): Promise<number | null> {
  try {
    console.log("[Getir API] Fetching stock for barcode:", barcode);

    // Önce barkod -> ürün ID mapping'inden ürün ID'sini bul
    const productId = await getProductIdByBarcode(barcode);

    if (productId) {
      // Ürün ID'si bulundu - hızlı yöntemle stok sorgula
      console.log(
        "[Getir API] Product ID found in mapping, using fast method:",
        productId
      );
      return await getGetirStockByProductId(productId);
    }

    // Ürün ID'si bulunamadı - eski yöntemle (pagination ile) arama yap
    console.log(
      "[Getir API] Product ID not found in mapping, using slow method (pagination)..."
    );

    // Firebase'den token al
    const token = await getGetirToken();

    if (!token) {
      throw new GetirApiError(
        "Token bulunamadı. Lütfen Chrome eklentisini kullanarak token ekleyin.",
        undefined,
        "NO_TOKEN"
      );
    }

    // Getir API'sine istek at
    const controller = new AbortController();
    // Pagination için daha uzun timeout (her sayfa için ~2-3 saniye, 10 sayfa için ~60 saniye)
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 saniye timeout

    try {
      // Getir API'si POST method kullanıyor ve body formatı:
      // { warehouseIds: ["..."], sort: { available: 1 } }
      // Not: Toplam 4.7 milyon ürün var, bu yüzden pagination yapmamız gerekiyor
      // Ama önce ilk sayfayı çekip, eğer bulamazsak pagination yapacağız
      console.log("[Getir API] Fetching stocks from Getir API...");
      
      const requestBody = {
        warehouseIds: [], // Boş array - tüm warehouse'ları getir
        sort: {
          available: 1, // Stok miktarına göre sırala
        },
      };
      
      // İlk sayfayı çek (limit 1000)
      let offset = 0;
      const limit = 1000;
      let foundProduct: any = null;
      const maxPages = 10; // Maksimum 10 sayfa kontrol et (10,000 ürün) - performans için
      
      for (let page = 0; page < maxPages; page++) {
        console.log(`[Getir API] Fetching page ${page + 1}, offset: ${offset}`);
        
        const response = await fetch(
          `https://franchise-api-gateway.getirapi.com/stocks?limit=${limit}&offset=${offset}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          }
        );
        
        console.log(`[Getir API] Page ${page + 1} - Response status:`, response.status);

        // 401 Unauthorized - Token geçersiz
        if (response.status === 401) {
          throw new GetirApiError(
            "Token geçersiz. Lütfen Chrome eklentisini kullanarak yeni token ekleyin.",
            401,
            "UNAUTHORIZED"
          );
        }

        // 403 Forbidden - Yetki yok
        if (response.status === 403) {
          throw new GetirApiError(
            "Bu işlem için yetkiniz yok. Lütfen token'ı kontrol edin.",
            403,
            "FORBIDDEN"
          );
        }

        // 404 Not Found - Endpoint bulunamadı (nadir)
        if (response.status === 404) {
          throw new GetirApiError(
            "API endpoint bulunamadı.",
            404,
            "NOT_FOUND"
          );
        }

        // Diğer hata durumları
        if (!response.ok) {
          throw new GetirApiError(
            `API hatası: ${response.status} ${response.statusText}`,
            response.status,
            "API_ERROR"
          );
        }

        // Response'u parse et
        const responseData = await response.json();
        
        if (page === 0) {
          // İlk sayfada total bilgisini logla
          console.log("[Getir API] Response data keys:", Object.keys(responseData || {}));
          console.log("[Getir API] Data array length:", responseData?.data?.length || 0);
          console.log("[Getir API] Total products:", responseData?.total || 0);
        }

        // Getir API response formatı: { data: [...], total: number }
        // Her item'da: { available: number, packagingInfo: { "1": { barcodes: [...] }, ... } }
        if (responseData && typeof responseData === "object" && Array.isArray(responseData.data)) {
          // İlk sayfada debug logları
          if (page === 0 && responseData.data.length > 0) {
            const firstItem = responseData.data[0];
            console.log("[Getir API] First item sample:", {
              hasPackagingInfo: !!firstItem.packagingInfo,
              packagingInfoKeys: firstItem.packagingInfo ? Object.keys(firstItem.packagingInfo) : [],
              available: firstItem.available,
            });
          }
          
          // data array'inde barkod'a göre ürün ara
          const product = responseData.data.find((item: any) => {
            // packagingInfo içindeki tüm barcodes array'lerinde barkod ara
            if (item.packagingInfo && typeof item.packagingInfo === "object") {
              for (const key in item.packagingInfo) {
                // "pickingType" gibi özel key'leri atla
                if (key === "pickingType") continue;
                
                const packaging = item.packagingInfo[key];
                if (packaging && Array.isArray(packaging.barcodes)) {
                  const found = packaging.barcodes.some(
                    (b: string) => {
                      const bStr = String(b);
                      const searchStr = String(barcode);
                      // Tam eşleşme veya başta/sonda boşluk olmadan karşılaştır
                      return bStr === searchStr || bStr.trim() === searchStr.trim();
                    }
                  );
                  if (found) {
                    return true;
                  }
                }
              }
            }
            return false;
          });

          if (product && typeof product.available === "number") {
            console.log(`[Getir API] Product found on page ${page + 1}! Available:`, product.available);
            clearTimeout(timeoutId);
            return product.available;
          }
          
          // Bu sayfada bulunamadı - bir sonraki sayfaya geç
          console.log(`[Getir API] Product not found on page ${page + 1} (checked ${responseData.data.length} products)`);
          
          // Eğer bu sayfada hiç ürün yoksa veya total'a ulaştıysak, döngüden çık
          if (responseData.data.length === 0 || offset + limit >= (responseData.total || 0)) {
            console.log("[Getir API] No more pages to check");
            break;
          }
          
          // Bir sonraki sayfaya geç
          offset += limit;
        } else {
          // Response formatı beklenmedik
          console.warn("[Getir API] Unexpected response format");
          break;
        }
      }
      
      // Tüm sayfalar kontrol edildi ama ürün bulunamadı
      clearTimeout(timeoutId);
      console.log("[Getir API] Product not found after checking", maxPages, "pages");
      console.log("[Getir API] Searched barcode:", barcode);

      // Ürün bulunamadı
      return null;
    } catch (error) {
      clearTimeout(timeoutId);

      // AbortError (timeout)
      if (error instanceof Error && error.name === "AbortError") {
        throw new GetirApiError(
          "İstek zaman aşımına uğradı. Lütfen tekrar deneyin.",
          undefined,
          "TIMEOUT"
        );
      }

      // GetirApiError ise direkt throw et
      if (error instanceof GetirApiError) {
        throw error;
      }

      // Network hatası
      throw new GetirApiError(
        "Bağlantı hatası. Lütfen internet bağlantınızı kontrol edin ve tekrar deneyin.",
        undefined,
        "NETWORK_ERROR"
      );
    }
  } catch (error) {
    // GetirApiError ise direkt throw et
    if (error instanceof GetirApiError) {
      throw error;
    }

    // Beklenmeyen hatalar
    console.error("[Getir API] Beklenmeyen hata:", error);
    throw new GetirApiError(
      error instanceof Error ? error.message : "Bilinmeyen hata oluştu.",
      undefined,
      "UNKNOWN_ERROR"
    );
  }
}

/**
 * Getir API'den tüm stokları çeker (opsiyonel - tüm ürünlerin stok bilgisini almak için)
 * @returns Promise<Array<{ barcode: string; quantity: number }> | null>
 */
export async function getAllGetirStocks(): Promise<
  Array<{ barcode: string; quantity: number }> | null
> {
  try {
    const token = await getGetirToken();

    if (!token) {
      throw new GetirApiError(
        "Token bulunamadı. Lütfen Chrome eklentisini kullanarak token ekleyin.",
        undefined,
        "NO_TOKEN"
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(
        "https://franchise-api-gateway.getirapi.com/stocks",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (response.status === 401) {
        throw new GetirApiError(
          "Token geçersiz. Lütfen Chrome eklentisini kullanarak yeni token ekleyin.",
          401,
          "UNAUTHORIZED"
        );
      }

      if (response.status === 403) {
        throw new GetirApiError(
          "Bu işlem için yetkiniz yok.",
          403,
          "FORBIDDEN"
        );
      }

      if (!response.ok) {
        throw new GetirApiError(
          `API hatası: ${response.status}`,
          response.status,
          "API_ERROR"
        );
      }

      const data = await response.json();

      // Response formatını parse et
      if (Array.isArray(data)) {
        return data
          .filter((item: any) => item.barcode && typeof item.quantity === "number")
          .map((item: any) => ({
            barcode: String(item.barcode),
            quantity: item.quantity,
          }));
      } else if (data && Array.isArray(data.stocks)) {
        return data.stocks
          .filter((item: any) => item.barcode && typeof item.quantity === "number")
          .map((item: any) => ({
            barcode: String(item.barcode),
            quantity: item.quantity,
          }));
      }

      return null;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new GetirApiError("İstek zaman aşımına uğradı.", undefined, "TIMEOUT");
      }

      if (error instanceof GetirApiError) {
        throw error;
      }

      throw new GetirApiError(
        "Bağlantı hatası. Lütfen internet bağlantınızı kontrol edin.",
        undefined,
        "NETWORK_ERROR"
      );
    }
  } catch (error) {
    if (error instanceof GetirApiError) {
      throw error;
    }

    console.error("[Getir API] Beklenmeyen hata:", error);
    throw new GetirApiError(
      error instanceof Error ? error.message : "Bilinmeyen hata oluştu.",
      undefined,
      "UNKNOWN_ERROR"
    );
  }
}


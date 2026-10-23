import { getActiveWarehouseId, getGetirWarehouseToken } from "./getirTokenService";
import { GetirWarehouseApiError } from "./getirWarehouseApiService";
import {
  IstanbulDayBoundsError,
  buildRemoveFromSaleDateRange,
} from "./istanbulDayBounds";
import {
  groupExpiryRowsByProduct,
  normalizeWarehouseProductId,
  parseWarehouseExpiringProductsPayload,
  warehouseExpiryCalendarHasProductId,
  warehouseExpiryPayloadHasUnfetchedPages,
  type ProductExpiryStock,
  type WarehouseExpiryCalendarRow,
} from "./warehouseExpiringProductsParse";

export type { ProductExpiryStock, WarehouseExpiryCalendarRow };

/** Diğer warehouse GET/POST’larla aynı bant: 10–20 sn. */
const FETCH_TIMEOUT_MS = 15000;
const CALENDAR_UNAVAILABLE = "Depo takvimi alınamadı";

const WAREHOUSE_HEADERS = {
  "Content-Type": "application/json",
  countrycode: "TR",
  language: "tr",
  "x-requester-client": "warehouse-panel-frontend",
};

export { parseWarehouseExpiringProductsPayload, warehouseExpiryCalendarHasProductId };

export async function fetchExpiringProductsForRemovalDate(
  ymd: string
): Promise<WarehouseExpiryCalendarRow[]> {
  let body: ReturnType<typeof buildRemoveFromSaleDateRange>;
  try {
    body = buildRemoveFromSaleDateRange(ymd);
  } catch (error) {
    const message =
      error instanceof IstanbulDayBoundsError
        ? error.message
        : "Geçersiz tarih.";
    throw new GetirWarehouseApiError(message, 400, "BAD_DATE");
  }

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
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://warehouse-panel-api-gateway.getirapi.com/warehouse/${warehouseId}/get-expiring-products`,
      {
        method: "POST",
        headers: {
          ...WAREHOUSE_HEADERS,
          Authorization: `Bearer ${token}`,
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
        `API hatası: ${response.status}${
          errorText ? ` - ${errorText.slice(0, 220)}` : ""
        }`,
        response.status,
        "API_ERROR"
      );
    }

    const payload: unknown = await response.json();
    if (warehouseExpiryPayloadHasUnfetchedPages(payload)) {
      throw new GetirWarehouseApiError(
        CALENDAR_UNAVAILABLE,
        undefined,
        "INCOMPLETE_CALENDAR"
      );
    }
    return parseWarehouseExpiringProductsPayload(payload);
  } catch (error) {
    if (error instanceof GetirWarehouseApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new GetirWarehouseApiError(CALENDAR_UNAVAILABLE, undefined, "TIMEOUT");
    }
    throw new GetirWarehouseApiError(
      CALENDAR_UNAVAILABLE,
      undefined,
      "FETCH_ERROR"
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Ürün bazlı sorguda satıştan kaldırma tarihi aralığı: geçmişte kalmış ama raftaki dahil, uzak gelecek dahil */
const EXPIRY_STOCK_RANGE_START = "2020-01-01T00:00:00.000Z";
const EXPIRY_STOCK_RANGE_YEARS = 10;
export const EXPIRY_STOCK_MAX_PRODUCTS = 100;

/**
 * Verilen ürünlerin SKT kayıtlarından tarih bazlı stok (depo paneli "Ürün Son Kullanma
 * Tarihleri" sayfasındaki ürün filtresiyle aynı istek). Getir sayım açıkken bayi stoğunu
 * gizliyor ama bu kaydı gizlemiyor. SKT takibi olmayan ürün sonuçta yer almaz.
 */
export async function fetchExpiryStocks(
  productIds: readonly string[]
): Promise<Map<string, ProductExpiryStock>> {
  const ids = [...new Set(productIds.map((id) => normalizeWarehouseProductId(id)).filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  if (ids.length > EXPIRY_STOCK_MAX_PRODUCTS) {
    throw new GetirWarehouseApiError(`En fazla ${EXPIRY_STOCK_MAX_PRODUCTS} ürün sorgulanabilir.`, 400, "TOO_MANY");
  }

  const token = await getGetirWarehouseToken();
  if (!token) {
    throw new GetirWarehouseApiError(
      "Depo paneli token'ı yok. warehouse.getir.com'u açıp giriş yapın.",
      401,
      "NO_TOKEN"
    );
  }
  const warehouseId = await getActiveWarehouseId();
  const end = new Date();
  end.setUTCFullYear(end.getUTCFullYear() + EXPIRY_STOCK_RANGE_YEARS);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://warehouse-panel-api-gateway.getirapi.com/warehouse/${warehouseId}/get-expiring-products`,
      {
        method: "POST",
        headers: { ...WAREHOUSE_HEADERS, Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          productIds: ids,
          removeFromSaleDateRange: { startDate: EXPIRY_STOCK_RANGE_START, endDate: end.toISOString() },
        }),
        signal: controller.signal,
      }
    );
    if (response.status === 401) {
      throw new GetirWarehouseApiError(
        "Depo paneli token'ının süresi dolmuş. warehouse.getir.com'u açıp sayfayı yenileyin.",
        401,
        "UNAUTHORIZED"
      );
    }
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("[Expiry Stock] Getir hatası:", response.status, errorText.slice(0, 300));
      throw new GetirWarehouseApiError(`SKT kayıtları alınamadı (HTTP ${response.status}).`, response.status, "API_ERROR");
    }
    const payload: unknown = await response.json();
    if (warehouseExpiryPayloadHasUnfetchedPages(payload)) {
      console.warn("[Expiry Stock] Getir cevabı sayfalı geldi; ilk sayfa kullanılıyor");
    }
    return groupExpiryRowsByProduct(parseWarehouseExpiringProductsPayload(payload));
  } catch (error) {
    if (error instanceof GetirWarehouseApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new GetirWarehouseApiError("Depo paneli zamanında yanıt vermedi.", 504, "TIMEOUT");
    }
    throw new GetirWarehouseApiError("Depo paneline bağlanılamadı.", 502, "NETWORK");
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function isProductOnWarehouseExpiryCalendar(
  productId: string,
  ymd: string
): Promise<boolean> {
  const id = productId.trim();
  if (!id) return false;
  const rows = await fetchExpiringProductsForRemovalDate(ymd);
  return warehouseExpiryCalendarHasProductId(rows, id);
}

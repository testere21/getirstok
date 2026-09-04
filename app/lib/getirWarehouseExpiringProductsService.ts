import { getActiveWarehouseId, getGetirWarehouseToken } from "./getirTokenService";
import { GetirWarehouseApiError } from "./getirWarehouseApiService";
import {
  IstanbulDayBoundsError,
  buildRemoveFromSaleDateRange,
} from "./istanbulDayBounds";
import {
  parseWarehouseExpiringProductsPayload,
  warehouseExpiryCalendarHasProductId,
  warehouseExpiryPayloadHasUnfetchedPages,
  type WarehouseExpiryCalendarRow,
} from "./warehouseExpiringProductsParse";

export type { WarehouseExpiryCalendarRow };

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

export async function isProductOnWarehouseExpiryCalendar(
  productId: string,
  ymd: string
): Promise<boolean> {
  const id = productId.trim();
  if (!id) return false;
  const rows = await fetchExpiringProductsForRemovalDate(ymd);
  return warehouseExpiryCalendarHasProductId(rows, id);
}

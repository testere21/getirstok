import { getProductIdByBarcode } from "./barcodeProductMappingService";
import { getProductIdFromMergedCatalog } from "./catalogProductIdResolver";
import { GetirWarehouseApiError } from "./getirWarehouseApiService";
import { isProductOnWarehouseExpiryCalendar } from "./getirWarehouseExpiringProductsService";
import { normalizeWarehouseProductId } from "./warehouseExpiringProductsParse";

export async function resolveCatalogProductId(
  barcode: string
): Promise<string | null> {
  const trimmed = barcode.trim();
  if (!trimmed) return null;
  const fromMapping = await getProductIdByBarcode(trimmed);
  if (fromMapping?.trim()) return fromMapping.trim();
  const fromCatalog = await getProductIdFromMergedCatalog(trimmed);
  return fromCatalog?.trim() || null;
}

/**
 * Firestore yazmadan önce: Getir id + depo SKT takvimi.
 * Takvimde varsa veya Getir çağrısı başarısızsa fırlatır.
 */
export async function assertCanSaveExpiringAgainstWarehouse(
  barcode: string,
  removalDateYmd: string
): Promise<void> {
  const rawId = await resolveCatalogProductId(barcode);
  const productId = rawId ? normalizeWarehouseProductId(rawId) : null;
  if (!productId) {
    throw new GetirWarehouseApiError(
      "Bu ürünün Getir id'si yok, katalogu güncelleyin.",
      400,
      "NO_PRODUCT_ID"
    );
  }

  const onCalendar = await isProductOnWarehouseExpiryCalendar(
    productId,
    removalDateYmd
  );
  if (onCalendar) {
    throw new GetirWarehouseApiError(
      "Bu ürün zaten skt takviminde var!",
      400,
      "ALREADY_ON_WAREHOUSE_CALENDAR"
    );
  }
}

export function httpStatusForWarehouseGuardError(
  error: GetirWarehouseApiError
): number {
  if (error.code === "UNAUTHORIZED") return 401;
  if (error.code === "FORBIDDEN") return 403;
  if (
    error.statusCode &&
    error.statusCode >= 400 &&
    error.statusCode < 600
  ) {
    return error.statusCode;
  }
  return 400;
}

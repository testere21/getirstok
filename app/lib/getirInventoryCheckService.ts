import { getGetirWarehouseToken } from "./getirTokenService";
import { GetirWarehouseApiError } from "./getirWarehouseApiService";
import { FRANCHISE_WAREHOUSE_ID_SOGUKKUYU } from "./types";

const INVENTORY_CHECK_URL =
  "https://warehouse-panel-api-gateway.getirapi.com/gstore-inventory-checks";

/** Depo panelinde Kapsam = "Kısmi" */
const SCOPE_PARTIAL = "200";

/** Neden: "Stoklara dair şüphelerim var ve stoklarımı kontrol etmek istiyorum." */
const REASON_STOCK_SUSPICION = 10;

const TIMEOUT_MS = 15000;

/** Getir sayım kimlikleri 24 haneli hex (MongoDB ObjectId) */
const INVENTORY_CHECK_ID_RE = /^[a-f0-9]{24}$/i;

export function isValidInventoryCheckId(id: string): boolean {
  return INVENTORY_CHECK_ID_RE.test(id);
}

function getirErrorMessage(json: unknown, fallback: string): string {
  if (!json || typeof json !== "object") return fallback;
  const o = json as Record<string, unknown>;
  const result = o.result as Record<string, unknown> | undefined;
  const error = o.error as Record<string, unknown> | undefined;
  for (const v of [result?.message, o.message, error?.message]) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return fallback;
}

type GetirPostMessages = {
  logLabel: string;
  timeout: string;
  forbidden: string;
  rejected: string;
};

/** Depo paneli gateway'ine POST atar; hata durumlarını GetirWarehouseApiError'a çevirir. */
async function postToWarehouseGateway(
  url: string,
  body: unknown,
  messages: GetirPostMessages
): Promise<{ json: unknown; text: string }> {
  const token = await getGetirWarehouseToken();
  if (!token) {
    throw new GetirWarehouseApiError(
      "Depo paneli token'ı yok. warehouse.getir.com'u açıp giriş yapın.",
      401,
      "NO_TOKEN"
    );
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    countrycode: "TR",
    language: "tr",
    "x-requester-client": "warehouse-panel-frontend",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    // İstek Getir'e ulaşmış olabilir; körlemesine tekrar denemek çift sayım açar
    if (error instanceof Error && error.name === "AbortError") {
      throw new GetirWarehouseApiError(messages.timeout, 504, "TIMEOUT");
    }
    throw new GetirWarehouseApiError(
      "Depo paneline bağlanılamadı. İnternet bağlantısını kontrol edip tekrar deneyin.",
      502,
      "NETWORK"
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (response.status === 401) {
    throw new GetirWarehouseApiError(
      "Depo paneli token'ının süresi dolmuş. warehouse.getir.com'u açıp sayfayı yenileyin, sonra tekrar deneyin.",
      401,
      "UNAUTHORIZED"
    );
  }
  if (response.status === 403) {
    throw new GetirWarehouseApiError(messages.forbidden, 403, "FORBIDDEN");
  }

  const resultCode = (json as { result?: { code?: unknown } } | null)?.result?.code;
  if (!response.ok || (typeof resultCode === "number" && resultCode !== 0)) {
    console.error(
      `[Getir Inventory Check] ${messages.logLabel}:`,
      response.status,
      text.slice(0, 500)
    );
    throw new GetirWarehouseApiError(
      getirErrorMessage(json, `${messages.rejected} (HTTP ${response.status}).`),
      response.ok ? 422 : response.status,
      "GETIR_REJECTED"
    );
  }

  return { json, text };
}

/**
 * Depo panelinde verilen ürünlerle tek bir kısmi sayım açar.
 * Açılan sayım "Yeni" durumundadır; görevler `approveInventoryCheck` sonrası oluşur.
 * @returns Açılan sayımın kimliği (`inventoryCheckId`)
 * @throws GetirWarehouseApiError Token yoksa, süresi dolmuşsa veya Getir reddederse
 */
export async function createInventoryCheck(productIds: string[]): Promise<string> {
  if (productIds.length === 0) {
    throw new GetirWarehouseApiError("Sayım için en az bir ürün seçin.", 400, "EMPTY");
  }

  const { json, text } = await postToWarehouseGateway(
    INVENTORY_CHECK_URL,
    {
      scope: SCOPE_PARTIAL,
      productIds,
      reason: { type: REASON_STOCK_SUSPICION },
      warehouseId: FRANCHISE_WAREHOUSE_ID_SOGUKKUYU,
    },
    {
      logLabel: "Sayım açılamadı",
      timeout:
        "Depo paneli zamanında yanıt vermedi. Sayım açılmış olabilir; tekrar denemeden önce depo panelindeki sayım listesine bakın.",
      forbidden: "Depo panelinde sayım açma yetkiniz yok.",
      rejected: "Sayım açılamadı",
    }
  );

  const inventoryCheckId = (json as { data?: { inventoryCheckId?: unknown } } | null)
    ?.data?.inventoryCheckId;
  if (typeof inventoryCheckId !== "string" || !inventoryCheckId) {
    console.error("[Getir Inventory Check] Beklenmeyen cevap:", text.slice(0, 500));
    throw new GetirWarehouseApiError(
      "Depo paneli sayım numarası döndürmedi. Sayım açılmış olabilir; depo panelindeki sayım listesine bakın.",
      502,
      "NO_ID"
    );
  }

  return inventoryCheckId;
}

/**
 * Depo panelindeki "Onayla" butonunun karşılığı: sayım "Yeni" → "Hazır" olur, görevler oluşur.
 * @throws GetirWarehouseApiError Token yoksa, süresi dolmuşsa veya Getir reddederse
 */
export async function approveInventoryCheck(inventoryCheckId: string): Promise<void> {
  if (!isValidInventoryCheckId(inventoryCheckId)) {
    throw new GetirWarehouseApiError("Geçersiz sayım numarası.", 400, "INVALID_ID");
  }

  try {
    await postToWarehouseGateway(
      `${INVENTORY_CHECK_URL}/${inventoryCheckId}/approve`,
      undefined,
      {
        logLabel: "Sayım onaylanamadı",
        timeout:
          "Depo paneli zamanında yanıt vermedi. Sayım onaylanmış olabilir; depo panelinde sayımın durumuna bakın.",
        forbidden: "Depo panelinde sayım onaylama yetkiniz yok.",
        rejected: "Sayım onaylanamadı",
      }
    );
  } catch (error) {
    // Getir, "Yeni" olmayan sayım için "Sayım durumu uygun değil!" döner
    if (error instanceof GetirWarehouseApiError && error.code === "GETIR_REJECTED") {
      throw new GetirWarehouseApiError(
        `${error.message} Sayım zaten onaylanmış ya da iptal edilmiş olabilir; depo panelinde durumuna bakın.`,
        error.statusCode,
        error.code
      );
    }
    throw error;
  }
}

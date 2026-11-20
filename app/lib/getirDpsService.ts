/**
 * Bayi paneli → Performans & Takip → DPS isteği (`/wps/criteria`).
 * Getir puanları her istekte baştan hesaplıyor (3–6 sn); sonuç Firestore'da saklanır.
 */
import { getGetirFranchiseToken } from "./getirTokenService";
import { DEFAULT_PANEL_WAREHOUSE_ID } from "./franchiseWarehouses";
import { parseDpsCriteria, type DpsParseResult } from "./dpsParse";

const CRITERIA_URL = "https://franchise-api-gateway.getirapi.com/wps/criteria";
const TIMEOUT_MS = 25000;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export class DpsApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string
  ) {
    super(message);
    this.name = "DpsApiError";
  }
}

export interface DpsRequest {
  /** İstanbul günü, YYYY-MM-DD */
  from: string;
  to: string;
  /** Sıralama + etraftaki depolar da gelsin (`isRanked=true`) */
  ranked?: boolean;
  /** Panelde tanımlı depo (çağıran doğrular); verilmezse Soğukkuyu */
  warehouseId?: string;
}

/**
 * Bir deponun (varsayılan Soğukkuyu) verilen aralıktaki DPS puanlarını Getir'den çeker.
 * Bayi paneli token'ı tek hesap; iki depo da aynı token'la sorgulanır.
 * @returns `{ empty: true }` Getir o aralığı henüz hesaplamadıysa (ör. bugün)
 * @throws DpsApiError Token yok/geçersiz, yetki yok, zaman aşımı veya Getir hatası
 */
export async function fetchDpsCriteria(request: DpsRequest): Promise<DpsParseResult> {
  if (!YMD_RE.test(request.from) || !YMD_RE.test(request.to)) {
    throw new DpsApiError("Tarih YYYY-MM-DD biçiminde olmalı.", 400, "BAD_DATE");
  }

  const warehouseId = request.warehouseId ?? DEFAULT_PANEL_WAREHOUSE_ID;
  const token = await getGetirFranchiseToken();
  if (!token) {
    throw new DpsApiError(
      "Bayi paneli token'ı yok. franchise-v2.getir.com'u bir kez açıp giriş yapın.",
      401,
      "NO_TOKEN"
    );
  }

  const params = new URLSearchParams({
    startDate: request.from,
    endDate: request.to,
    warehouseId,
    isRanked: request.ranked ? "true" : "false",
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${CRITERIA_URL}?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new DpsApiError("Getir DPS puanlarını zamanında hesaplamadı, tekrar deneyin.", 504, "TIMEOUT");
    }
    throw new DpsApiError(
      "Getir'e bağlanılamadı. İnternet bağlantısını kontrol edip tekrar deneyin.",
      502,
      "NETWORK"
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();
  if (response.status === 401) {
    throw new DpsApiError(
      "Bayi paneli token'ının süresi dolmuş. franchise-v2.getir.com'u bir kez açın, sonra tekrar deneyin.",
      401,
      "UNAUTHORIZED"
    );
  }
  if (response.status === 403) {
    throw new DpsApiError("Bayi panelinde DPS ekranına erişim yetkiniz yok.", 403, "FORBIDDEN");
  }
  if (!response.ok) {
    console.error("[DPS] Getir hatası:", response.status, text.slice(0, 300));
    throw new DpsApiError(`Getir DPS isteğini reddetti (HTTP ${response.status}).`, response.status, "GETIR_REJECTED");
  }

  let json: unknown;
  try {
    json = text ? JSON.parse(text) : [];
  } catch {
    throw new DpsApiError("Getir'den okunamayan bir DPS cevabı geldi.", 502, "BAD_RESPONSE");
  }
  return parseDpsCriteria(json, warehouseId);
}

/**
 * Bayi panelindeki hazır DPS raporlarını listeler ve indirir.
 * Rapor istenmez; sadece var olanlar okunur.
 */
import { getGetirFranchiseToken } from "./getirTokenService";
const GATEWAY = "https://franchise-api-gateway.getirapi.com";
const LIST_URL = `${GATEWAY}/generic-report/report-request/list`;

/** Rapor listesindeki `report._id`: "DPS Raporu" */
export const DPS_REPORT_TYPE_ID = "66cc681ad215637a816ebff5";
const DPS_REPORT_KEY = "sps_report.py";
/** Rapor listesinde "Hazır" */
const STATUS_READY = 1;

const PAGE_SIZE = 50;
const MAX_PAGES = 20;
const TIMEOUT_MS = 15000;
const DOWNLOAD_TIMEOUT_MS = 30000;
/** Bir DPS dosyası ~250 KB; bunun çok üstü beklenmedik */
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const REPORT_ID_RE = /^[a-f0-9]{24}$/i;

export class DpsReportApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string
  ) {
    super(message);
    this.name = "DpsReportApiError";
  }
}

export interface DpsReportSummary {
  id: string;
  downloadToken: string;
  warehouseIds: string[];
  startDate: string | null;
  endDate: string | null;
  createdAt: string | null;
}

/** Bayi token'ını okur; aynı istekte liste + indirme için bir kez okuyup ikisine de verin. */
export async function requireFranchiseToken(): Promise<string> {
  const token = await getGetirFranchiseToken();
  if (!token) {
    throw new DpsReportApiError(
      "Bayi paneli token'ı yok. franchise-v2.getir.com'u bir kez açıp giriş yapın.",
      401,
      "NO_TOKEN"
    );
  }
  return token;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new DpsReportApiError("Getir zamanında yanıt vermedi, tekrar deneyin.", 504, "TIMEOUT");
    }
    throw new DpsReportApiError(
      "Getir'e bağlanılamadı. İnternet bağlantısını kontrol edip tekrar deneyin.",
      502,
      "NETWORK"
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function gatewayJson(url: string, init: RequestInit, token: string): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetchWithTimeout(url, { ...init, headers }, TIMEOUT_MS);
  const text = await response.text();

  if (response.status === 401) {
    throw new DpsReportApiError(
      "Bayi paneli token'ının süresi dolmuş. franchise-v2.getir.com'u bir kez açın, sonra tekrar deneyin.",
      401,
      "UNAUTHORIZED"
    );
  }
  if (response.status === 403) {
    throw new DpsReportApiError("Bayi panelinde raporlara erişim yetkiniz yok.", 403, "FORBIDDEN");
  }
  if (!response.ok) {
    console.error("[DPS Report] Getir hatası:", response.status, url, text.slice(0, 300));
    throw new DpsReportApiError(
      `Getir rapor isteğini reddetti (HTTP ${response.status}).`,
      response.status,
      "GETIR_REJECTED"
    );
  }
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new DpsReportApiError("Getir'den okunamayan bir cevap geldi.", 502, "BAD_RESPONSE");
  }
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

function toSummary(item: unknown): DpsReportSummary | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const report = (o.report ?? {}) as Record<string, unknown>;
  const isDps = report._id === DPS_REPORT_TYPE_ID || o.reportKey === DPS_REPORT_KEY;
  if (!isDps || o.status !== STATUS_READY) return null;

  const id = asString(o._id);
  const downloadToken = asString(o.downloadToken);
  if (!id || !REPORT_ID_RE.test(id) || !downloadToken) return null;

  const body = (o.dataReportRequestBody ?? {}) as Record<string, unknown>;
  const warehouseIds = Array.isArray(body.warehouse_ids)
    ? body.warehouse_ids.filter((w): w is string => typeof w === "string")
    : [];

  return {
    id,
    downloadToken,
    warehouseIds,
    startDate: asString(body.start_date),
    endDate: asString(body.end_date),
    createdAt: asString(o.createdAt),
  };
}

/** Hazır DPS raporlarını (en yeni önce) döndürür. Diğer rapor tipleri atlanır. */
export async function listDpsReports(token?: string): Promise<DpsReportSummary[]> {
  token ??= await requireFranchiseToken();
  const reports: DpsReportSummary[] = [];
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const json = (await gatewayJson(
      `${LIST_URL}?limit=${PAGE_SIZE}&offset=${offset}`,
      { method: "POST", body: "{}" },
      token
    )) as { data?: unknown; totalCount?: unknown } | null;

    const items = Array.isArray(json?.data) ? json.data : [];
    for (const item of items) {
      const summary = toSummary(item);
      if (summary) reports.push(summary);
    }
    offset += items.length;
    const total = typeof json?.totalCount === "number" ? json.totalCount : 0;
    if (items.length === 0 || offset >= total) break;
  }

  return reports.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

/** Cevabın içindeki ilk https adresi (alan adı değişse de çalışsın diye yapıya bağlı değil). */
function findFirstHttpsUrl(node: unknown): string | null {
  if (typeof node === "string") return node.startsWith("https://") ? node : null;
  if (Array.isArray(node)) {
    for (const v of node) {
      const found = findFirstHttpsUrl(v);
      if (found) return found;
    }
    return null;
  }
  if (node && typeof node === "object") {
    for (const v of Object.values(node)) {
      const found = findFirstHttpsUrl(v);
      if (found) return found;
    }
  }
  return null;
}

/** Sunucumuz sadece Getir'in S3 rapor deposundan dosya indirsin */
function isAllowedReportFileUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname.endsWith(".amazonaws.com");
  } catch {
    return false;
  }
}

async function getDownloadUrl(report: DpsReportSummary, token: string): Promise<string> {
  const json = await gatewayJson(
    `${GATEWAY}/generic-report/${report.id}/download-url/${encodeURIComponent(report.downloadToken)}`,
    { method: "GET" },
    token
  );
  const url = findFirstHttpsUrl(json);
  if (!url || !isAllowedReportFileUrl(url)) {
    console.error("[DPS Report] İndirme adresi bulunamadı:", report.id, JSON.stringify(json).slice(0, 300));
    throw new DpsReportApiError(
      "Getir rapor dosyasının adresini vermedi. Rapor biçimi değişmiş olabilir.",
      502,
      "NO_DOWNLOAD_URL"
    );
  }
  return url;
}

/** Raporun .xlsx dosyasını indirir. */
export async function downloadDpsReport(
  report: DpsReportSummary,
  token?: string
): Promise<ArrayBuffer> {
  token ??= await requireFranchiseToken();
  const url = await getDownloadUrl(report, token);

  const response = await fetchWithTimeout(url, { method: "GET" }, DOWNLOAD_TIMEOUT_MS);
  if (response.status === 403 || response.status === 404) {
    throw new DpsReportApiError(
      "Rapor dosyası bulunamadı. Getir dosyaları 8 gün sonra siliyor; rapor eskimiş olabilir.",
      410,
      "FILE_GONE"
    );
  }
  if (!response.ok) {
    throw new DpsReportApiError(
      `Rapor dosyası indirilemedi (HTTP ${response.status}).`,
      502,
      "DOWNLOAD_FAILED"
    );
  }
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_FILE_BYTES) {
    throw new DpsReportApiError("Rapor dosyası beklenenden çok büyük.", 413, "FILE_TOO_LARGE");
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_FILE_BYTES) {
    throw new DpsReportApiError("Rapor dosyası beklenenden çok büyük.", 413, "FILE_TOO_LARGE");
  }
  return buffer;
}

import { getGetirWarehouseToken } from "./getirTokenService";
import { GetirWarehouseApiError } from "./getirWarehouseApiService";
import type { WarehouseTransferCapture } from "./warehouseTransferCaptureService";

export type TransferListRow = {
  id: string | null;
  transferOrderNumber: string | null;
  inboundDeliveryId: string | null;
  palletStatus: string | null;
  skuCount: number | null;
  palletCodes: string[];
};

export type TransferProductRow = {
  name: string | null;
  barcode: string | null;
  quantity: number | null;
  palletCodes: string[];
  rawKeys: string[];
};

const WAREHOUSE_HEADERS = {
  "Content-Type": "application/json",
  countrycode: "TR",
  language: "tr",
  "x-requester-client": "warehouse-panel-frontend",
};

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const n = Number(value.replace(",", "."));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function collectPalletCodes(node: unknown, out: Set<string>, depth = 0): void {
  if (depth > 6 || node == null) return;
  if (typeof node === "string") {
    const trimmed = node.trim();
    if (/^K\d{6,}$/i.test(trimmed)) out.add(trimmed.toUpperCase());
    return;
  }
  if (typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectPalletCodes(item, out, depth + 1);
    return;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (/pallet|palet|containerBarcode|sscc/i.test(key) && typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) out.add(trimmed);
    }
    collectPalletCodes(value, out, depth + 1);
  }
}

function unwrapData(data: unknown): unknown {
  let current = data;
  for (let i = 0; i < 6; i++) {
    if (
      current &&
      typeof current === "object" &&
      !Array.isArray(current) &&
      "data" in current &&
      (current as { data: unknown }).data &&
      typeof (current as { data: unknown }).data === "object"
    ) {
      current = (current as { data: unknown }).data;
      continue;
    }
    break;
  }
  return current;
}

function objectArrays(node: unknown, depth = 0, acc: Record<string, unknown>[][] = []): Record<string, unknown>[][] {
  if (depth > 8 || node == null || typeof node !== "object") return acc;
  if (Array.isArray(node)) {
    const objs = node.filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object" && !Array.isArray(item)
    );
    if (objs.length > 0) acc.push(objs);
    for (const item of node) objectArrays(item, depth + 1, acc);
    return acc;
  }
  for (const value of Object.values(node)) {
    objectArrays(value, depth + 1, acc);
  }
  return acc;
}

function looksLikeTransferRow(row: Record<string, unknown>): boolean {
  const keys = Object.keys(row).join(" ");
  return /transfer|delivery|inbound|pallet|sku|sipariş|orderNumber/i.test(keys);
}

function looksLikeProductRow(row: Record<string, unknown>): boolean {
  const keys = Object.keys(row).join(" ");
  if (/barcode|productName|product\.|sku/i.test(keys)) return true;
  if (row.name && (row.barcode || row.quantity || row.amount || row.count)) return true;
  return false;
}

export function parseTransferListRows(payload: unknown): TransferListRow[] {
  const arrays = objectArrays(unwrapData(payload));
  const ranked = [...arrays].sort((a, b) => b.length - a.length);
  const chosen =
    ranked.find((arr) => arr.filter(looksLikeTransferRow).length >= Math.min(2, arr.length)) ||
    ranked[0] ||
    [];

  return chosen.map((row) => {
    const palletCodes = new Set<string>();
    collectPalletCodes(row, palletCodes);
    return {
      id: pickString(row, ["id", "_id", "transferId", "deliveryId"]),
      transferOrderNumber: pickString(row, [
        "transferOrderNumber",
        "transferOrderNo",
        "orderNumber",
        "code",
        "uniqueCode",
      ]),
      inboundDeliveryId: pickString(row, [
        "inboundDeliveryId",
        "inboundDeliveryID",
        "deliveryId",
        "entryDeliveryId",
      ]),
      palletStatus: pickString(row, ["palletStatus", "status", "palletState"]),
      skuCount: pickNumber(row, [
        "totalSkuCount",
        "skuCount",
        "totalSKU",
        "sentQuantity",
        "quantity",
      ]),
      palletCodes: [...palletCodes],
    };
  });
}

export function parseTransferProductRows(payload: unknown): TransferProductRow[] {
  const arrays = objectArrays(unwrapData(payload));
  const ranked = [...arrays].sort((a, b) => b.length - a.length);
  const chosen =
    ranked.find((arr) => arr.filter(looksLikeProductRow).length >= Math.min(1, arr.length)) ||
    ranked.find((arr) => arr.some(looksLikeProductRow)) ||
    [];

  const products = chosen.filter(looksLikeProductRow);
  const source = products.length > 0 ? products : chosen;

  return source.map((row) => {
    const nestedProduct =
      row.product && typeof row.product === "object" && !Array.isArray(row.product)
        ? (row.product as Record<string, unknown>)
        : null;
    const nameSource = nestedProduct || row;
    const palletCodes = new Set<string>();
    collectPalletCodes(row, palletCodes);
    return {
      name: pickString(nameSource, ["name", "fullName", "productName", "title"]),
      barcode: pickString(nameSource, ["barcode", "masterBarcode", "barcodes"]) ||
        (Array.isArray(nameSource.barcodes)
          ? String(nameSource.barcodes[0] || "")
          : null) ||
        pickString(row, ["barcode", "productBarcode"]),
      quantity: pickNumber(row, [
        "quantity",
        "sentQuantity",
        "receivedQuantity",
        "amount",
        "count",
        "qty",
      ]),
      palletCodes: [...palletCodes],
      rawKeys: Object.keys(row).slice(0, 24),
    };
  });
}

export async function replayWarehouseTransferCapture(
  capture: WarehouseTransferCapture
): Promise<unknown> {
  const token = await getGetirWarehouseToken();
  if (!token) {
    throw new GetirWarehouseApiError(
      "Depo paneli token'ı bulunamadı. Transfer listesini açık tutup eklentiyi yenileyin.",
      undefined,
      "NO_TOKEN"
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);
  const method = capture.method === "POST" ? "POST" : "GET";
  const headers: Record<string, string> = {
    ...WAREHOUSE_HEADERS,
    Authorization: `Bearer ${token}`,
  };
  if (method === "GET") {
    delete headers["Content-Type"];
  }

  try {
    const response = await fetch(capture.url, {
      method,
      headers,
      body: method === "POST" && capture.requestBody ? capture.requestBody : undefined,
      signal: controller.signal,
    });

    if (response.status === 401) {
      throw new GetirWarehouseApiError(
        "Depo paneli token'ı geçersiz. Depo panelinde Transfer Teslimat Listesi'ni yenileyin.",
        401,
        "UNAUTHORIZED"
      );
    }
    if (response.status === 403) {
      throw new GetirWarehouseApiError(
        "Bu işlem için yetkiniz yok.",
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

    return await response.json();
  } catch (error) {
    if (error instanceof GetirWarehouseApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new GetirWarehouseApiError(
        "İstek zaman aşımına uğradı.",
        undefined,
        "TIMEOUT"
      );
    }
    throw new GetirWarehouseApiError(
      `Transfer isteği başarısız: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      undefined,
      "FETCH_ERROR"
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

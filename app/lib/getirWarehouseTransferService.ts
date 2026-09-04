import { getCatalogInfoByProductIds } from "./catalogProductIdResolver";
import { getGetirWarehouseToken } from "./getirTokenService";
import { GetirWarehouseApiError } from "./getirWarehouseApiService";
import { istanbulDayToUtcIsoRange, IstanbulDayBoundsError } from "./istanbulDayBounds";
import {
  getWarehouseTransferCapture,
  isInboundTransferListUrl,
  type WarehouseTransferCapture,
} from "./warehouseTransferCaptureService";

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
  productId: string | null;
  transferOrderNumbers: string[];
};

/** Liste POST gövdesindeki tarih alanı (query string'de yok). */
export const TRANSFER_LIST_DATE_FIELD = "createdAt";
export const TRANSFER_LIST_DATE_SHAPE =
  "createdAt: { startDate, endDate } ISO UTC — İstanbul günü 00:00:00+03:00 … 23:59:59.999+03:00. Sayfalama: URL query offset & limit.";

export const TRANSFER_DELIVERY_FETCH_CAP = 20;

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

function peelPayloadRoots(payload: unknown): unknown[] {
  const roots: unknown[] = [payload];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return roots;
  }
  const o = payload as Record<string, unknown>;
  for (const key of ["data", "result", "payload", "body"]) {
    const v = o[key];
    if (v && typeof v === "object") roots.push(v);
  }
  return roots;
}

function unwrapData(data: unknown): unknown {
  let current = data;
  for (let i = 0; i < 8; i++) {
    if (!current || typeof current !== "object" || Array.isArray(current)) break;
    const o = current as Record<string, unknown>;
    const next = o.data ?? o.result;
    if (next && typeof next === "object") {
      current = next;
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

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

function looksLikeProductRow(row: Record<string, unknown>): boolean {
  if (row.product && typeof row.product === "object") return true;
  if (row.item && typeof row.item === "object") return true;
  const keys = Object.keys(row).join(" ");
  if (/barcode|productName|itemName|fullName|product\.|sku|ean|gtin|good/i.test(keys)) {
    return true;
  }
  if (row.orderedCount != null || row.receivedCount != null) return true;
  return false;
}

function pickProductId(row: Record<string, unknown>): string | null {
  const nested =
    nestedRecord(row, "product") ||
    nestedRecord(row, "item") ||
    nestedRecord(row, "sku");
  for (const source of [nested, row]) {
    if (!source) continue;
    const id = pickString(source, ["productId", "productID", "_id", "id"]);
    if (id && OBJECT_ID_RE.test(id)) return id.toLowerCase();
  }
  return null;
}

function nestedRecord(
  row: Record<string, unknown>,
  key: string
): Record<string, unknown> | null {
  const v = row[key];
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function pickBarcode(row: Record<string, unknown>): string | null {
  const direct = pickString(row, [
    "barcode",
    "masterBarcode",
    "productBarcode",
    "barcodes",
    "ean",
    "eanCode",
    "gtin",
    "barkod",
  ]);
  if (direct) return direct;
  const barcodes = row.barcodes;
  if (Array.isArray(barcodes) && barcodes.length > 0) {
    const first = barcodes[0];
    if (typeof first === "string" && first.trim()) return first.trim();
    if (first && typeof first === "object") {
      return pickString(first as Record<string, unknown>, [
        "barcode",
        "masterBarcode",
      ]);
    }
  }
  return null;
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

const PRODUCT_ARRAY_KEY =
  /^(products|items|skus|lines|goods|goodList|transferItems|transferProducts|productList|skuList|details|orderItems|inboundProducts|deliveryItems|palletProducts)$/i;

function collectProductArraysByKey(
  node: unknown,
  depth = 0,
  acc: Record<string, unknown>[][] = []
): Record<string, unknown>[][] {
  if (depth > 10 || node == null || typeof node !== "object") return acc;
  if (Array.isArray(node)) {
    for (const item of node) collectProductArraysByKey(item, depth + 1, acc);
    return acc;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    let parsed: unknown = value;
    if (typeof value === "string" && PRODUCT_ARRAY_KEY.test(key)) {
      try {
        parsed = JSON.parse(value) as unknown;
      } catch {
        parsed = value;
      }
    }
    if (PRODUCT_ARRAY_KEY.test(key)) {
      let objs: Record<string, unknown>[] = [];
      if (Array.isArray(parsed)) {
        objs = parsed.filter(
          (item): item is Record<string, unknown> =>
            !!item && typeof item === "object" && !Array.isArray(item)
        );
      } else if (parsed && typeof parsed === "object") {
        objs = [parsed as Record<string, unknown>];
      }
      if (objs.length > 0) {
        if (/^goods$/i.test(key)) acc.unshift(objs);
        else acc.push(objs);
      }
    }
    collectProductArraysByKey(parsed, depth + 1, acc);
  }
  return acc;
}

export function parseTransferProductRows(payload: unknown): TransferProductRow[] {
  const seen = new Set<string>();
  const out: TransferProductRow[] = [];
  for (const root of peelPayloadRoots(payload).map(unwrapData)) {
    for (const row of parseProductRowsFromRoot(root)) {
      const key = `${row.productId || ""}|${row.barcode || ""}|${row.name || ""}|${row.quantity ?? ""}`;
      if (!row.name && !row.barcode && !row.productId) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
  }
  return out;
}

export async function enrichTransferProductsFromCatalog(
  rows: TransferProductRow[]
): Promise<TransferProductRow[]> {
  const ids = rows
    .map((row) => row.productId)
    .filter((id): id is string => Boolean(id));
  const info = await getCatalogInfoByProductIds(ids);
  return rows.map((row) => {
    if (!row.productId) return row;
    const cat = info.get(row.productId);
    if (!cat) {
      return {
        ...row,
        name: row.name || `Ürün ${row.productId.slice(-6)}`,
      };
    }
    return {
      ...row,
      name: row.name || cat.name || null,
      barcode: row.barcode || cat.barcode || null,
    };
  });
}

function parseProductRowsFromRoot(root: unknown): TransferProductRow[] {
  const inheritedPallets = new Set<string>();
  collectPalletCodes(root, inheritedPallets);

  const named = collectProductArraysByKey(root);
  const arrays = named.length > 0 ? named : objectArrays(root);
  const ranked = [...arrays].sort((a, b) => b.length - a.length);
  const chosen =
    ranked.find((arr) => arr.filter(looksLikeProductRow).length >= Math.min(1, arr.length)) ||
    (named[0] && named[0].length > 0 ? named[0] : null) ||
    ranked.find((arr) => arr.some(looksLikeProductRow)) ||
    [];

  const products = chosen.filter(looksLikeProductRow);
  const source = products.length > 0 ? products : chosen;

  return source.map((row) => {
    const nestedProduct =
      nestedRecord(row, "product") ||
      nestedRecord(row, "item") ||
      nestedRecord(row, "sku");
    const nameSource = nestedProduct || row;
    const palletCodes = new Set<string>();
    collectPalletCodes(row, palletCodes);
    if (palletCodes.size === 0) {
      inheritedPallets.forEach((code) => palletCodes.add(code));
    }
    return {
      name: pickString(nameSource, [
        "name",
        "fullName",
        "productName",
        "itemName",
        "title",
        "displayName",
        "shortName",
        "goodName",
        "materialName",
        "articleName",
        "urunAdi",
        "urunIsmi",
        "urunAd",
      ]),
      barcode: pickBarcode(nameSource) || pickBarcode(row),
      quantity:
        pickNumber(row, [
          "receivedCount",
          "orderedCount",
          "quantity",
          "sentQuantity",
          "receivedQuantity",
          "transferredQuantity",
          "plannedQuantity",
          "packedQuantity",
          "amount",
          "count",
          "qty",
        ]) ?? pickNumber(nameSource, ["quantity", "count", "qty"]),
      palletCodes: [...palletCodes],
      productId: pickProductId(row),
      transferOrderNumbers: [],
    };
  });
}

export function istanbulDayUtcBoundsForYmd(ymd: string): {
  start: string;
  end: string;
} {
  try {
    const range = istanbulDayToUtcIsoRange(ymd);
    return { start: range.startDate, end: range.endDate };
  } catch (error) {
    const message =
      error instanceof IstanbulDayBoundsError
        ? error.message
        : "Geçersiz tarih.";
    throw new GetirWarehouseApiError(message, 400, "BAD_DATE");
  }
}

function istanbulDayUtcBounds(ref: Date): { start: string; end: string } {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ref);
  return istanbulDayUtcBoundsForYmd(ymd);
}

function parseJsonObject(raw: string | null): Record<string, unknown> {
  const trimmed = (raw || "").trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* boş */
  }
  return {};
}

function formatDateLikeSample(
  sample: string,
  ymd: string,
  isoUtc: string,
  istanbul: string
): string {
  const t = sample.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return ymd;
  if (/\+03:00/.test(t)) return istanbul;
  return isoUtc;
}

function rewriteCreatedAtForDay(
  createdAt: unknown,
  ymd: string,
  bounds: { start: string; end: string }
): unknown {
  const istanbulStart = `${ymd}T00:00:00.000+03:00`;
  const istanbulEnd = `${ymd}T23:59:59.999+03:00`;
  if (createdAt == null) {
    return { startDate: bounds.start, endDate: bounds.end };
  }
  if (typeof createdAt === "string") {
    return formatDateLikeSample(createdAt, ymd, bounds.start, istanbulStart);
  }
  if (typeof createdAt !== "object" || Array.isArray(createdAt)) {
    return { startDate: bounds.start, endDate: bounds.end };
  }
  const src = createdAt as Record<string, unknown>;
  const out: Record<string, unknown> = { ...src };
  let touched = false;
  for (const [key, value] of Object.entries(src)) {
    if (typeof value !== "string") continue;
    const isEnd = /end|lte|to|max|until/i.test(key);
    const isStart = /start|gte|from|min/i.test(key);
    if (!isStart && !isEnd) continue;
    out[key] = formatDateLikeSample(
      value,
      ymd,
      isEnd ? bounds.end : bounds.start,
      isEnd ? istanbulEnd : istanbulStart
    );
    touched = true;
  }
  return touched ? out : { startDate: bounds.start, endDate: bounds.end };
}

function inboundListPostBodies(
  raw: string | null,
  capturedAt: string,
  listDateYmd?: string
): string[] {
  const obj = parseJsonObject(raw);
  const bounds = listDateYmd
    ? istanbulDayUtcBoundsForYmd(listDateYmd)
    : istanbulDayUtcBounds(
        (() => {
          const ref = capturedAt ? new Date(capturedAt) : new Date();
          return Number.isNaN(ref.getTime()) ? new Date() : ref;
        })()
      );
  const variants: Record<string, unknown>[] = [];
  if (!listDateYmd && obj.createdAt != null) {
    variants.push(obj);
  }
  if (listDateYmd) {
    variants.push({
      ...obj,
      createdAt: rewriteCreatedAtForDay(obj.createdAt, listDateYmd, bounds),
    });
    variants.push({
      ...obj,
      createdAt: {
        startDate: `${listDateYmd}T00:00:00.000+03:00`,
        endDate: `${listDateYmd}T23:59:59.999+03:00`,
      },
    });
    variants.push({
      ...obj,
      createdAt: { startDate: listDateYmd, endDate: listDateYmd },
    });
  }
  variants.push({
    ...obj,
    createdAt: { startDate: bounds.start, endDate: bounds.end },
  });
  variants.push({ ...obj, createdAt: bounds.start });
  variants.push({
    ...obj,
    createdAt: { gte: bounds.start, lte: bounds.end },
  });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of variants) {
    const s = JSON.stringify(v);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function transferListScore(payload: unknown): number {
  return parseTransferListRows(payload).filter((row) => {
    const id = row.id || row.inboundDeliveryId;
    return Boolean(id && OBJECT_ID_RE.test(id));
  }).length;
}

export async function replayWarehouseTransferCapture(
  capture: WarehouseTransferCapture,
  options?: { listDateYmd?: string; pickRichestList?: boolean }
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
  const timeoutId = setTimeout(
    () => controller.abort(),
    options?.pickRichestList ? 60000 : 20000
  );
  const method = capture.method === "POST" ? "POST" : "GET";
  const headers: Record<string, string> = {
    ...WAREHOUSE_HEADERS,
    Authorization: `Bearer ${token}`,
  };
  if (method === "GET") {
    delete headers["Content-Type"];
  }

  try {
    const postBodies =
      method === "POST"
        ? inboundListPostBodies(
            capture.requestBody,
            capture.capturedAt,
            options?.listDateYmd
          )
        : [null];
    let lastErrorText = "";
    let lastStatus = 0;
    let bestPayload: unknown = null;
    let bestScore = -1;

    for (const postBody of postBodies) {
      const response = await fetch(capture.url, {
        method,
        headers,
        body: method === "POST" && postBody ? postBody : undefined,
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
      if (response.ok) {
        const json: unknown = await response.json();
        if (!options?.pickRichestList) {
          return json;
        }
        const score = transferListScore(json);
        if (score > bestScore) {
          bestScore = score;
          bestPayload = json;
        }
        continue;
      }
      lastStatus = response.status;
      lastErrorText = await response.text().catch(() => "");
      if (method !== "POST" || response.status !== 400) {
        break;
      }
    }

    if (bestPayload != null) {
      return bestPayload;
    }

    throw new GetirWarehouseApiError(
      `API hatası: ${lastStatus}${
        lastErrorText ? ` - ${lastErrorText.slice(0, 220)}` : ""
      }`,
      lastStatus || 500,
      "API_ERROR"
    );
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

const OBJECT_ID_RE_STRICT = /^[a-fA-F0-9]{24}$/;

function deliveryObjectId(row: TransferListRow): string | null {
  for (const value of [row.id, row.inboundDeliveryId]) {
    if (value && OBJECT_ID_RE_STRICT.test(value)) return value;
  }
  return null;
}

function inboundTransferDetailUrl(listUrl: string, transferId: string): string {
  const parsed = new URL(listUrl);
  const path = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${path}/${transferId}`;
}

function mergeProductKey(row: TransferProductRow): string | null {
  const barcode = row.barcode?.trim();
  if (barcode) return `b:${barcode}`;
  if (row.productId) return `p:${row.productId}`;
  const name = row.name?.trim().toLocaleLowerCase("tr-TR");
  if (name) return `n:${name}`;
  return null;
}

export function mergeTransferProductsForIncoming(
  rows: TransferProductRow[]
): TransferProductRow[] {
  const map = new Map<string, TransferProductRow>();
  for (const row of rows) {
    const key = mergeProductKey(row);
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        ...row,
        palletCodes: [...row.palletCodes],
        transferOrderNumbers: [...(row.transferOrderNumbers ?? [])],
      });
      continue;
    }
    const qtyA = existing.quantity;
    const qtyB = row.quantity;
    existing.quantity =
      qtyA == null && qtyB == null ? null : (qtyA ?? 0) + (qtyB ?? 0);
    existing.palletCodes = [
      ...new Set([...existing.palletCodes, ...row.palletCodes]),
    ];
    existing.transferOrderNumbers = [
      ...new Set([
        ...(existing.transferOrderNumbers ?? []),
        ...(row.transferOrderNumbers ?? []),
      ]),
    ];
    if (!existing.name && row.name) existing.name = row.name;
    if (!existing.barcode && row.barcode) existing.barcode = row.barcode;
    if (!existing.productId && row.productId) existing.productId = row.productId;
  }
  return [...map.values()];
}

export type TransferProductPublic = {
  name: string | null;
  barcode: string | null;
  quantity: number | null;
  palletCodes: string[];
  productId: string | null;
  transferOrderNumbers: string[];
};

export function toPublicTransferProduct(
  row: TransferProductRow
): TransferProductPublic {
  return {
    name: row.name,
    barcode: row.barcode,
    quantity: row.quantity,
    palletCodes: row.palletCodes,
    productId: row.productId,
    transferOrderNumbers: row.transferOrderNumbers ?? [],
  };
}

export type TransferProductsForDateResult = {
  date: string;
  dateFilterField: typeof TRANSFER_LIST_DATE_FIELD;
  dateFilterShape: typeof TRANSFER_LIST_DATE_SHAPE;
  transfers: TransferListRow[];
  products: TransferProductPublic[];
  productCount: number;
  deliveryLimitReached: boolean;
  skippedWithoutId: number;
  warning: string | null;
  error: string | null;
};

export async function getTransferProductsForDate(
  dateYmd: string
): Promise<TransferProductsForDateResult> {
  istanbulDayUtcBoundsForYmd(dateYmd);

  const listCapture = await getWarehouseTransferCapture("list");
  if (!listCapture || !isInboundTransferListUrl(listCapture.url)) {
    throw new GetirWarehouseApiError(
      "Transfer listesi henüz yakalanmadı. Depo panelinde Transfer Teslimat Listesi’ni açıp tarihi uygulayın, eklentiyi yenileyin.",
      400,
      "NEED_LIST_CAPTURE"
    );
  }

  const listPayload = await replayWarehouseTransferCapture(listCapture, {
    listDateYmd: dateYmd,
    pickRichestList: true,
  });
  const transfers = parseTransferListRows(listPayload);
  const withIds = transfers.filter((row) => deliveryObjectId(row));
  const skippedWithoutId = transfers.length - withIds.length;
  const limited = withIds.slice(0, TRANSFER_DELIVERY_FETCH_CAP);
  const deliveryLimitReached = withIds.length > TRANSFER_DELIVERY_FETCH_CAP;

  if (transfers.length === 0) {
    return {
      date: dateYmd,
      dateFilterField: TRANSFER_LIST_DATE_FIELD,
      dateFilterShape: TRANSFER_LIST_DATE_SHAPE,
      transfers: [],
      products: [],
      productCount: 0,
      deliveryLimitReached: false,
      skippedWithoutId: 0,
      warning: null,
      error: "Bu tarihte teslimat bulunamadı.",
    };
  }

  const collected: TransferProductRow[] = [];
  const detailFailures: string[] = [];
  const chunkSize = 4;
  for (let i = 0; i < limited.length; i += chunkSize) {
    const chunk = limited.slice(i, i + chunkSize);
    const chunkRows = await Promise.all(
      chunk.map(async (row) => {
        const id = deliveryObjectId(row);
        if (!id) return [] as TransferProductRow[];
        try {
          const detailPayload = await replayWarehouseTransferCapture({
            ...listCapture,
            kind: "detail",
            url: inboundTransferDetailUrl(listCapture.url, id),
            method: "GET",
            requestBody: null,
          });
          const parsed = parseTransferProductRows(detailPayload).map(
            (product) => ({
              ...product,
              transferOrderNumbers: row.transferOrderNumber
                ? [row.transferOrderNumber]
                : [],
            })
          );
          return parsed;
        } catch (error) {
          detailFailures.push(
            row.transferOrderNumber || id.slice(-6)
          );
          return [] as TransferProductRow[];
        }
      })
    );
    for (const rows of chunkRows) collected.push(...rows);
  }

  const enriched = await enrichTransferProductsFromCatalog(collected);
  const merged = mergeTransferProductsForIncoming(enriched);
  const products = merged.map(toPublicTransferProduct);

  const warnings: string[] = [];
  if (deliveryLimitReached) {
    warnings.push(
      `Bu günde ${withIds.length} teslimat var; ilk ${TRANSFER_DELIVERY_FETCH_CAP} tanesinin ürünü alındı.`
    );
  }
  if (skippedWithoutId > 0) {
    warnings.push(`${skippedWithoutId} teslimat satırında Getir id yok, atlandı.`);
  }
  if (detailFailures.length > 0) {
    warnings.push(
      `Bazı teslimat detayları alınamadı (${detailFailures.slice(0, 8).join(", ")}${
        detailFailures.length > 8 ? "…" : ""
      }).`
    );
  }

  let error: string | null = null;
  if (products.length === 0) {
    error =
      detailFailures.length === limited.length && limited.length > 0
        ? "Teslimatlar listelendi ama ürün detayı alınamadı. Token’ı yenileyip tekrar deneyin."
        : "Teslimatlar var ama ürün satırı çıkmadı.";
  }

  return {
    date: dateYmd,
    dateFilterField: TRANSFER_LIST_DATE_FIELD,
    dateFilterShape: TRANSFER_LIST_DATE_SHAPE,
    transfers: transfers.slice(0, 40),
    products,
    productCount: products.length,
    deliveryLimitReached,
    skippedWithoutId,
    warning: warnings.length > 0 ? warnings.join(" ") : null,
    error,
  };
}

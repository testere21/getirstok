import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { GETIR_TOKEN_COLLECTION } from "./types";

export const WAREHOUSE_TRANSFER_LIST_CAPTURE_DOC_ID =
  "warehouse_transfer_list_capture";
export const WAREHOUSE_TRANSFER_DETAIL_CAPTURE_DOC_ID =
  "warehouse_transfer_detail_capture";

export type WarehouseTransferCaptureKind = "list" | "detail";

export type WarehouseTransferCapture = {
  kind: WarehouseTransferCaptureKind;
  url: string;
  method: string;
  requestBody: string | null;
  responsePreview: string;
  responseTopKeys: string[];
  capturedAt: string;
};

export function classifyTransferRequestUrl(
  url: string
): WarehouseTransferCaptureKind | null {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "");
    if (/receiving-windows|transfer-orders/i.test(path)) return null;
    if (/\/inbound\/transfer$/i.test(path)) return "list";
    if (/\/inbound\/transfer\//i.test(path)) return "detail";
    if (
      /\/inbound\//i.test(path) &&
      /product|item|sku|pallet|line/i.test(path)
    ) {
      return "detail";
    }
    return null;
  } catch {
    if (/receiving-windows|transfer-orders/i.test(url)) return null;
    if (/\/inbound\/transfer\/[a-fA-F0-9]{24}/i.test(url)) return "detail";
    if (/\/inbound\/transfer(?:\?|$)/i.test(url)) return "list";
    if (/\/inbound\//i.test(url) && /product|item|sku|pallet|line/i.test(url)) {
      return "detail";
    }
    return null;
  }
}

export function isInboundTransferListUrl(url: string): boolean {
  return classifyTransferRequestUrl(url) === "list";
}

function docIdForKind(kind: WarehouseTransferCaptureKind): string {
  return kind === "detail"
    ? WAREHOUSE_TRANSFER_DETAIL_CAPTURE_DOC_ID
    : WAREHOUSE_TRANSFER_LIST_CAPTURE_DOC_ID;
}

export async function saveWarehouseTransferCapture(
  capture: WarehouseTransferCapture
): Promise<void> {
  if (capture.kind === "detail") {
    const existing = await getWarehouseTransferCapture("detail");
    const existingUrl = existing?.url || "";
    const nextUrl = capture.url.split("?")[0];
    const existingPath = existingUrl.split("?")[0];
    const existingRich = /\/inbound\/transfer\/[a-fA-F0-9]{24}\/.+/i.test(
      existingPath
    );
    const nextBare = /\/inbound\/transfer\/[a-fA-F0-9]{24}$/i.test(nextUrl);
    if (existingRich && nextBare) {
      return;
    }
    if (/\/products/i.test(existingUrl) && !/\/products/i.test(nextUrl)) {
      return;
    }
  }
  const ref = doc(db, GETIR_TOKEN_COLLECTION, docIdForKind(capture.kind));
  await setDoc(
    ref,
    {
      kind: capture.kind,
      url: capture.url,
      method: capture.method,
      requestBody: capture.requestBody,
      responsePreview: capture.responsePreview.slice(0, 20000),
      responseTopKeys: capture.responseTopKeys.slice(0, 40),
      capturedAt: capture.capturedAt,
    },
    { merge: true }
  );
}

export async function getWarehouseTransferCapture(
  kind: WarehouseTransferCaptureKind
): Promise<WarehouseTransferCapture | null> {
  const ref = doc(db, GETIR_TOKEN_COLLECTION, docIdForKind(kind));
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  const url = typeof data?.url === "string" ? data.url.trim() : "";
  if (!url) return null;
  return {
    kind,
    url,
    method:
      typeof data?.method === "string" && data.method.trim()
        ? data.method.trim().toUpperCase()
        : "GET",
    requestBody:
      typeof data?.requestBody === "string" && data.requestBody.trim()
        ? data.requestBody
        : null,
    responsePreview:
      typeof data?.responsePreview === "string" ? data.responsePreview : "",
    responseTopKeys: Array.isArray(data?.responseTopKeys)
      ? data.responseTopKeys.filter((k): k is string => typeof k === "string")
      : [],
    capturedAt: typeof data?.capturedAt === "string" ? data.capturedAt : "",
  };
}

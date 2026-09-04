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

export function classifyTransferRequestUrl(url: string): WarehouseTransferCaptureKind {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "");
    if (/product/i.test(path)) return "detail";
    if (parsed.searchParams.has("offset") || parsed.searchParams.has("limit")) {
      return "list";
    }
    if (/\/transfer$/i.test(path)) return "list";
    if (/\/transfer\//i.test(path)) return "detail";
    return "list";
  } catch {
    if (/offset=|limit=/i.test(url)) return "list";
    if (/\/transfer\//i.test(url)) return "detail";
    return "list";
  }
}

function docIdForKind(kind: WarehouseTransferCaptureKind): string {
  return kind === "detail"
    ? WAREHOUSE_TRANSFER_DETAIL_CAPTURE_DOC_ID
    : WAREHOUSE_TRANSFER_LIST_CAPTURE_DOC_ID;
}

export async function saveWarehouseTransferCapture(
  capture: WarehouseTransferCapture
): Promise<void> {
  const ref = doc(db, GETIR_TOKEN_COLLECTION, docIdForKind(capture.kind));
  await setDoc(
    ref,
    {
      kind: capture.kind,
      url: capture.url,
      method: capture.method,
      requestBody: capture.requestBody,
      responsePreview: capture.responsePreview.slice(0, 4000),
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

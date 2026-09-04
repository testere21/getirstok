import { NextResponse } from "next/server";
import {
  classifyTransferRequestUrl,
  getWarehouseTransferCapture,
  saveWarehouseTransferCapture,
} from "@/app/lib/warehouseTransferCaptureService";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

async function capturePublic(kind: "list" | "detail") {
  const c = await getWarehouseTransferCapture(kind);
  if (!c) return null;
  return {
    kind: c.kind,
    url: c.url,
    method: c.method,
    capturedAt: c.capturedAt,
    hasRequestBody: Boolean(c.requestBody),
  };
}

/** Liste / detay yakalandı mı — Getir replay yok (1.2) */
export async function GET() {
  try {
    const [list, detail] = await Promise.all([
      capturePublic("list"),
      capturePublic("detail"),
    ]);
    return NextResponse.json(
      { success: true, list, detail },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("[Warehouse transfer capture GET]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Yakalama okunamadı",
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      url?: unknown;
      method?: unknown;
      requestBody?: unknown;
      summary?: { preview?: unknown; topKeys?: unknown };
    };

    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url.startsWith("https://warehouse-panel-api-gateway.getirapi.com/")) {
      return NextResponse.json(
        { error: "Geçerli bir warehouse URL'si gerekli", success: false },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const method =
      typeof body.method === "string" && body.method.trim()
        ? body.method.trim().toUpperCase()
        : "GET";
    const requestBody =
      typeof body.requestBody === "string" ? body.requestBody.slice(0, 100000) : null;
    const preview =
      typeof body.summary?.preview === "string" ? body.summary.preview : "";
    const topKeys = Array.isArray(body.summary?.topKeys)
      ? body.summary.topKeys.filter((k): k is string => typeof k === "string")
      : [];

    const kind = classifyTransferRequestUrl(url);
    if (!kind) {
      return NextResponse.json(
        { success: true, skipped: true },
        { status: 200, headers: CORS_HEADERS }
      );
    }
    await saveWarehouseTransferCapture({
      kind,
      url,
      method,
      requestBody,
      responsePreview: preview,
      responseTopKeys: topKeys,
      capturedAt: new Date().toISOString(),
    });

    return NextResponse.json(
      { success: true, kind },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("[Warehouse transfer capture]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Yakalama kaydedilemedi",
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

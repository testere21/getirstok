import { NextResponse } from "next/server";
import {
  classifyTransferRequestUrl,
  saveWarehouseTransferCapture,
} from "@/app/lib/warehouseTransferCaptureService";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
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
    if (
      !url.startsWith("https://warehouse-panel-api-gateway.getirapi.com/") ||
      !/transfer/i.test(url)
    ) {
      return NextResponse.json(
        { error: "Geçerli bir warehouse transfer URL'si gerekli", success: false },
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

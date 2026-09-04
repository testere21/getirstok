import { NextResponse } from "next/server";
import { GetirWarehouseApiError } from "@/app/lib/getirWarehouseApiService";
import { getTransferProductsForDate } from "@/app/lib/getirWarehouseTransferService";

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
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, products: [], error: "JSON gövde gerekli." },
        { status: 400, headers: CORS_HEADERS }
      );
    }
    const date =
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      typeof (body as { date?: unknown }).date === "string"
        ? (body as { date: string }).date.trim()
        : "";
    if (!date) {
      return NextResponse.json(
        {
          success: false,
          products: [],
          error: "date alanı gerekli (YYYY-MM-DD).",
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const result = await getTransferProductsForDate(date);
    return NextResponse.json(
      {
        success: true,
        ...result,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    if (error instanceof GetirWarehouseApiError) {
      const status =
        error.code === "NO_TOKEN" ||
        error.code === "NEED_LIST_CAPTURE" ||
        error.code === "BAD_DATE"
          ? 400
          : error.code === "UNAUTHORIZED"
            ? 401
            : error.code === "FORBIDDEN"
              ? 403
              : error.statusCode && error.statusCode >= 400 && error.statusCode < 600
                ? error.statusCode
                : 500;
      return NextResponse.json(
        {
          success: false,
          products: [],
          error: error.message,
          code: error.code,
        },
        { status, headers: CORS_HEADERS }
      );
    }
    console.error("[Warehouse transfer products]", error);
    return NextResponse.json(
      {
        success: false,
        products: [],
        error: error instanceof Error ? error.message : "Bilinmeyen hata",
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

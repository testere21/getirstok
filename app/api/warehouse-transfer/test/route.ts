import { NextResponse } from "next/server";
import { GetirWarehouseApiError } from "@/app/lib/getirWarehouseApiService";
import {
  parseTransferListRows,
  parseTransferProductRows,
  replayWarehouseTransferCapture,
} from "@/app/lib/getirWarehouseTransferService";
import { getWarehouseTransferCapture } from "@/app/lib/warehouseTransferCaptureService";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  try {
    const listCapture = await getWarehouseTransferCapture("list");
    const detailCapture = await getWarehouseTransferCapture("detail");

    if (!listCapture) {
      return NextResponse.json(
        {
          success: false,
          step: "need_list_capture",
          error:
            "Henüz transfer listesi yakalanmadı. Depo panelinde Transfer Teslimat Listesi'ni açıp filtreyi uygulayın, eklentiyi 1.2.3+ sürümüne güncelleyin.",
          listCapture: null,
          detailCapture: detailCapture
            ? { url: detailCapture.url, method: detailCapture.method, capturedAt: detailCapture.capturedAt }
            : null,
        },
        { status: 200, headers: CORS_HEADERS }
      );
    }

    const listPayload = await replayWarehouseTransferCapture(listCapture);
    const transfers = parseTransferListRows(listPayload);
    const listProducts = parseTransferProductRows(listPayload);

    let detailProducts: ReturnType<typeof parseTransferProductRows> = [];
    let detailError: string | null = null;
    if (detailCapture) {
      try {
        const detailPayload = await replayWarehouseTransferCapture(detailCapture);
        detailProducts = parseTransferProductRows(detailPayload);
        if (detailProducts.length === 0) {
          detailError =
            "Detay isteği 200 döndü ama ürün satırı ayıklanamadı. Ham yanıt önizlemesine bakın.";
        }
      } catch (error) {
        detailError =
          error instanceof GetirWarehouseApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Detay isteği başarısız";
      }
    }

    const products =
      detailProducts.length > 0
        ? detailProducts
        : listProducts.filter((p) => p.name || p.barcode);

    return NextResponse.json(
      {
        success: true,
        step: products.length > 0 ? "products_ok" : detailCapture ? "products_empty" : "need_detail_capture",
        listCapture: {
          url: listCapture.url,
          method: listCapture.method,
          capturedAt: listCapture.capturedAt,
          responseTopKeys: listCapture.responseTopKeys,
          responsePreview: listCapture.responsePreview,
        },
        detailCapture: detailCapture
          ? {
              url: detailCapture.url,
              method: detailCapture.method,
              capturedAt: detailCapture.capturedAt,
              responseTopKeys: detailCapture.responseTopKeys,
              responsePreview: detailCapture.responsePreview,
            }
          : null,
        transferCount: transfers.length,
        transfers: transfers.slice(0, 20),
        productCount: products.length,
        products: products.slice(0, 80),
        detailError,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    if (error instanceof GetirWarehouseApiError) {
      return NextResponse.json(
        {
          success: false,
          step: "replay_failed",
          error: error.message,
          code: error.code,
        },
        { status: error.statusCode && error.statusCode < 500 ? error.statusCode : 200, headers: CORS_HEADERS }
      );
    }
    console.error("[Warehouse transfer test]", error);
    return NextResponse.json(
      {
        success: false,
        step: "unexpected",
        error: error instanceof Error ? error.message : "Bilinmeyen hata",
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

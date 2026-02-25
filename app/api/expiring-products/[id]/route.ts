import { NextResponse } from "next/server";
import {
  deleteExpiringProduct,
  updateExpiringProduct,
  type UpdateExpiringProductParams,
} from "@/app/lib/expiringProductService";

/** CORS header'ları */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** Preflight request handler */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** Yaklaşan SKT kaydını güncelleme endpoint'i */
export async function PUT(
  request: Request,
  { params }: { params: { id?: string } | Promise<{ id?: string }> }
) {
  const resolvedParams = await Promise.resolve(params);
  const id = resolvedParams?.id;
  console.log("[Expiring Products API] PUT request received for ID:", id);
  try {
    if (!id || typeof id !== "string" || id.trim().length === 0) {
      return NextResponse.json(
        { error: "Geçersiz id", success: false },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const body = await request.json();
    const { productName, expiryDate, removalDate, isNotified } = body;

    // Validasyon: En az bir alan güncellenmeli
    if (
      productName === undefined &&
      expiryDate === undefined &&
      removalDate === undefined &&
      isNotified === undefined
    ) {
      return NextResponse.json(
        {
          error: "Güncellenecek en az bir alan gerekli",
          success: false,
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Tarih formatı kontrolü (eğer tarih alanları gönderilmişse)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (expiryDate !== undefined) {
      if (typeof expiryDate !== "string" || expiryDate.trim().length === 0) {
        return NextResponse.json(
          {
            error: "SKT tarihi geçersiz",
            success: false,
          },
          { status: 400, headers: CORS_HEADERS }
        );
      }
      if (!dateRegex.test(expiryDate.trim())) {
        return NextResponse.json(
          {
            error: "SKT tarihi formatı geçersiz. YYYY-MM-DD formatında olmalıdır.",
            success: false,
          },
          { status: 400, headers: CORS_HEADERS }
        );
      }
    }

    if (removalDate !== undefined) {
      if (typeof removalDate !== "string" || removalDate.trim().length === 0) {
        return NextResponse.json(
          {
            error: "Çıkılması gereken tarih geçersiz",
            success: false,
          },
          { status: 400, headers: CORS_HEADERS }
        );
      }
      if (!dateRegex.test(removalDate.trim())) {
        return NextResponse.json(
          {
            error: "Çıkılması gereken tarih formatı geçersiz. YYYY-MM-DD formatında olmalıdır.",
            success: false,
          },
          { status: 400, headers: CORS_HEADERS }
        );
      }
    }

    const updateFields: UpdateExpiringProductParams = {};
    if (productName !== undefined) {
      updateFields.productName = productName;
    }
    if (expiryDate !== undefined) {
      updateFields.expiryDate = expiryDate;
    }
    if (removalDate !== undefined) {
      updateFields.removalDate = removalDate;
    }
    if (isNotified !== undefined) {
      updateFields.isNotified = isNotified;
    }

    console.log("[Expiring Products API] Updating product:", id, updateFields);
    await updateExpiringProduct(id, updateFields);

    return NextResponse.json(
      {
        success: true,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("[Expiring Products API] PUT error:", error);
    const message =
      error instanceof Error ? error.message : "Bilinmeyen hata oluştu";

    if (message.includes("bulunamadı")) {
      return NextResponse.json(
        { error: message, success: false },
        { status: 404, headers: CORS_HEADERS }
      );
    }
    return NextResponse.json(
      {
        error: message,
        success: false,
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

/** Yaklaşan SKT kaydını silme endpoint'i */
export async function DELETE(
  request: Request,
  { params }: { params: { id?: string } | Promise<{ id?: string }> }
) {
  const resolvedParams = await Promise.resolve(params);
  const id = resolvedParams?.id;
  console.log("[Expiring Products API] DELETE request received for ID:", id);
  try {
    if (!id || typeof id !== "string" || id.trim().length === 0) {
      return NextResponse.json(
        { error: "Geçersiz id", success: false },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    await deleteExpiringProduct(id);

    return NextResponse.json(
      {
        success: true,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("[Expiring Products API] DELETE error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Bilinmeyen hata oluştu",
        success: false,
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}


import { NextResponse } from "next/server";
import {
  fetchAllSupplementalCatalogAsCatalogProducts,
  mergeProductsJsonWithSupplemental,
  normalizeCatalogBarcodeKey,
  upsertSupplementalCatalogProduct,
} from "@/app/lib/supplementalCatalogProductService";
import { readFile } from "fs/promises";
import { join } from "path";
import type { CatalogProduct } from "@/app/lib/types";

const MAX_IMAGE_CHARS = 700_000;

function isValidImageDataUrl(value: string): boolean {
  return /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(value);
}

async function loadJsonCatalog(): Promise<CatalogProduct[]> {
  try {
    const path = join(process.cwd(), "data", "products.json");
    const content = await readFile(path, "utf-8");
    const data = JSON.parse(content) as CatalogProduct[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: unknown;
      barcode?: unknown;
      imageDataUrl?: unknown;
    };

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const barcode = normalizeCatalogBarcodeKey(
      typeof body.barcode === "string" ? body.barcode : ""
    );
    const imageDataUrl =
      typeof body.imageDataUrl === "string" ? body.imageDataUrl.trim() : "";

    if (name.length < 2) {
      return NextResponse.json(
        { success: false, error: "Ürün adı en az 2 karakter olmalı." },
        { status: 400 }
      );
    }
    if (!/^\d{6,18}$/.test(barcode)) {
      return NextResponse.json(
        { success: false, error: "Barkod 6–18 haneli rakam olmalı." },
        { status: 400 }
      );
    }
    if (!imageDataUrl || !isValidImageDataUrl(imageDataUrl)) {
      return NextResponse.json(
        { success: false, error: "Ürün görseli gerekli (kamera veya dosya)." },
        { status: 400 }
      );
    }
    if (imageDataUrl.length > MAX_IMAGE_CHARS) {
      return NextResponse.json(
        { success: false, error: "Görsel çok büyük. Daha küçük bir fotoğraf seçin." },
        { status: 400 }
      );
    }

    const jsonProducts = await loadJsonCatalog();
    const supplemental = await fetchAllSupplementalCatalogAsCatalogProducts();
    const merged = mergeProductsJsonWithSupplemental(jsonProducts, supplemental);
    const exists = merged.some(
      (p) => normalizeCatalogBarcodeKey(p.barcode) === barcode
    );
    if (exists) {
      return NextResponse.json(
        {
          success: false,
          error: "Bu barkod katalogda zaten var. Aramayı yenileyin.",
        },
        { status: 409 }
      );
    }

    const product: CatalogProduct = {
      name,
      barcode,
      imageUrl: imageDataUrl,
    };
    await upsertSupplementalCatalogProduct(product, "manual_add");

    return NextResponse.json({ success: true, product });
  } catch (error) {
    console.error("[catalog/manual-add]", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Ürün kaydedilemedi.",
      },
      { status: 500 }
    );
  }
}

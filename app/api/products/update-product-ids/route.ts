import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * products.json dosyasındaki ürünlere productId ekler (mevcut ürünleri bozmadan)
 * 
 * Request body: [{ barcode: string, productId: string, name?: string, imageUrl?: string }]
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Sadece development ortamında kullanılabilir." },
      { status: 403, headers: CORS_HEADERS }
    );
  }

  try {
    const body = await request.json();
    const updates = Array.isArray(body) ? body : [];

    if (updates.length === 0) {
      return NextResponse.json(
        { success: false, error: "Güncelleme listesi boş" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    console.log(`[Update Product IDs] ${updates.length} ürün güncellenecek`);

    // 1. products.json'ı oku
    const productsPath = join(process.cwd(), "data", "products.json");
    const productsData = await readFile(productsPath, "utf-8");
    const products = JSON.parse(productsData);

    // 2. Barcode -> ProductId map oluştur
    const barcodeToUpdate = new Map<string, { productId: string; name?: string; imageUrl?: string }>();
    updates.forEach((update: { barcode: string; productId: string; name?: string; imageUrl?: string }) => {
      if (update.barcode && update.productId) {
        barcodeToUpdate.set(update.barcode.trim(), {
          productId: update.productId,
          name: update.name,
          imageUrl: update.imageUrl,
        });
      }
    });

    // 3. products.json'daki ürünleri güncelle (sadece productId olmayanları)
    let updated = 0;
    let skipped = 0;
    let notFound = 0;

    const updatedProducts = products.map((product: { barcode?: string; productId?: string; name?: string; imageUrl?: string }) => {
      // Zaten productId varsa, değiştirme
      if (product.productId) {
        skipped++;
        return product;
      }

      // Barcode'a göre güncelleme bul
      const barcode = product.barcode?.trim();
      if (!barcode) {
        notFound++;
        return product;
      }

      const update = barcodeToUpdate.get(barcode);
      if (update) {
        updated++;
        return {
          ...product,
          productId: update.productId,
          // name ve imageUrl varsa güncelle (yoksa mevcut değerleri koru)
          ...(update.name && { name: update.name }),
          ...(update.imageUrl && { imageUrl: update.imageUrl }),
        };
      }

      notFound++;
      return product;
    });

    console.log(`[Update Product IDs] ${updated} ürüne productId eklendi`);
    console.log(`[Update Product IDs] ${skipped} ürün zaten productId'ye sahip (atlandı)`);
    console.log(`[Update Product IDs] ${notFound} ürün için güncelleme bulunamadı`);

    // 4. products.json'ı güncelle
    await writeFile(productsPath, JSON.stringify(updatedProducts, null, 2), "utf-8");

    return NextResponse.json(
      {
        success: true,
        message: "products.json güncellendi",
        stats: {
          total: products.length,
          updated,
          skipped,
          notFound,
        },
      },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("[Update Product IDs] Hata:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Bilinmeyen hata",
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}


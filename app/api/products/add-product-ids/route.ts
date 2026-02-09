import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";
import { getAllBarcodeMappings } from "@/app/lib/barcodeProductMappingService";

/**
 * products.json dosyasındaki ürünlere Firestore mapping'lerinden productId ekler
 */
export async function POST() {
  try {
    console.log("[Add Product IDs] Başlatılıyor...");
    
    // 1. products.json'ı oku
    const productsPath = join(process.cwd(), "data", "products.json");
    const productsData = await readFile(productsPath, "utf-8");
    const products = JSON.parse(productsData);
    
    console.log(`[Add Product IDs] ${products.length} ürün bulundu`);
    
    // 2. Firestore'dan tüm mapping'leri çek
    console.log("[Add Product IDs] Firestore mapping'leri çekiliyor...");
    const mappings = await getAllBarcodeMappings();
    
    // 3. Barkod -> ProductId map oluştur
    const barcodeToProductId = new Map<string, string>();
    mappings.forEach((mapping) => {
      if (mapping.barcode && mapping.productId) {
        barcodeToProductId.set(mapping.barcode.trim(), mapping.productId);
      }
    });
    
    console.log(`[Add Product IDs] ${barcodeToProductId.size} mapping bulundu`);
    
    // 4. Her ürün için productId ekle
    let updated = 0;
    let notFound = 0;
    let alreadyHasId = 0;
    
    const updatedProducts = products.map((product: { barcode?: string; productId?: string }) => {
      // Zaten productId varsa, değiştirme
      if (product.productId) {
        alreadyHasId++;
        return product;
      }
      
      // Mapping'den productId bul
      const productId = product.barcode 
        ? barcodeToProductId.get(product.barcode.trim())
        : undefined;
      
      if (productId) {
        updated++;
        return {
          ...product,
          productId: productId,
        };
      } else {
        notFound++;
        return product;
      }
    });
    
    console.log(`[Add Product IDs] ${updated} ürüne productId eklendi`);
    console.log(`[Add Product IDs] ${alreadyHasId} ürün zaten productId'ye sahip`);
    console.log(`[Add Product IDs] ${notFound} ürün için productId bulunamadı`);
    
    // 5. products.json'ı güncelle
    console.log("[Add Product IDs] products.json güncelleniyor...");
    await writeFile(productsPath, JSON.stringify(updatedProducts, null, 2), "utf-8");
    
    return NextResponse.json({
      success: true,
      message: "products.json güncellendi",
      stats: {
        total: products.length,
        updated,
        alreadyHasId,
        notFound,
      },
    });
  } catch (error) {
    console.error("[Add Product IDs] Hata:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Bilinmeyen hata",
      },
      { status: 500 }
    );
  }
}


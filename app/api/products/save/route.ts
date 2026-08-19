import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";
import type { CatalogProduct } from "@/app/lib/types";

/** Getir panelinden (warehouse.getir.com) gelen istekler için CORS – sadece development */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://warehouse.getir.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function normalizeBarcode(barcode: string): string {
  const trimmed = barcode.trim().replace(/\s/g, "");
  return trimmed.length > 13 ? trimmed.slice(0, 13) : trimmed;
}

/** Sadece development: raf etiketi scraper'ından gelen ürünleri products.json ile birleştirir (üzerine yazmaz). */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Sadece development ortamında kullanılabilir." },
      { status: 403, headers: CORS_HEADERS }
    );
  }

  try {
    const body = await request.json();
    const raw = Array.isArray(body) ? body : [];

    const incoming = raw
      .filter(
        (p: { name?: string; barcode?: string }) =>
          p &&
          typeof p === "object" &&
          p.name !== "Ürün Görseli" &&
          p.barcode !== "Barkodlar"
      )
      .map(
        (p: {
          name?: string;
          barcode?: string;
          productId?: string;
          imageUrl?: string;
          barcodes?: string[];
        }) => {
          const barcode = normalizeBarcode(String(p.barcode ?? ""));
          const extra = Array.isArray(p.barcodes)
            ? p.barcodes.map((b) => normalizeBarcode(String(b))).filter(Boolean)
            : [];
          const barcodes = Array.from(new Set([barcode, ...extra].filter(Boolean)));
          return {
            name: (p.name ?? "").trim(),
            barcode,
            productId: p.productId?.trim() || undefined,
            imageUrl: p.imageUrl,
            barcodes: barcodes.length > 0 ? barcodes : undefined,
          };
        }
      )
      .filter((p) => p.barcode.length >= 8);

    const path = join(process.cwd(), "data", "products.json");
    let existing: CatalogProduct[] = [];
    try {
      const content = await readFile(path, "utf-8");
      const parsed = JSON.parse(content) as CatalogProduct[];
      existing = Array.isArray(parsed) ? parsed : [];
    } catch {
      existing = [];
    }

    const byBarcode = new Map<string, CatalogProduct>();
    for (const p of existing) {
      const k = normalizeBarcode(p.barcode || "");
      if (k) byBarcode.set(k, p);
    }

    let added = 0;
    let skipped = 0;

    for (const p of incoming) {
      if (byBarcode.has(p.barcode)) {
        skipped++;
        continue;
      }
      byBarcode.set(p.barcode, {
        name: p.name || "-",
        barcode: p.barcode,
        imageUrl: p.imageUrl,
        productId: p.productId,
        barcodes: p.barcodes,
      });
      added++;
    }

    const merged = Array.from(byBarcode.values());
    await writeFile(path, JSON.stringify(merged, null, 2), "utf-8");

    return NextResponse.json(
      {
        ok: true,
        added,
        skipped,
        count: merged.length,
        message: `products.json birleştirildi: ${added} yeni, ${skipped} zaten vardı, toplam ${merged.length}.`,
      },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("products.json yazılamadı:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Yazma hatası" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

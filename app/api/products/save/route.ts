import { writeFile } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";

/** Getir panelinden (warehouse.getir.com) gelen istekler için CORS – sadece development */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://warehouse.getir.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** Sadece development ortamında products.json dosyasına yazar (konsol scraper için). */
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

    const cleaned = raw
      .filter(
        (p: { name?: string; barcode?: string }) =>
          p &&
          typeof p === "object" &&
          p.name !== "Ürün Görseli" &&
          p.barcode !== "Barkodlar"
      )
      .map((p: { name?: string; barcode?: string; imageUrl?: string }) => ({
        name: p.name ?? "",
        barcode: typeof p.barcode === "string" && p.barcode.length > 13
          ? p.barcode.slice(0, 13)
          : (p.barcode ?? ""),
        imageUrl: p.imageUrl,
      }));

    const path = join(process.cwd(), "data", "products.json");
    await writeFile(path, JSON.stringify(cleaned), "utf-8");

    return NextResponse.json(
      {
        ok: true,
        count: cleaned.length,
        message: `data/products.json güncellendi (${cleaned.length} ürün).`,
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

import { readdir } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";

/**
 * `public/bakery-images/` içindeki `.jpg` / `.jpeg` dosyalarından barkod listesi
 * (dosya adı uzantısız = barkod). Tam ekran görsel yalnızca bu barkodlarda kullanılır.
 */
export async function GET() {
  const dir = join(process.cwd(), "public", "bakery-images");
  try {
    const names = await readdir(dir);
    const barcodes: string[] = [];
    for (const name of names) {
      if (name === ".gitkeep" || name.startsWith(".")) continue;
      const m = /^(.+)\.(jpe?g)$/i.exec(name);
      if (m) {
        const b = m[1].trim();
        if (b.length > 0) barcodes.push(b);
      }
    }
    return NextResponse.json({ barcodes });
  } catch {
    return NextResponse.json({ barcodes: [] as string[] });
  }
}

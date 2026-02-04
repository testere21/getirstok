/**
 * Tek seferlik: Getir Depo Paneli tablosundan ürün listesini çeker,
 * data/products.json dosyasına yazar. Firestore kullanılmaz.
 *
 * Kullanım:
 *   1. Getir paneline tarayıcıdan giriş yapın (gerekirse).
 *   2. npx playwright install chromium
 *   3. GETIR_PANEL_URL="https://..." node scripts/scrape-getir-products.mjs
 *      veya URL'siz çalıştırıp açılan pencerede sayfaya gidip giriş yaptıktan
 *      sonra konsola "y" yazıp Enter'a basın.
 */

import { chromium } from "@playwright/test";
import { writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "..", "data", "products.json");

const GETIR_PANEL_URL = process.env.GETIR_PANEL_URL || "";

async function scrapeProducts(page) {
  // Tablo satırları: Getir panelinde genelde table tbody tr veya grid row
  // Sütunlar: Barkod | Görsel | Ürün ID | Ürün Adı | ...
  const rowSelector =
    'table tbody tr, [role="row"]:not([role="row"] [role="row"]), .ag-row, [data-row-id]';
  await page.waitForSelector(rowSelector, { timeout: 30000 }).catch(() => null);

  const rows = await page.$$(rowSelector);
  const products = [];

  for (const row of rows) {
    try {
      const cells = await row.$$("td, [role='gridcell'], .ag-cell");
      if (cells.length < 4) continue;

      const getText = async (el) => (await el.textContent())?.trim() || "";
      const barcode = await getText(cells[0]);
      const productId = await getText(cells[2]);
      const name = await getText(cells[3]);

      const img = await cells[1]?.$("img");
      const imageUrl = img ? (await img.getAttribute("src")) || undefined : undefined;

      if (barcode || name) {
        products.push({
          name: name || "-",
          barcode: barcode || "",
          imageUrl: imageUrl || undefined,
          productId: productId || undefined,
        });
      }
    } catch (e) {
      // Satır atlanabilir
    }
  }

  return products;
}

async function main() {
  const browser = await chromium.launch({
    headless: false,
    channel: undefined,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  if (GETIR_PANEL_URL) {
    await page.goto(GETIR_PANEL_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    console.log("Sayfa yüklendi. Tablo bekleniyor...");
  } else {
    console.log("GETIR_PANEL_URL verilmedi. Tarayıcı açıldı.");
    console.log("Getir paneline gidip giriş yapın, Raf Etiketi / ürün listesi sayfasına gelin.");
    console.log("Hazır olunca konsola 'y' yazıp Enter'a basın.");
    await new Promise((resolve) => {
      process.stdin.once("data", (d) => {
        if (String(d).trim().toLowerCase() === "y") resolve();
      });
    });
  }

  const products = await scrapeProducts(page);
  await browser.close();

  await writeFile(OUTPUT_PATH, JSON.stringify(products, null, 2), "utf-8");
  console.log(`${products.length} ürün yazıldı: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

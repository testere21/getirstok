/**
 * Getir depo panelindeki ürün listesinden (Raf Etiketi / list) barkod bazında
 * `data/products.json` içindeki eksik alanları doldurur.
 *
 * Doldurduğu alanlar (varsa): name, imageUrl, productId
 *
 * Kullanım:
 *   npx playwright install chromium
 *   GETIR_PANEL_URL="https://warehouse.getir.com.tr/.../stock/stock-management/shelf-label/list" node scripts/update-products-from-getir-panel.mjs
 *
 * Not:
 * - Headless: false (login gerekebilir).
 * - Sayfalama URL değiştirmiyor; script sayfa "Next" butonuna basarak ilerler.
 */

import { chromium } from "@playwright/test";
import { readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRODUCTS_PATH = join(__dirname, "..", "data", "products.json");

const GETIR_PANEL_URL = process.env.GETIR_PANEL_URL || "";
const MAX_PAGES = Number(process.env.MAX_PAGES || "200");

const normalizeBarcode = (x) => String(x ?? "").trim();

const readProducts = async () => {
  const raw = await readFile(PRODUCTS_PATH, "utf-8");
  const products = JSON.parse(raw);
  if (!Array.isArray(products)) throw new Error("products.json array olmalı");
  return products;
};

const buildIndex = (products) => {
  const map = new Map();
  for (let i = 0; i < products.length; i++) {
    const b = normalizeBarcode(products[i]?.barcode);
    if (b) map.set(b, i);
  }
  return map;
};

async function scrapeCurrentPage(page) {
  const rowSelector =
    'table tbody tr, [role="row"]:not([role="row"] [role="row"]), .ag-row, [data-row-id]';
  await page.waitForSelector(rowSelector, { timeout: 30000 }).catch(() => null);

  const rows = await page.$$(rowSelector);
  const out = [];

  for (const row of rows) {
    try {
      const cells = await row.$$("td, [role='gridcell'], .ag-cell");
      if (cells.length < 4) continue;

      const getText = async (el) => (await el.textContent())?.trim() || "";
      const barcode = await getText(cells[0]);
      const productId = await getText(cells[2]);
      const name = await getText(cells[3]);

      const img = await cells[1]?.$("img");
      const imageUrl = img ? (await img.getAttribute("src")) || "" : "";

      const b = normalizeBarcode(barcode);
      if (!b) continue;

      out.push({
        barcode: b,
        name: name || "",
        productId: productId || "",
        imageUrl: imageUrl || "",
      });
    } catch {
      // satır atla
    }
  }

  return out;
}

async function clickNext(page) {
  const candidates = [
    'button[aria-label*="next" i]',
    'button[aria-label*="sonraki" i]',
    'button[title*="next" i]',
    'button[title*="sonraki" i]',
    'button:has-text("Next")',
    'button:has-text("Sonraki")',
    'button:has-text("›")',
    'button:has-text("»")',
  ];

  for (const sel of candidates) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) > 0 && (await loc.isVisible()).catch(() => false)) {
      const disabled = (await loc.isDisabled().catch(() => false)) || false;
      if (!disabled) {
        await loc.click({ timeout: 5000 }).catch(() => null);
        return true;
      }
    }
  }

  // Fallback: sayfa altındaki pagination bar'da en sağdaki enabled buton
  const footer = page.locator("footer, nav, [role='navigation'], div").filter({
    hasText: /sayfa/i,
  });
  const footerCount = await footer.count();
  if (footerCount > 0) {
    const root = footer.nth(footerCount - 1);
    const btns = root.locator("button");
    const n = await btns.count();
    if (n > 0) {
      for (let i = n - 1; i >= 0; i--) {
        const b = btns.nth(i);
        const vis = await b.isVisible().catch(() => false);
        if (!vis) continue;
        const dis = await b.isDisabled().catch(() => true);
        if (dis) continue;
        await b.click({ timeout: 5000 }).catch(() => null);
        return true;
      }
    }
  }

  return false;
}

async function main() {
  const products = await readProducts();
  const index = buildIndex(products);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  if (GETIR_PANEL_URL) {
    await page.goto(GETIR_PANEL_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    console.log("Sayfa yüklendi. Login gerekirse giriş yapın.");
  } else {
    console.log("GETIR_PANEL_URL yok. Tarayıcı açıldı; liste sayfasına gidip login olun.");
  }

  console.log("Hazır olunca konsola 'y' yazıp Enter'a basın.");
  await new Promise((resolve) => {
    process.stdin.once("data", (d) => {
      if (String(d).trim().toLowerCase() === "y") resolve();
    });
  });

  let pageNo = 0;
  let updated = 0;
  let seenBarcodes = 0;

  while (pageNo < MAX_PAGES) {
    pageNo += 1;

    const sigBefore = await page.evaluate(() => document.body?.innerText?.slice(0, 2000) || "");
    const rows = await scrapeCurrentPage(page);

    for (const r of rows) {
      const i = index.get(r.barcode);
      if (i === undefined) continue;
      const p = products[i];
      seenBarcodes += 1;

      const shouldUpdateName =
        !p.name ||
        p.name === "-" ||
        String(p.name).toLowerCase().includes("getir panelinden eklendi");
      const shouldUpdateId = !p.productId && r.productId;
      const shouldUpdateImg = !p.imageUrl && r.imageUrl;

      if (shouldUpdateName && r.name) {
        p.name = r.name;
      }
      if (shouldUpdateId) {
        p.productId = r.productId;
      }
      if (shouldUpdateImg) {
        p.imageUrl = r.imageUrl;
      }

      if ((shouldUpdateName && r.name) || shouldUpdateId || shouldUpdateImg) {
        updated += 1;
      }
    }

    console.log(
      `📄 Sayfa ${pageNo}: satır=${rows.length} | görülen=${seenBarcodes} | güncellenen-adet=${updated}`
    );

    const ok = await clickNext(page);
    if (!ok) break;

    // Sayfa değişimini bekle
    let changed = false;
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(250);
      const sigAfter = await page.evaluate(
        () => document.body?.innerText?.slice(0, 2000) || ""
      );
      if (sigAfter && sigAfter !== sigBefore) {
        changed = true;
        break;
      }
    }
    if (!changed) {
      console.log("⚠️ Sayfa değişimi algılanamadı; son sayfa olabilir. Durduruluyor.");
      break;
    }
  }

  await browser.close();

  await writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
  console.log(`✅ Kaydedildi: ${PRODUCTS_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


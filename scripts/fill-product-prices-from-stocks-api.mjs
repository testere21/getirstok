/**
 * Tek seferlik: data/products.json içinde her productId için Getir franchise
 * stocks API'den fiyatı çekip `price` (number, TL) yazar.
 *
 * Kullanım (PowerShell):
 *   $env:GETIR_TOKEN="eyJ..."   # eklentiden / DevTools’tan bayi (franchise) token
 *   node scripts/fill-product-prices-from-stocks-api.mjs
 *
 * İlk 3 ürünü dene, dosyayı değiştirme:
 *   $env:DRY_RUN="1"
 *   node scripts/fill-product-prices-from-stocks-api.mjs
 *
 * Sadece 30 ürün ile sınırla (test):
 *   $env:LIMIT="30"
 *   $env:DRY_RUN="0"
 *   $env:GETIR_TOKEN="..."
 *   node scripts/fill-product-prices-from-stocks-api.mjs
 *
 * Node 20+: .env.local yüklemek için
 *   node --env-file=.env.local scripts/fill-product-prices-from-stocks-api.mjs
 */

import { readFile, writeFile, copyFile, rm } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PRODUCTS_PATH = join(ROOT, "data", "products.json");
const BACKUP_PATH = join(ROOT, "data", "products.json.bak-before-prices");
const PROGRESS_PATH = join(ROOT, "data", ".fill-prices-progress.json");
const PARTIAL_PATH = join(ROOT, "data", "products.json.partial");

const DEFAULT_WAREHOUSE_ID = "5dc32d8b734a192200caddf8";
const STOCKS_URL =
  "https://franchise-api-gateway.getirapi.com/stocks?limit=100&offset=0";

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : null;
const MS_BETWEEN = Math.max(50, parseInt(process.env.MS_BETWEEN || "150", 10));
const DRY_MAX_FETCHES = parseInt(process.env.DRY_MAX_FETCHES || "5", 10);

let debugRowLogged = false;

/**
 * @param {Record<string, unknown>} row
 * @returns {number | null}
 */
function extractPriceFromStocksRow(row) {
  if (!row || typeof row !== "object") return null;

  const tryNum = (v) => {
    if (typeof v !== "number" || Number.isNaN(v) || v < 0) return null;
    if (v > 1_000_000) return null;
    // Bazı API'ler fiyatı kuruş/cent olarak döner; TL için makul aralık
    if (v > 2_000 && v % 1 === 0) {
      const asLira = v / 100;
      if (asLira < 0.01) return null;
      return asLira;
    }
    return v;
  };

  const directKeys = [
    "price",
    "sellingPrice",
    "salePrice",
    "finalPrice",
    "gross",
    "grossPrice",
    "franchisePrice",
    "retailPrice",
    "getirPrice",
    "unitPrice",
    "storePrice",
    "listPrice",
  ];
  for (const k of directKeys) {
    if (k in row) {
      const n = tryNum(/** @type {number} */ (row[k]));
      if (n != null) return n;
    }
  }

  const pi = row.packagingInfo;
  if (pi && typeof pi === "object") {
    for (const key of Object.keys(pi)) {
      if (key === "pickingType") continue;
      const p = pi[key];
      if (p && typeof p === "object") {
        for (const pk of directKeys) {
          if (pk in p) {
            const n = tryNum(/** @type {number} */ (p[pk]));
            if (n != null) return n;
          }
        }
      }
    }
  }

  if (!debugRowLogged) {
    debugRowLogged = true;
    console.warn(
      "[fill-prices] Fiyat alanı tespit edilemedi; örnek satır (max 3000 char):"
    );
    console.warn(JSON.stringify(row).slice(0, 3000));
  }
  return null;
}

/**
 * @param {string} token
 * @param {string} productId
 */
async function fetchPriceByProductId(token, productId) {
  const res = await fetch(STOCKS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      warehouseIds: [DEFAULT_WAREHOUSE_ID],
      productIds: [productId],
      sort: { available: 1 },
    }),
  });

  if (!res.ok) {
    return { price: null, status: res.status };
  }

  const data = await res.json();
  const row = data?.data?.[0];
  if (!row) {
    return { price: null, status: res.status };
  }
  return { price: extractPriceFromStocksRow(row), status: res.status };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const token = process.env.GETIR_TOKEN?.trim();
  if (!token) {
    console.error("GETIR_TOKEN yok. Bayi (franchise) token set edin.");
    process.exit(1);
  }

  const products = JSON.parse(await readFile(PRODUCTS_PATH, "utf-8"));
  if (!Array.isArray(products)) {
    throw new Error("products.json dizi değil");
  }

  let startIndex = 0;
  if (process.env.RESUME === "1" || process.env.RESUME === "true") {
    try {
      const p = JSON.parse(await readFile(PROGRESS_PATH, "utf-8"));
      if (Number.isInteger(p?.lastIndex)) {
        startIndex = p.lastIndex + 1;
        console.log(`[fill-prices] RESUME: startIndex=${startIndex}`);
      }
    } catch {
      /* yok */
    }
  }

  const endByLimit =
    LIMIT != null && !Number.isNaN(LIMIT)
      ? Math.min(startIndex + LIMIT, products.length)
      : products.length;

  let withPid = 0;
  let skippedNoPid = 0;
  let priceOk = 0;
  let priceFail = 0;
  let httpErr = 0;
  let dryFetches = 0;

  for (let i = startIndex; i < endByLimit; i++) {
    const p = products[i];
    const productId = typeof p?.productId === "string" ? p.productId.trim() : p?.productId;
    if (!productId) {
      skippedNoPid++;
      continue;
    }
    withPid++;

    const { price, status } = await fetchPriceByProductId(token, productId);

    if (DRY_RUN) {
      dryFetches++;
      console.log(
        `[DRY] [${i}] ${p?.barcode} pid=${productId} -> price=${price} http=${status} ${(p?.name || "").slice(0, 45)}`
      );
      if (dryFetches >= DRY_MAX_FETCHES) {
        console.log(
          `DRY_RUN: ${DRY_MAX_FETCHES} productId'li satır sorgulandı, çıkılıyor.`
        );
        return;
      }
    } else {
      if (status !== 200) {
        httpErr++;
        if (httpErr <= 3) {
          console.warn(
            `HTTP ${status} index ${i} productId=${productId}`
          );
        }
      }
      if (price != null) {
        p.price = Math.round(price * 100) / 100;
        priceOk++;
      } else {
        priceFail++;
      }
    }

    if (!DRY_RUN && i > 0 && i % 200 === 0) {
      await writeFile(
        PROGRESS_PATH,
        JSON.stringify(
          { lastIndex: i, t: new Date().toISOString() },
          null,
          2
        )
      );
      await writeFile(PARTIAL_PATH, JSON.stringify(products, null, 2), "utf-8");
      console.log(`[fill-prices] checkpoint index ${i} (ok=${priceOk} fail=${priceFail})`);
    }

    await sleep(MS_BETWEEN);
  }

  if (DRY_RUN) {
    console.log("DRY_RUN: products.json değiştirilmedi.");
    return;
  }

  await copyFile(PRODUCTS_PATH, BACKUP_PATH);
  await writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
  try {
    await writeFile(
      PROGRESS_PATH,
      JSON.stringify(
        { lastIndex: endByLimit - 1, done: true, t: new Date().toISOString() },
        null,
        2
      )
    );
  } catch {
    /* */
  }
  try {
    await rm(PARTIAL_PATH, { force: true });
  } catch {
    /* */
  }

  console.log("--- Bitti ---");
  console.log(
    `İşlenen aralık: ${startIndex} .. ${endByLimit - 1} (productId’li: ${withPid}, productId yok: ${skippedNoPid})`
  );
  console.log(
    `fiyat yazıldı: ${priceOk}, fiyat yok/parse edilemedi: ${priceFail}, dikkat: http!=200: ${httpErr}+`
  );
  console.log(`Yedek: ${BACKUP_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

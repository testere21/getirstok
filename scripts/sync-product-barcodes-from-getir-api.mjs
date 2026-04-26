import { readFile, writeFile } from "fs/promises";
import { join } from "path";

/**
 * Getir depo API'sinden (warehouse-panel-api-gateway) tüm ürünleri çekip
 * data/products.json içindeki her ürünün tüm barkodlarını `barcodes` alanına yazar.
 *
 * - UI'da `barcode` (ana barkod) aynı kalır.
 * - `barcodes`: ürünün sahip olduğu tüm barkodlar (ana barkod dahil, unique).
 *
 * Kullanım (CMD):
 *   set "GETIR_TOKEN=Bearer ...."
 *   npm run sync-barcodes
 *
 * Opsiyonel:
 *   set "GETIR_LIMIT=200"
 *   set "GETIR_MAX=60000"
 */

const PRODUCTS_PATH = join(process.cwd(), "data", "products.json");
const API_BASE = "https://warehouse-panel-api-gateway.getirapi.com";
const API_PATH = "/v3/products/filter";
const LIMIT = Number(process.env.GETIR_LIMIT || "200");
const MAX_SCAN = Number(process.env.GETIR_MAX || "60000");

const tokenRaw = process.env.GETIR_TOKEN || "";
const authHeader = tokenRaw
  ? tokenRaw.toLowerCase().startsWith("bearer ")
    ? tokenRaw
    : `Bearer ${tokenRaw}`
  : "";

if (!authHeader) {
  console.error('❌ GETIR_TOKEN env yok. Örn: set "GETIR_TOKEN=Bearer ..."');
  process.exit(1);
}

const normalizeBarcode = (x) => String(x ?? "").trim().replace(/\s+/g, "");

// Not: Bu scriptin ana hedefi `barcodes` senkronu.
// Bazı sayfalarda API, `picURL.en: null` gibi verilerden dolayı 500 dönebiliyor.
// O yüzden image/name alanlarını bu scriptte istemiyoruz.

const findItemsArray = (root) => {
  const seen = new Set();
  const queue = [root];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur || typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);
    if (Array.isArray(cur)) {
      if (cur.length > 0 && typeof cur[0] === "object") return cur;
      continue;
    }
    for (const v of Object.values(cur)) {
      if (v && typeof v === "object") queue.push(v);
    }
  }
  return [];
};

const requestBody = {
  fields: "id _id barcodes",
  includeDefaultFields: false,
  status: [0, 1, 2, 3, 4],
  language: "tr",
};

const productsRaw = await readFile(PRODUCTS_PATH, "utf-8");
const products = JSON.parse(productsRaw);
if (!Array.isArray(products)) throw new Error("products.json array olmalı");

// hızlı lookup: herhangi bir barkod -> product index (ana + varsa eski barcodes)
const indexByAnyBarcode = new Map();
for (let i = 0; i < products.length; i++) {
  const p = products[i];
  const main = normalizeBarcode(p?.barcode);
  if (main) indexByAnyBarcode.set(main, i);
  const alts = Array.isArray(p?.barcodes) ? p.barcodes : [];
  for (const a of alts) {
    const b = normalizeBarcode(a);
    if (b) indexByAnyBarcode.set(b, i);
  }
}

let offset = 0;
let scanned = 0;
let matched = 0;
let updated = 0;

while (scanned < MAX_SCAN) {
  const url = `${API_BASE}${API_PATH}?offset=${offset}&limit=${Math.min(200, LIMIT)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: authHeader,
      countrycode: "TR",
      language: "tr",
      "x-requester-client": "warehouse-panel-frontend",
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API hata: ${res.status} ${res.statusText}\n${text.slice(0, 1200)}`);
  }

  const data = await res.json();
  const items = findItemsArray(data);
  if (items.length === 0) {
    console.log("✅ Veri bitti. Durduruluyor.");
    break;
  }

  for (const item of items) {
    scanned += 1;
    const barcodes = Array.isArray(item?.barcodes) ? item.barcodes : [];
    if (barcodes.length === 0) continue;
    const normalized = Array.from(
      new Set(barcodes.map(normalizeBarcode).filter((b) => b.length > 0))
    );
    if (normalized.length === 0) continue;

    // Bu ürünün barkodlarından herhangi biri bizde varsa onu güncelle
    let idx = undefined;
    for (const b of normalized) {
      const i = indexByAnyBarcode.get(b);
      if (i !== undefined) {
        idx = i;
        break;
      }
    }
    if (idx === undefined) continue;
    matched += 1;

    const p = products[idx];
    const prev = Array.isArray(p?.barcodes) ? p.barcodes.map(normalizeBarcode) : [];
    const merged = Array.from(new Set([normalizeBarcode(p?.barcode), ...prev, ...normalized])).filter(
      (b) => b.length > 0
    );

    // primary barcode değişmesin, ama barcodes listesine dahil olsun
    p.barcodes = merged;

    // productId yoksa doldur (id/_id)
    const pid = item?.id ? String(item.id) : item?._id ? String(item._id) : "";
    if (!p.productId && pid) p.productId = pid;

    // indexByAnyBarcode map'ini genişlet (bir sonraki eşleşmeler için)
    for (const b of merged) indexByAnyBarcode.set(b, idx);

    updated += 1;
  }

  offset += items.length;
  console.log(`📦 scanned=${scanned} matched=${matched} updated=${updated} offset=${offset}`);
  // Bazı ortamlarda API son sayfada limit'ten az dönebilir; yine de bir sonraki offset'i deneyip
  // ancak tamamen boş geldiğinde durmak daha güvenli.
}

await writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
console.log(`✅ Kaydedildi: ${PRODUCTS_PATH}`);
console.log(`Özet: scanned=${scanned} matched=${matched} updated=${updated}`);


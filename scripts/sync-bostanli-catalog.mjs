/**
 * Bostanlı kataloğu: Getir bayi stok listesinden (franchise-api-gateway /stocks) Bostanlı'daki tüm
 * ürünleri tarar; `data/products.json` (Soğukkuyu kataloğu) ve Firestore ek kataloğunda OLMAYAN
 * ürünleri `data/products-bostanli.json` dosyasına yazar. Soğukkuyu dosyasına dokunmaz.
 * Her çalıştırmada dosya baştan üretilir (tekrar çalıştırılabilir; yeni ürünler eklenir).
 *
 * Kullanım:
 *   node --env-file=.env.local scripts/sync-bostanli-catalog.mjs
 *
 * Seçenekler (ortam değişkeni):
 *   DRY_RUN=1        dosya yazmadan rapor verir
 *   GETIR_TOKEN=...  bayi token'ı (verilmezse Firestore `getir_tokens/active_franchise` okunur)
 *   MS_BETWEEN=120   sayfalar arası bekleme (ms)
 */

import { readFile, writeFile, rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, collection, getDocs } from "firebase/firestore";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAIN_PATH = join(ROOT, "data", "products.json");
const OUT_PATH = join(ROOT, "data", "products-bostanli.json");

const BOSTANLI_WAREHOUSE_ID = "5dc32dc9734a192200caddfb";
const STOCKS_URL = "https://franchise-api-gateway.getirapi.com/stocks";
const PAGE_SIZE = 100;
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const MS_BETWEEN = Math.max(0, parseInt(process.env.MS_BETWEEN || "120", 10));
/** Tarama bildirilen toplamın bu oranından azsa dosya yazılmaz (yarım katalog yazılmasın) */
const MIN_COVERAGE = 0.98;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normBarcode = (x) => String(x ?? "").trim().replace(/\s+/g, "");

function pickTr(obj) {
  if (typeof obj === "string") return obj.trim();
  if (!obj || typeof obj !== "object") return "";
  for (const k of ["tr", "en"]) {
    if (typeof obj[k] === "string" && obj[k].trim()) return obj[k].trim();
  }
  return "";
}

function normalizePrice(v) {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > 1_000_000) return undefined;
  return Math.round(v * 100) / 100;
}

/** Stok satırındaki tüm barkodlar (paketleme bilgisinden), tekrarsız, sırayı koruyarak */
function barcodesOf(row) {
  const out = [];
  const pk = row?.packagingInfo;
  if (pk && typeof pk === "object") {
    for (const key of Object.keys(pk)) {
      if (key === "pickingType") continue;
      const list = pk[key]?.barcodes;
      if (!Array.isArray(list)) continue;
      for (const b of list) {
        const n = normBarcode(b);
        if (n && !out.includes(n)) out.push(n);
      }
    }
  }
  return out;
}

function productIdOf(row) {
  const re = /^[a-f0-9]{24}$/i;
  if (typeof row?.product === "string" && re.test(row.product)) return row.product;
  for (const k of ["productId", "id", "_id"]) {
    if (typeof row?.[k] === "string" && re.test(row[k])) return row[k];
  }
  return "";
}

/** Stok satırı → `CatalogProduct` (products.json ile aynı alanlar) */
function toCatalogProduct(row) {
  const barcodes = barcodesOf(row);
  if (barcodes.length === 0) return null;
  const productId = productIdOf(row);
  const name = pickTr(row.fullName) || pickTr(row.name);
  if (!productId || !name) return null;
  const product = { name, barcode: barcodes[0] };
  const pic = pickTr(row.picURL).replace(/\?.*$/, "").replace(/^http:/, "https:");
  if (pic) product.imageUrl = pic;
  product.productId = productId;
  const price = normalizePrice(row.price);
  if (price !== undefined) product.price = price;
  product.barcodes = barcodes;
  const srd = row?.expDays?.dead;
  if (typeof srd === "number" && Number.isFinite(srd) && srd >= 0 && srd <= 3650) {
    product.supplierReturnDays = srd;
  }
  const category = pickTr(row.category?.name);
  if (category) product.category = category;
  const subCategory = pickTr(row.subCategory?.name);
  if (subCategory) product.subCategory = subCategory;
  if (typeof row.storageType === "string" && row.storageType.trim()) {
    product.storageType = row.storageType.trim();
  }
  return product;
}

const db = getFirestore(
  initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  })
);

let token = (process.env.GETIR_TOKEN || "").trim().replace(/^bearer\s+/i, "");
if (!token) token = (await getDoc(doc(db, "getir_tokens", "active_franchise"))).data()?.token || "";
if (!token) {
  console.error("Bayi token'ı yok (GETIR_TOKEN ya da Firestore getir_tokens/active_franchise).");
  process.exit(1);
}

async function fetchPage(offset) {
  const res = await fetch(`${STOCKS_URL}?limit=${PAGE_SIZE}&offset=${offset}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ warehouseIds: [BOSTANLI_WAREHOUSE_ID], sort: { available: 1 } }),
  });
  if (!res.ok) throw new Error(`stocks HTTP ${res.status} (offset=${offset})`);
  return res.json();
}

// 1) Bostanlı'daki tüm stok satırları
const first = await fetchPage(0);
const total = typeof first.total === "number" ? first.total : 0;
const rows = [...(first.data || [])];
for (let offset = PAGE_SIZE; offset < total; offset += PAGE_SIZE) {
  await sleep(MS_BETWEEN);
  rows.push(...((await fetchPage(offset)).data || []));
}
console.log(`Bostanlı stok satırı: ${rows.length} / bildirilen toplam ${total}`);
if (total === 0 || rows.length < total * MIN_COVERAGE) {
  console.error("Tarama eksik kaldı; dosya yazılmadı.");
  process.exit(1);
}

// 2) Zaten katalogda olanlar: products.json + Firestore ek katalog (productId veya barkod)
const main = JSON.parse(await readFile(MAIN_PATH, "utf-8"));
const knownIds = new Set();
const knownBarcodes = new Set();
const note = (p) => {
  if (p?.productId) knownIds.add(String(p.productId).trim());
  for (const b of [p?.barcode, ...(Array.isArray(p?.barcodes) ? p.barcodes : [])]) {
    const n = normBarcode(b);
    if (n) knownBarcodes.add(n);
  }
};
main.forEach(note);
const supp = await getDocs(collection(db, "supplemental_catalog_products"));
supp.forEach((d) => note(d.data()));
console.log(`Katalog: products.json ${main.length} + ek ${supp.size}`);

// 2b) Doğrulama: aynı ürün hem Bostanlı stoğunda hem Soğukkuyu kataloğunda varsa, dönüşümümüz
// katalogdaki değerlerle uyuşuyor mu? (alan eşlemesinin doğru olduğunu gösterir)
const mainById = new Map(main.filter((p) => p.productId).map((p) => [String(p.productId).trim(), p]));
const agree = { compared: 0, name: 0, barcode: 0, image: 0, category: 0, subCategory: 0, srd: 0 };
const imgKey = (u) => String(u ?? "").replace(/\?.*$/, "").replace(/^http:/, "https:");
for (const row of rows) {
  const p = toCatalogProduct(row);
  const m = p && mainById.get(p.productId);
  if (!m) continue;
  agree.compared += 1;
  if (p.name === m.name) agree.name += 1;
  if (p.barcode === m.barcode || (m.barcodes || []).includes(p.barcode)) agree.barcode += 1;
  if (imgKey(p.imageUrl) === imgKey(m.imageUrl)) agree.image += 1;
  if ((p.category ?? "") === (m.category ?? "")) agree.category += 1;
  if ((p.subCategory ?? "") === (m.subCategory ?? "")) agree.subCategory += 1;
  if (p.supplierReturnDays === m.supplierReturnDays) agree.srd += 1;
}
console.log("Eşleme doğrulaması (katalogdaki ortak ürünlerle):", JSON.stringify(agree));

// 3) Katalogda olmayanları ürüne çevir
const out = [];
const seenIds = new Set();
const seenBarcodes = new Set();
const stats = { inCatalog: 0, noBarcodeOrName: 0, duplicate: 0 };
for (const row of rows) {
  const p = toCatalogProduct(row);
  if (!p) {
    stats.noBarcodeOrName += 1;
    continue;
  }
  if (knownIds.has(p.productId) || p.barcodes.some((b) => knownBarcodes.has(b))) {
    stats.inCatalog += 1;
    continue;
  }
  if (seenIds.has(p.productId) || p.barcodes.some((b) => seenBarcodes.has(b))) {
    stats.duplicate += 1;
    continue;
  }
  seenIds.add(p.productId);
  p.barcodes.forEach((b) => seenBarcodes.add(b));
  out.push(p);
}
out.sort((a, b) => a.name.localeCompare(b.name, "tr"));

console.log(
  `Yeni (yalnızca Bostanlı) ürün: ${out.length} | zaten katalogda: ${stats.inCatalog} | barkodsuz/adsız atlanan: ${stats.noBarcodeOrName} | tekrar: ${stats.duplicate}`
);
const withImg = out.filter((p) => p.imageUrl).length;
const withPrice = out.filter((p) => typeof p.price === "number").length;
const withCat = out.filter((p) => p.category).length;
console.log(`Görseli olan: ${withImg} | fiyatı olan: ${withPrice} | kategorisi olan: ${withCat}`);

if (DRY_RUN) {
  console.log("DRY_RUN: dosya yazılmadı. Örnek:", JSON.stringify(out[0]));
  process.exit(0);
}
const tmp = `${OUT_PATH}.tmp`;
await writeFile(tmp, JSON.stringify(out, null, 2) + "\n", "utf-8");
await rename(tmp, OUT_PATH);
console.log(`Yazıldı: data/products-bostanli.json (${out.length} ürün)`);
process.exit(0);

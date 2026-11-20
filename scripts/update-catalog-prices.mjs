/**
 * Katalogdaki tüm ürünlerin fiyatlarını Getir bayi stok listesinden (franchise-api-gateway /stocks,
 * toplu: sayfada 100 ürün) günceller. Yalnızca `price` alanı değişir; başka hiçbir alana dokunulmaz.
 *   - data/products.json          <- Soğukkuyu stoğundaki fiyatlar
 *   - data/products-bostanli.json <- Bostanlı stoğundaki fiyatlar
 * Eşleşme productId (yoksa barkod) iledir. Fiyatı gelmeyen ürünün eski fiyatı korunur.
 * Yalnızca OKUR (Getir'e istek) ve yerel dosya yazar; Firestore'a yazmaz.
 *
 * Kullanım:
 *   node --env-file=.env.local scripts/update-catalog-prices.mjs            (önce rapor, dosya yazmaz)
 *   $env:APPLY="1"; node --env-file=.env.local scripts/update-catalog-prices.mjs   (yazar, yedek alır)
 *
 * Ortam değişkenleri: APPLY=1, GETIR_TOKEN=..., MS_BETWEEN=120
 * (Token verilmezse Firestore `getir_tokens/active_franchise` okunur.)
 */

import { readFile, writeFile, copyFile, rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STOCKS_URL = "https://franchise-api-gateway.getirapi.com/stocks";
const PAGE_SIZE = 100;
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const MS_BETWEEN = Math.max(0, parseInt(process.env.MS_BETWEEN || "120", 10));
const MIN_COVERAGE = 0.98;

const TARGETS = [
  { label: "Soğukkuyu", warehouseId: "6113e59fbb8549d0f20e65f5", file: join(ROOT, "data", "products.json") },
  { label: "Bostanlı", warehouseId: "5dc32dc9734a192200caddfb", file: join(ROOT, "data", "products-bostanli.json") },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normBarcode = (x) => String(x ?? "").trim().replace(/\s+/g, "");
const round2 = (v) => Math.round(v * 100) / 100;

function normalizePrice(v) {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > 1_000_000) return undefined;
  return round2(v);
}

function productIdOf(row) {
  const re = /^[a-f0-9]{24}$/i;
  if (typeof row?.product === "string" && re.test(row.product)) return row.product.toLowerCase();
  for (const k of ["productId", "id", "_id"]) {
    if (typeof row?.[k] === "string" && re.test(row[k])) return row[k].toLowerCase();
  }
  return "";
}

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

async function fetchPage(warehouseId, offset) {
  const res = await fetch(`${STOCKS_URL}?limit=${PAGE_SIZE}&offset=${offset}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ warehouseIds: [warehouseId], sort: { available: 1 } }),
  });
  if (res.status === 401) throw new Error("401: bayi token'ının süresi dolmuş (Bayi panelini yenileyin).");
  if (!res.ok) throw new Error(`stocks HTTP ${res.status} (offset=${offset})`);
  return res.json();
}

async function fetchAllRows(warehouseId) {
  const first = await fetchPage(warehouseId, 0);
  const total = typeof first.total === "number" ? first.total : 0;
  const rows = [...(first.data || [])];
  for (let offset = PAGE_SIZE; offset < total; offset += PAGE_SIZE) {
    await sleep(MS_BETWEEN);
    rows.push(...((await fetchPage(warehouseId, offset)).data || []));
  }
  return { rows, total };
}

const pct = (a, b) => (a ? Math.round(((b - a) / a) * 1000) / 10 : null);
let exitCode = 0;

for (const target of TARGETS) {
  console.log(`\n=== ${target.label} ===`);
  const { rows, total } = await fetchAllRows(target.warehouseId);
  console.log(`Stok satırı: ${rows.length} / bildirilen ${total}`);
  if (total === 0 || rows.length < total * MIN_COVERAGE) {
    console.error("Tarama eksik kaldı; bu depo atlandı.");
    exitCode = 1;
    continue;
  }

  const priceById = new Map();
  const priceByBarcode = new Map();
  let noPrice = 0;
  for (const row of rows) {
    const price = normalizePrice(row.price);
    if (price === undefined) {
      noPrice++;
      continue;
    }
    const id = productIdOf(row);
    if (id) priceById.set(id, price);
    for (const b of barcodesOf(row)) priceByBarcode.set(b, price);
  }
  console.log(`Fiyatı olan stok satırı: ${priceById.size} (fiyatsız: ${noPrice})`);

  const products = JSON.parse(await readFile(target.file, "utf-8"));
  const stats = { changed: 0, same: 0, added: 0, notInStock: 0, noNewPrice: 0 };
  const bigChanges = [];
  const samples = [];
  for (const p of products) {
    const id = String(p.productId || "").toLowerCase();
    let next = id ? priceById.get(id) : undefined;
    if (next === undefined) {
      for (const b of [p.barcode, ...(p.barcodes || [])]) {
        next = priceByBarcode.get(normBarcode(b));
        if (next !== undefined) break;
      }
    }
    if (next === undefined) {
      if (id && !priceById.has(id)) stats.notInStock++;
      else stats.noNewPrice++;
      continue;
    }
    const old = typeof p.price === "number" ? p.price : undefined;
    if (old === next) {
      stats.same++;
      continue;
    }
    if (old === undefined) stats.added++;
    else {
      stats.changed++;
      const change = pct(old, next);
      if (change !== null && Math.abs(change) >= 50) bigChanges.push({ name: p.name, old, next, change });
      if (samples.length < 8) samples.push({ name: p.name, old, next });
    }
    p.price = next;
  }
  console.log(
    `Aynı: ${stats.same} | değişen: ${stats.changed} | fiyatı yeni eklenen: ${stats.added} | ` +
      `stokta bulunamayan (eski fiyat kalır): ${stats.notInStock + stats.noNewPrice}`
  );
  for (const s of samples) console.log(`  örnek: ${s.name}: ${s.old} -> ${s.next}`);
  if (bigChanges.length) {
    console.log(`  %50+ değişen: ${bigChanges.length}`);
    for (const b of bigChanges.slice(0, 8)) console.log(`   ! ${b.name}: ${b.old} -> ${b.next} (%${b.change})`);
  }

  if (!APPLY) continue;
  if (stats.changed + stats.added === 0) {
    console.log("Değişiklik yok; dosya yazılmadı.");
    continue;
  }
  await copyFile(target.file, `${target.file}.bak-before-price-update`);
  const tmp = `${target.file}.tmp`;
  await writeFile(tmp, JSON.stringify(products, null, 2) + (target.file.endsWith("bostanli.json") ? "\n" : ""), "utf-8");
  await rename(tmp, target.file);
  console.log(`Yazıldı: ${target.file} (yedek: .bak-before-price-update)`);
}

if (!APPLY) console.log("\nRapor modu: hiçbir dosya yazılmadı. Yazmak için APPLY=1.");
process.exit(exitCode);

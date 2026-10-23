/**
 * Getir depo API'sinden ürünlerin güncel görsellerini çekip data/products.json'daki `imageUrl`
 * alanını günceller. Eski adres `previousImageUrls`'e eklenir (eski siparişlerdeki görsel de
 * eklentide eşleşsin). Sonra eklenti kataloğunu yeniden üretin: npm run build-extension-catalog
 *
 * Token: Firestore'daki depo paneli token'ı (eklenti otomatik tazeliyor) ya da $env:GETIR_TOKEN.
 *
 * Kullanım (proje kökünde):
 *   node --env-file=.env.local scripts/sync-product-images-from-getir-api.mjs
 */
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { initializeApp } from "firebase/app";
import { doc, getDoc, getFirestore } from "firebase/firestore";

const PRODUCTS_PATH = join(process.cwd(), "data", "products.json");
const FILTER_URL = "https://warehouse-panel-api-gateway.getirapi.com/v3/products/filter";
const PAGE_SIZE = 200;
const MAX_SCAN = 60000;

async function loadToken() {
  const fromEnv = (process.env.GETIR_TOKEN || "").trim().replace(/^Bearer\s+/i, "");
  if (fromEnv) return fromEnv;
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  if (!config.projectId) throw new Error("Firebase ayarı yok. `node --env-file=.env.local ...` ile çalıştırın.");
  const snap = await getDoc(doc(getFirestore(initializeApp(config)), "getir_tokens", "active_warehouse"));
  const token = snap.exists() ? String(snap.data()?.token || "").trim() : "";
  if (!token) throw new Error("Firestore'da depo paneli token'ı yok.");
  return token;
}

const token = await loadToken();

/** @returns ürün listesi; sayfa sunucuda hata verirse null. Bozuk/yarım cevap bir kez tekrar denenir */
async function fetchPage(offset, limit, retried = false) {
  try {
    return await fetchPageOnce(offset, limit);
  } catch (error) {
    if (String(error?.message || "").startsWith("401") || retried) throw error;
    return fetchPage(offset, limit, true);
  }
}

async function fetchPageOnce(offset, limit) {
  const res = await fetch(`${FILTER_URL}?offset=${offset}&limit=${limit}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      countrycode: "TR",
      language: "tr",
      "x-requester-client": "warehouse-panel-frontend",
    },
    body: JSON.stringify({
      fields: "_id barcodes picURL",
      includeDefaultFields: false,
      status: [0, 1, 2, 3, 4],
      language: "tr",
    }),
  });
  if (res.status === 401) throw new Error("401: depo token'ının süresi dolmuş. Depo panelini yenileyip tekrar deneyin.");
  if (!res.ok) return null;
  const json = await res.json();
  return Array.isArray(json?.data?.products) ? json.data.products : [];
}

/** Hatalı sayfayı (bazı ürünlerin görsel alanı bozuk) küçük parçalara bölerek okur */
async function fetchRange(offset, limit, out) {
  const items = await fetchPage(offset, limit);
  if (items) {
    out.push(...items);
    return items.length;
  }
  if (limit === 1) return 1; // bozuk tek ürün atlanır
  const half = Math.ceil(limit / 2);
  const first = await fetchRange(offset, half, out);
  if (first < half) return first;
  return first + (await fetchRange(offset + half, limit - half, out));
}

const pickPic = (pic) => (typeof pic === "string" ? pic : pic?.tr || pic?.en || "");

const products = JSON.parse(await readFile(PRODUCTS_PATH, "utf-8"));
const byId = new Map();
const byBarcode = new Map();
products.forEach((p, i) => {
  if (p.productId) byId.set(String(p.productId).toLowerCase(), i);
  for (const b of [p.barcode, ...(p.barcodes || [])]) if (b) byBarcode.set(String(b).trim(), i);
});

let scanned = 0;
let updated = 0;
let offset = 0;
while (scanned < MAX_SCAN) {
  const items = [];
  const read = await fetchRange(offset, PAGE_SIZE, items);
  if (read === 0) break;
  offset += read;
  scanned += read;
  for (const item of items) {
    const pic = pickPic(item.picURL).replace(/\?.*$/, "");
    if (!pic) continue;
    let idx = byId.get(String(item._id || item.id || "").toLowerCase());
    if (idx === undefined) {
      for (const b of item.barcodes || []) {
        idx = byBarcode.get(String(b).trim());
        if (idx !== undefined) break;
      }
    }
    if (idx === undefined) continue;
    const p = products[idx];
    const current = String(p.imageUrl || "").replace(/^http:/, "https:");
    if (current === pic) continue;
    if (p.imageUrl) p.previousImageUrls = [...new Set([...(p.previousImageUrls || []), p.imageUrl])];
    p.imageUrl = pic;
    updated++;
  }
  console.log(`taranan=${scanned} güncellenen=${updated}`);
}

await writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
console.log(`Kaydedildi: ${PRODUCTS_PATH} (güncellenen görsel: ${updated})`);
process.exit(0);

import { readFile, writeFile } from "fs/promises";
import { join } from "path";

/**
 * Sonradan eklenen ürünlerde (addedFrom=getir-panel) productId mevcutsa,
 * Getir API'ye productId gönderip sadece isim + görsel URL'yi çekip products.json'a yazar.
 *
 * Amaç: tarama yapmadan, doğrudan id -> detay.
 *
 * Kullanım (CMD):
 *   set "GETIR_TOKEN=Bearer ...."
 *   npm run fill-added-details-by-id
 *
 * Opsiyonel:
 *   set "BATCH=100"   (1 istek başına id sayısı)
 */

const PRODUCTS_PATH = join(process.cwd(), "data", "products.json");
const API_BASE = "https://warehouse-panel-api-gateway.getirapi.com";
const API_PATH = "/v3/products/filter";

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

const BATCH = Math.min(200, Number(process.env.BATCH || "100"));

const normalize = (x) => String(x ?? "").trim();

const isPlaceholderName = (name) => {
  if (!name) return true;
  const s = String(name).trim();
  if (!s || s === "-" || s === "[object Object]") return true;
  return s.toLowerCase().includes("getir panelinden eklendi");
};

const pickLocaleString = (v) => {
  if (!v) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object") {
    const tr = v.tr;
    if (typeof tr === "string" && tr.trim()) return tr.trim();
    for (const val of Object.values(v)) {
      if (typeof val === "string" && val.trim()) return val.trim();
    }
  }
  return "";
};

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

const DEBUG_PATH = join(process.cwd(), "scripts", "fill-by-id-debug.json");
let wroteDebug = false;

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

async function postFilter(body, limit = 200) {
  const url = `${API_BASE}${API_PATH}?offset=0&limit=${Math.min(200, limit)}`;
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
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`API hata: ${res.status} ${res.statusText}\n${text.slice(0, 1200)}`);
  }
  const data = text ? JSON.parse(text) : null;
  return data;
}

// 1) products.json oku + hedefleri çıkar
const productsRaw = await readFile(PRODUCTS_PATH, "utf-8");
const products = JSON.parse(productsRaw);
if (!Array.isArray(products)) throw new Error("products.json array olmalı");

const targets = products
  .map((p, idx) => ({ p, idx }))
  .filter(({ p }) => p?.addedFrom === "getir-panel")
  .filter(({ p }) => p?.productId && (isPlaceholderName(p?.name) || !p?.imageUrl))
  .map(({ p, idx }) => ({ idx, productId: normalize(p.productId) }))
  .filter((x) => x.productId.length > 0);

const idToIndexes = new Map();
for (const t of targets) {
  const arr = idToIndexes.get(t.productId) ?? [];
  arr.push(t.idx);
  idToIndexes.set(t.productId, arr);
}

const uniqueIds = Array.from(idToIndexes.keys());
console.log(`🎯 Hedef ürünId sayısı: ${uniqueIds.length}`);

// 2) API'nin id filtre parametresini dene (farklı isimler olabilir)
const baseBody = {
  // Not: Bu endpoint bazı alanları yalnızca barcodes ile birlikte döndürüyor.
  // Daha önce gözlenen stabil payload: id + barcodes + fullName (+picURL opsiyonel).
  fields: "id barcodes fullName picURL",
  includeDefaultFields: false,
  status: [0, 1, 2, 3, 4],
  language: "tr",
};

const idFilterKeys = ["ids", "idList", "productIds", "productIdsList", "id", "_id"];

let workingKey = null;
for (const key of idFilterKeys) {
  try {
    const probe = uniqueIds.slice(0, Math.min(3, uniqueIds.length));
    const data = await postFilter({ ...baseBody, [key]: probe }, 200);
    const items = findItemsArray(data);
    if (items.length > 0 && items.some((it) => it?.id || it?._id)) {
      workingKey = key;
      console.log(`✅ ID filtre anahtarı bulundu: ${key}`);
      break;
    }
  } catch {
    // denemeye devam
  }
}

// Eğer id ile filtreleme yoksa, tarama yapıp id eşleştireceğiz (yine sadece id listesi kadar devam).
const useIdFilter = !!workingKey;
if (!useIdFilter) {
  console.log("ℹ️ ID ile filtreleme bulunamadı; tarama moduna düşülecek.");
}

let updatedName = 0;
let updatedImage = 0;

const applyItem = (item) => {
  const pid = item?.id ? String(item.id) : item?._id ? String(item._id) : "";
  const indexes = idToIndexes.get(pid);
  if (!wroteDebug) {
    wroteDebug = true;
    void writeFile(
      DEBUG_PATH,
      JSON.stringify(
        {
          note: "İlk item debug: id eşleşiyor mu?",
          pid,
          hasPidInTargets: idToIndexes.has(pid),
          firstTargetIds: Array.from(idToIndexes.keys()).slice(0, 30),
          itemKeys: item && typeof item === "object" ? Object.keys(item) : null,
          item,
        },
        null,
        2
      ),
      "utf-8"
    ).catch(() => null);
  }
  if (!indexes) return;

  const name = pickLocaleString(item?.fullName);
  const img = pickLocaleString(item?.picURL);

  for (const idx of indexes) {
    const p = products[idx];
    if (name && isPlaceholderName(p?.name)) {
      p.name = name;
      updatedName += 1;
    }
    if (img && !p?.imageUrl) {
      p.imageUrl = img;
      updatedImage += 1;
    }
  }
  // bu pid tamamlandı say (tekrar işlememek için)
  idToIndexes.delete(pid);
};

if (useIdFilter) {
  for (const part of chunk(uniqueIds, BATCH)) {
    if (idToIndexes.size === 0) break;
    const data = await postFilter({ ...baseBody, [workingKey]: part }, 200);
    const items = findItemsArray(data);
    for (const it of items) applyItem(it);
    console.log(
      `📦 batch=${part.length} remainingIds=${idToIndexes.size} name+${updatedName} img+${updatedImage}`
    );
  }
} else {
  // fallback scan: offset/limit ile dolaş, id set'te olanları buldukça çıkar
  let offset = 0;
  const limit = 200;
  while (idToIndexes.size > 0) {
    const urlBody = { ...baseBody };
    const url = `${API_BASE}${API_PATH}?offset=${offset}&limit=${limit}`;
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
      body: JSON.stringify(urlBody),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) throw new Error(`API hata: ${res.status} ${res.statusText}\n${text.slice(0, 800)}`);
    const data = text ? JSON.parse(text) : null;
    const items = findItemsArray(data);
    if (items.length === 0) break;
    for (const it of items) applyItem(it);
    offset += items.length;
    console.log(
      `📦 scannedOffset=${offset} remainingIds=${idToIndexes.size} name+${updatedName} img+${updatedImage}`
    );
  }
}

await writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
console.log(`✅ Kaydedildi: ${PRODUCTS_PATH}`);
console.log(
  `Özet: nameUpdated=${updatedName} imageUpdated=${updatedImage} remainingIds=${idToIndexes.size}`
);


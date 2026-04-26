import { readFile, writeFile } from "fs/promises";
import { join } from "path";

/**
 * Getir depo paneli "Ürün listesi" endpoint'i ile (warehouse/{id}/products)
 * productId -> isim + görsel URL doldurur.
 *
 * cURL örneği:
 *   POST https://warehouse-panel-api-gateway.getirapi.com/warehouse/<wid>/products?offset=0&limit=20
 *   body: { productIds: ["..."] }
 *
 * Kullanım (CMD):
 *   set "GETIR_TOKEN=Bearer ...."
 *   set "WAREHOUSE_ID=5dc32d8b734a192200caddf8"
 *   npm run fill-missing-details-warehouse
 *
 * Opsiyonel:
 *   set "BATCH=20"        (endpoint limit'i; varsayılan 20)
 */

const PRODUCTS_PATH = join(process.cwd(), "data", "products.json");
const API_BASE = "https://warehouse-panel-api-gateway.getirapi.com";

const warehouseId =
  process.env.WAREHOUSE_ID || "5dc32d8b734a192200caddf8";

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

const BATCH = Math.max(1, Math.min(20, Number(process.env.BATCH || "20")));

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

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const productsRaw = await readFile(PRODUCTS_PATH, "utf-8");
const products = JSON.parse(productsRaw);
if (!Array.isArray(products)) throw new Error("products.json array olmalı");

const targets = products
  .map((p, idx) => ({ p, idx }))
  .filter(({ p }) => !!p?.productId)
  .filter(({ p }) => isPlaceholderName(p?.name) || !p?.imageUrl)
  .map(({ p, idx }) => ({ idx, productId: normalize(p.productId) }))
  .filter((x) => x.productId.length > 0);

const idToIndexes = new Map();
for (const t of targets) {
  const arr = idToIndexes.get(t.productId) ?? [];
  arr.push(t.idx);
  idToIndexes.set(t.productId, arr);
}

const uniqueIds = Array.from(idToIndexes.keys());
console.log(`🎯 Hedef productId: ${uniqueIds.length}`);

let updatedName = 0;
let updatedImage = 0;
const UNRESOLVED_PATH = join(
  process.cwd(),
  "scripts",
  "unresolved-warehouse-products.json"
);

for (const part of chunk(uniqueIds, BATCH)) {
  const url = `${API_BASE}/warehouse/${warehouseId}/products?offset=0&limit=${BATCH}`;
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
    body: JSON.stringify({ productIds: part }),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`API hata: ${res.status} ${res.statusText}\n${text.slice(0, 1200)}`);
  }

  const data = text ? JSON.parse(text) : null;
  const items = findItemsArray(data);

  for (const item of items) {
    const pid =
      item?.id ? String(item.id) : item?._id ? String(item._id) : item?.productId ? String(item.productId) : "";
    if (!pid) continue;
    const idxs = idToIndexes.get(pid);
    if (!idxs) continue;

    const name = pickLocaleString(item?.fullName ?? item?.name);
    const img = pickLocaleString(item?.picURL ?? item?.imageUrl ?? item?.image);

    for (const idx of idxs) {
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

    idToIndexes.delete(pid);
  }

  console.log(
    `📦 batch=${part.length} remaining=${idToIndexes.size} name+${updatedName} img+${updatedImage}`
  );
}

await writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
console.log(`✅ Kaydedildi: ${PRODUCTS_PATH}`);
console.log(`Özet: nameUpdated=${updatedName} imageUpdated=${updatedImage} remaining=${idToIndexes.size}`);

if (idToIndexes.size > 0) {
  await writeFile(
    UNRESOLVED_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        remainingCount: idToIndexes.size,
        remainingProductIds: Array.from(idToIndexes.keys()),
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log(`🟠 Çözümlenemeyen productId yazıldı: ${UNRESOLVED_PATH}`);
}


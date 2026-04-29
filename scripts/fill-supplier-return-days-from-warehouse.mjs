/**
 * Tek seferlik: data/products.json içindeki productId'ler için Getir depo paneli
 * endpoint'inden (warehouse/{id}/products) tedarikçi iade gününü (expDays.dead)
 * çekip `supplierReturnDays` alanına yazar.
 *
 * Kullanım (PowerShell):
 *   $env:GETIR_TOKEN="Bearer eyJ..."   # warehouse.getir.com token
 *   node scripts/fill-supplier-return-days-from-warehouse.mjs
 *
 * Opsiyonel:
 *   $env:WAREHOUSE_ID="5dc32d8b734a192200caddf8"
 *   $env:BATCH="20"         # 1..20
 *   $env:LIMIT="200"        # test için hedef sayısı
 *   $env:DRY_RUN="1"        # dosya yazmaz
 *   $env:MS_BETWEEN="120"   # batch arası bekleme
 */

import { readFile, writeFile, copyFile } from "fs/promises";
import { join } from "path";

const PRODUCTS_PATH = join(process.cwd(), "data", "products.json");
const BACKUP_PATH = join(
  process.cwd(),
  "data",
  "products.json.bak-before-supplier-return-days"
);
const UNRESOLVED_PATH = join(
  process.cwd(),
  "scripts",
  "unresolved-supplier-return-days.json"
);

const API_BASE = "https://warehouse-panel-api-gateway.getirapi.com";
const warehouseId = process.env.WAREHOUSE_ID || "5dc32d8b734a192200caddf8";

const tokenRaw = process.env.GETIR_TOKEN || "";
const authHeader = tokenRaw
  ? tokenRaw.toLowerCase().startsWith("bearer ")
    ? tokenRaw
    : `Bearer ${tokenRaw}`
  : "";

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : null;
const MS_BETWEEN = Math.max(0, parseInt(process.env.MS_BETWEEN || "150", 10));
const BATCH = Math.max(1, Math.min(20, Number(process.env.BATCH || "20")));

if (!authHeader) {
  console.error('❌ GETIR_TOKEN env yok. Örn: $env:GETIR_TOKEN="Bearer ..."');
  process.exit(1);
}

const normalize = (x) => String(x ?? "").trim();

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const pickDays = (item) => {
  const v =
    item?.expDays?.dead ??
    item?.expDays?.supplierReturn ??
    item?.supplierReturnDays ??
    item?.supplierReturnDate;
  if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 3650)
    return v;
  const n = parseInt(String(v ?? ""), 10);
  if (Number.isFinite(n) && n >= 0 && n <= 3650) return n;
  return null;
};

const productsRaw = await readFile(PRODUCTS_PATH, "utf-8");
const products = JSON.parse(productsRaw);
if (!Array.isArray(products)) throw new Error("products.json array olmalı");

const targets = products
  .map((p, idx) => ({ p, idx }))
  .filter(({ p }) => !!p?.productId)
  .filter(({ p }) => p?.supplierReturnDays === undefined || p?.supplierReturnDays === null)
  .map(({ p, idx }) => ({ idx, productId: normalize(p.productId) }))
  .filter((x) => x.productId.length > 0);

const idToIndexes = new Map();
for (const t of targets) {
  const arr = idToIndexes.get(t.productId) ?? [];
  arr.push(t.idx);
  idToIndexes.set(t.productId, arr);
}

let uniqueIds = Array.from(idToIndexes.keys());
if (LIMIT && Number.isFinite(LIMIT) && LIMIT > 0) {
  uniqueIds = uniqueIds.slice(0, LIMIT);
  for (const pid of Array.from(idToIndexes.keys())) {
    if (!uniqueIds.includes(pid)) idToIndexes.delete(pid);
  }
}

console.log(`🎯 Hedef productId (supplierReturnDays boş): ${idToIndexes.size}`);
console.log(`⚙️  batch=${BATCH} dryRun=${DRY_RUN} msBetween=${MS_BETWEEN}`);

if (!DRY_RUN) {
  await copyFile(PRODUCTS_PATH, BACKUP_PATH).catch(() => null);
  console.log(`🧷 Yedek: ${BACKUP_PATH}`);
}

let updated = 0;
let fetched = 0;

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
    throw new Error(
      `API hata: ${res.status} ${res.statusText}\n${text.slice(0, 1200)}`
    );
  }

  const data = text ? JSON.parse(text) : null;
  const items = findItemsArray(data);
  fetched += part.length;

  for (const item of items) {
    const pid =
      item?.id
        ? String(item.id)
        : item?._id
          ? String(item._id)
          : item?.productId
            ? String(item.productId)
            : "";
    if (!pid) continue;
    const idxs = idToIndexes.get(pid);
    if (!idxs) continue;

    const days = pickDays(item);
    if (days === null) continue;

    for (const idx of idxs) {
      const p = products[idx];
      if (p && (p.supplierReturnDays === undefined || p.supplierReturnDays === null)) {
        p.supplierReturnDays = days;
        updated += 1;
      }
    }

    idToIndexes.delete(pid);
  }

  console.log(
    `📦 batch=${part.length} fetched=${fetched} updated=${updated} remaining=${idToIndexes.size}`
  );

  if (MS_BETWEEN) await sleep(MS_BETWEEN);
}

if (!DRY_RUN) {
  await writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
  console.log(`✅ Kaydedildi: ${PRODUCTS_PATH}`);
} else {
  console.log("🧪 DRY_RUN açık — products.json yazılmadı.");
}

console.log(`Özet: updated=${updated} remaining=${idToIndexes.size}`);

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


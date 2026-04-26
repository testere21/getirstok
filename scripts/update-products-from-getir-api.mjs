import { readFile, writeFile } from "fs/promises";
import { join } from "path";

/**
 * Getir API (warehouse-panel-api-gateway) üzerinden ürün bilgisini çekip
 * data/products.json içindeki eksik alanları doldurur.
 *
 * cURL'den gelen endpoint:
 *   GET https://warehouse-panel-api-gateway.getirapi.com/v3/products/filter?offset=0&limit=10
 * body:
 *   { "fields":"_id barcodes picURL fullName", "includeDefaultFields":false, "status":[0,1,2,3,4], "language":"tr" }
 *
 * Kullanım:
 *   $env:GETIR_TOKEN="Bearer ...."   # veya token'ı "Bearer " olmadan da verebilirsin
 *   node scripts/update-products-from-getir-api.mjs
 *
 * Opsiyonel:
 *   $env:GETIR_LIMIT="200"
 *   $env:GETIR_MAX="10000"          # maksimum taranacak ürün (güvenlik)
 */

const PRODUCTS_PATH = join(process.cwd(), "data", "products.json");

const API_BASE = "https://warehouse-panel-api-gateway.getirapi.com";
const API_PATH = "/v3/products/filter";

const LIMIT = Number(process.env.GETIR_LIMIT || "200");
const MAX_SCAN = Number(process.env.GETIR_MAX || "20000");

const tokenRaw = process.env.GETIR_TOKEN || "";
const authHeader = tokenRaw
  ? tokenRaw.toLowerCase().startsWith("bearer ")
    ? tokenRaw
    : `Bearer ${tokenRaw}`
  : "";

if (!authHeader) {
  console.error("❌ GETIR_TOKEN env yok. Örn: $env:GETIR_TOKEN=\"Bearer ...\"");
  process.exit(1);
}

const normalizeBarcode = (x) => String(x ?? "").trim();
const isPlaceholderName = (name) =>
  !name ||
  name === "-" ||
  name === "[object Object]" ||
  String(name).toLowerCase().includes("getir panelinden eklendi");

const isPlaceholderImageUrl = (url) =>
  !url || url === "[object Object]" || String(url).trim().length === 0;

const pickFirstStringDeep = (v) => {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (!v || typeof v !== "object") return "";
  if (Array.isArray(v)) {
    for (const it of v) {
      const s = pickFirstStringDeep(it);
      if (s) return s;
    }
    return "";
  }

  // Yaygın alanlar
  for (const k of ["tr", "value", "text", "name", "fullName", "url", "src", "original"]) {
    if (k in v) {
      const s = pickFirstStringDeep(v[k]);
      if (s) return s;
    }
  }

  // Herhangi bir string değeri
  for (const val of Object.values(v)) {
    const s = pickFirstStringDeep(val);
    if (s) return s;
  }

  return "";
};

const DEBUG_RESPONSE_PATH = join(process.cwd(), "scripts", "getir-api-debug.json");
const SAMPLE_PATH = join(process.cwd(), "scripts", "getir-api-sample-item.json");

const findItemsArray = (root) => {
  // Bazı API'lerde liste `data`, `data.data`, `data.items`, `items`, `result`, `content` vb. olur.
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

const productsRaw = await readFile(PRODUCTS_PATH, "utf-8");
const products = JSON.parse(productsRaw);
if (!Array.isArray(products)) {
  throw new Error("data/products.json array olmalı");
}

// barcode -> index
const indexByBarcode = new Map();
for (let i = 0; i < products.length; i++) {
  const b = normalizeBarcode(products[i]?.barcode);
  if (b) indexByBarcode.set(b, i);
}

// Yalnızca sonradan eklenen ve eksik alanı olan ürünlere odaklan
const targetBarcodes = new Set(
  products
    .filter((p) => p?.addedFrom === "getir-panel")
    .filter(
      (p) => isPlaceholderName(p?.name) || !p?.productId || isPlaceholderImageUrl(p?.imageUrl)
    )
    .map((p) => normalizeBarcode(p?.barcode))
    .filter((b) => b.length > 0)
);
console.log(`🎯 Hedef ürün (addedFrom=getir-panel) sayısı: ${targetBarcodes.size}`);

const baseRequestBody = {
  fields: "_id barcodes picURL fullName",
  includeDefaultFields: false,
  status: [0, 1, 2, 3, 4],
  language: "tr",
};

let offset = 0;
let scanned = 0;
let matched = 0;
let updated = 0;

const UNRESOLVED_PATH = join(
  process.cwd(),
  "scripts",
  "unresolved-getir-panel-barcodes.json"
);

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

async function postFilter({ offset, limit, body }) {
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
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `API hata: ${res.status} ${res.statusText}\n${text.slice(0, 1200)}`
    );
  }
  const data = await res.json();
  return { url, data };
}

const debugWrittenBarcodes = new Set();

function applyItemToProducts(item) {
  const productId =
    item?._id ? String(item._id) : item?.id ? String(item.id) : "";
  const name = pickFirstStringDeep(item?.fullName);
  const picURL = pickFirstStringDeep(item?.picURL);
  const barcodes = Array.isArray(item?.barcodes) ? item.barcodes : [];

  for (const bc of barcodes) {
    const b = normalizeBarcode(bc);
    if (!targetBarcodes.has(b)) continue;
    const idx = indexByBarcode.get(b);
    if (idx === undefined) continue;
    matched += 1;

    const p = products[idx];
    const shouldName = isPlaceholderName(p?.name) && name;
    const shouldId = !p?.productId && productId;
    const shouldImg = isPlaceholderImageUrl(p?.imageUrl) && picURL;

    if (shouldName) p.name = name;
    if (shouldId) p.productId = productId;
    if (shouldImg) p.imageUrl = picURL;

    if (shouldName || shouldId || shouldImg) updated += 1;

    // Eğer eşleşti ama veri boşsa, örnek item'i debug'a yaz (ilk kez)
    if ((!name || !picURL || !productId) && !debugWrittenBarcodes.has(b)) {
      debugWrittenBarcodes.add(b);
      void writeFile(
        SAMPLE_PATH,
        JSON.stringify(
          {
            note: "Eşleşen barkod bulundu ama alanlar boş/uyumsuz.",
            matchedBarcode: b,
            extracted: { productId, name, picURL },
            itemKeys: item && typeof item === "object" ? Object.keys(item) : null,
            item,
          },
          null,
          2
        ),
        "utf-8"
      ).catch(() => null);
    }

    const done =
      !isPlaceholderName(p?.name) &&
      !!p?.productId &&
      !isPlaceholderImageUrl(p?.imageUrl);
    if (done) targetBarcodes.delete(b);
  }
}

while (scanned < MAX_SCAN) {
  if (targetBarcodes.size === 0) {
    console.log("✅ Tüm hedef ürünler dolduruldu. Durduruluyor.");
    break;
  }
  // Önce "barcodes ile filtreleme"yi dene (destekleniyorsa çok hızlı).
  // Desteklenmiyorsa API hata mesajı gelir; o zaman alttaki tam tarama moduna düşeceğiz.
  if (offset === 0) {
    try {
      const targets = Array.from(targetBarcodes);
      // çok büyük tek payload yerine batch
      for (const part of chunk(targets, 250)) {
        const { data } = await postFilter({
          offset: 0,
          limit: Math.min(200, LIMIT),
          body: { ...baseRequestBody, barcodes: part },
        });
        const items = findItemsArray(data).filter(
          (x) =>
            x &&
            typeof x === "object" &&
            (x.barcodes || x.fullName || x.picURL || x._id)
        );
        for (const it of items) applyItemToProducts(it);
        console.log(
          `🔎 barcode-filter batch=${part.length} updated=${updated} remainingTargets=${targetBarcodes.size}`
        );
        if (targetBarcodes.size === 0) break;
      }
      if (targetBarcodes.size === 0) break;

      // Eğer barcode-filter hiç bir şey düşürmediyse, muhtemelen desteklenmiyor ya da filtre alan adı farklı.
      // Tam tarama moduna geçmek için offset'i 0 bırakıp aşağı devam ediyoruz.
    } catch (e) {
      console.log(
        "ℹ️ barcode ile filtreleme desteklenmiyor olabilir, tam tarama moduna geçiliyor."
      );
      // debug için ilk hata metnini yaz
      await writeFile(
        DEBUG_RESPONSE_PATH,
        JSON.stringify(
          { note: "barcode filter denemesi hata verdi", error: String(e) },
          null,
          2
        ),
        "utf-8"
      ).catch(() => null);
    }
  }

  const { url, data } = await postFilter({
    offset,
    limit: LIMIT,
    body: baseRequestBody,
  });
  const items = findItemsArray(data).filter(
    (x) => x && typeof x === "object" && (x.barcodes || x.fullName || x.picURL || x._id)
  );
  if (items.length === 0) {
    await writeFile(
      DEBUG_RESPONSE_PATH,
      JSON.stringify(
        {
          url,
          note: "Liste alanı bulunamadı veya boş geldi. API response formatını kontrol edin.",
          topLevelKeys: data && typeof data === "object" ? Object.keys(data) : null,
          responseSample: data,
        },
        null,
        2
      ),
      "utf-8"
    );
    throw new Error(
      `API yanıtında ürün listesi bulunamadı. Debug yazıldı: ${DEBUG_RESPONSE_PATH}`
    );
  }

  for (const item of items) {
    scanned += 1;
    applyItemToProducts(item);
  }

  offset += items.length;
  console.log(
    `📦 scanned=${scanned} matched=${matched} updated=${updated} offset=${offset} remainingTargets=${targetBarcodes.size}`
  );

  if (items.length < LIMIT) {
    console.log("✅ Son sayfa (limit'ten az geldi).");
    break;
  }
}

await writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
console.log(`✅ Kaydedildi: ${PRODUCTS_PATH}`);
console.log(`Özet: scanned=${scanned} matched=${matched} updated=${updated}`);

if (targetBarcodes.size > 0) {
  await writeFile(
    UNRESOLVED_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        remainingCount: targetBarcodes.size,
        remainingBarcodes: Array.from(targetBarcodes),
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log(`🟠 Çözümlenemeyen barkodlar yazıldı: ${UNRESOLVED_PATH}`);
}


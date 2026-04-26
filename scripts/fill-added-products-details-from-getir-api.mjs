import { readFile, writeFile } from "fs/promises";
import { join } from "path";

/**
 * `addedFrom: "getir-panel"` ile sonradan eklenen ürünlerin
 * `name` (fullName.tr) ve mümkünse `imageUrl` alanlarını Getir API'den doldurur.
 *
 * Not: `/v3/products/filter` endpoint'i bazı ürünlerde `picURL.en=null` gibi hatalarla 500 döndürebiliyor.
 * Bu yüzden varsayılan olarak sadece `fullName` çekiyoruz (name doldurma %100 stabil).
 * Görsel için opsiyonel `GETIR_WITH_IMAGES=1` ile `picURL` da istenir; hata olursa otomatik görseli kapatıp devam eder.
 *
 * Kullanım (CMD):
 *   set "GETIR_TOKEN=Bearer ...."
 *   npm run fill-added-details
 *
 * Opsiyonel:
 *   set "GETIR_WITH_IMAGES=1"
 *   set "GETIR_LIMIT=200"
 *   set "GETIR_MAX=60000"
 */

const PRODUCTS_PATH = join(process.cwd(), "data", "products.json");
const API_BASE = "https://warehouse-panel-api-gateway.getirapi.com";
const API_PATH = "/v3/products/filter";
const LIMIT = Number(process.env.GETIR_LIMIT || "200");
const MAX_SCAN = Number(process.env.GETIR_MAX || "60000");
const WITH_IMAGES = process.env.GETIR_WITH_IMAGES === "1";

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

const SAMPLE_PATH = join(process.cwd(), "scripts", "fill-added-details-sample.json");
let wroteSample = false;

const pickLocaleString = (v) => {
  if (!v) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object") {
    // fullName / picURL genelde { tr, en }
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

const productsRaw = await readFile(PRODUCTS_PATH, "utf-8");
const products = JSON.parse(productsRaw);
if (!Array.isArray(products)) throw new Error("products.json array olmalı");

const isPlaceholderNameValue = (name) => {
  if (!name) return true;
  const s = String(name).trim();
  if (!s || s === "-" || s === "[object Object]") return true;
  return s.toLowerCase().includes("getir panelinden eklendi");
};

const targets = products
  .filter((p) => p?.addedFrom === "getir-panel")
  // Sadece gerçekten eksik olanları hedefle (daha hızlı ve loglar anlamlı)
  .filter((p) => isPlaceholderNameValue(p?.name) || !p?.imageUrl);
const targetByBarcode = new Map();
for (const p of targets) {
  const b = normalizeBarcode(p?.barcode);
  if (b) targetByBarcode.set(b, p);
  const alts = Array.isArray(p?.barcodes) ? p.barcodes : [];
  for (const a of alts) {
    const ab = normalizeBarcode(a);
    if (ab) targetByBarcode.set(ab, p);
  }
}

console.log(
  `🎯 Hedef (addedFrom=getir-panel ve eksik isim/görsel): ${targets.length}`
);

let offset = 0;
let scanned = 0;
let matched = 0;
let updatedName = 0;
let updatedImage = 0;
let imageMode = WITH_IMAGES;

const TARGET_DEBUG_PATH = join(
  process.cwd(),
  "scripts",
  "fill-added-details-target-sample.json"
);
const PAGE_DEBUG_PATH = join(
  process.cwd(),
  "scripts",
  "fill-added-details-page-sample.json"
);
await writeFile(
  TARGET_DEBUG_PATH,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      targetCount: targets.length,
      targetBarcodeKeyCount: targetByBarcode.size,
      sampleTargetBarcodeKeys: Array.from(targetByBarcode.keys()).slice(0, 60),
    },
    null,
    2
  ),
  "utf-8"
).catch(() => null);

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

// Önce: barcodes filtresi ile doğrudan hedefleri çekmeyi dene (tarama yok).
// Desteklenmezse (400/validation) aşağıdaki tam tarama moduna düşer.
try {
  const barcodeKeys = Array.from(targetByBarcode.keys());
  if (barcodeKeys.length > 0) {
    console.log("🔎 Barkod filtresi ile doğrudan çekme deneniyor...");

    const limit = Math.min(200, LIMIT);
    for (const part of chunk(barcodeKeys, 200)) {
      const fields = imageMode
        ? "id _id barcodes fullName picURL"
        : "id _id barcodes fullName";

      const url = `${API_BASE}${API_PATH}?offset=0&limit=${limit}`;
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
        body: JSON.stringify({
          fields,
          includeDefaultFields: false,
          status: [0, 1, 2, 3, 4],
          language: "tr",
          barcodes: part,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `barcode-filter hata: ${res.status} ${res.statusText}\n${text.slice(0, 800)}`
        );
      }

      const data = await res.json();
      const items = findItemsArray(data);
      for (const item of items) {
        // normal akıştaki update mantığını aynen kullan
        scanned += 1;
        const barcodes = Array.isArray(item?.barcodes) ? item.barcodes : [];
        if (barcodes.length === 0) continue;

        let target = null;
        for (const bc of barcodes) {
          const b = normalizeBarcode(bc);
          const t = targetByBarcode.get(b);
          if (t) {
            target = t;
            break;
          }
        }
        if (!target) continue;
        matched += 1;

        const name = pickLocaleString(item?.fullName);
        const isPlaceholderName = isPlaceholderNameValue(target.name);
        if (name && isPlaceholderName) {
          target.name = name;
          updatedName += 1;
        }

        if (imageMode) {
          const img = pickLocaleString(item?.picURL);
          if (img && !target.imageUrl) {
            target.imageUrl = img;
            updatedImage += 1;
          }
        }
      }

      console.log(
        `🔎 barcode-filter batch=${part.length} matched=${matched} name+${updatedName} img+${updatedImage}`
      );
    }

    await writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
    console.log(`✅ Kaydedildi: ${PRODUCTS_PATH}`);
    console.log(
      `Özet (barcode-filter): scanned=${scanned} matched=${matched} nameUpdated=${updatedName} imageUpdated=${updatedImage}`
    );
    process.exit(0);
  }
} catch (e) {
  console.log(
    "ℹ️ Barkod filtresi desteklenmiyor/başarısız. Tam tarama moduna geçiliyor."
  );
  await writeFile(
    join(process.cwd(), "scripts", "fill-added-details-barcode-filter-error.json"),
    JSON.stringify({ error: String(e) }, null, 2),
    "utf-8"
  ).catch(() => null);
}

while (scanned < MAX_SCAN) {
  const fields = imageMode
    ? "id _id barcodes fullName picURL"
    : "id _id barcodes fullName";

  const url = `${API_BASE}${API_PATH}?offset=${offset}&limit=${Math.min(
    200,
    LIMIT
  )}`;

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
    body: JSON.stringify({
      fields,
      includeDefaultFields: false,
      status: [0, 1, 2, 3, 4],
      language: "tr",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Bazı sayfalarda picURL yüzünden 500 dönebiliyor.
    // Bu durumda aynı offset'i görselsiz tekrar isteyip isim doldurmaya devam edelim.
    if (imageMode && res.status >= 500) {
      console.log(
        "⚠️ Bu sayfada görsel alanı API hatasına sebep oldu. Aynı sayfa görselsiz tekrar deneniyor."
      );
      imageMode = false;
      // offset değiştirmeden loop başına dön: bir sonraki iterasyonda aynı sayfa görselsiz çekilecek
      continue;
    }
    throw new Error(
      `API hata: ${res.status} ${res.statusText}\n${text.slice(0, 1200)}`
    );
  }

  const data = await res.json();
  const items = findItemsArray(data);
  if (items.length === 0) {
    console.log("✅ Veri bitti. Durduruluyor.");
    break;
  }

  if (offset === 0) {
    const firstBarcodes = [];
    for (const it of items.slice(0, 30)) {
      const bcs = Array.isArray(it?.barcodes) ? it.barcodes : [];
      for (const bc of bcs) {
        const b = normalizeBarcode(bc);
        if (b) firstBarcodes.push(b);
      }
    }
    await writeFile(
      PAGE_DEBUG_PATH,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          note: "İlk sayfadaki ürünlerden örnek barkodlar",
          offset,
          itemsCount: items.length,
          sampleBarcodes: firstBarcodes.slice(0, 120),
        },
        null,
        2
      ),
      "utf-8"
    ).catch(() => null);
  }

  for (const item of items) {
    scanned += 1;
    const barcodes = Array.isArray(item?.barcodes) ? item.barcodes : [];
    if (barcodes.length === 0) continue;

    let target = null;
    for (const bc of barcodes) {
      const b = normalizeBarcode(bc);
      const t = targetByBarcode.get(b);
      if (t) {
        target = t;
        break;
      }
    }
    if (!target) continue;
    matched += 1;

    const name = pickLocaleString(item?.fullName);
    const isPlaceholderName = isPlaceholderNameValue(target.name);

    if (!wroteSample) {
      wroteSample = true;
      await writeFile(
        SAMPLE_PATH,
        JSON.stringify(
          {
            note: "İlk eşleşen item + hedef ürün (debug)",
            target: {
              barcode: target.barcode,
              name: target.name,
              imageUrl: target.imageUrl,
              productId: target.productId,
            },
            extracted: { name },
            isPlaceholderName,
            itemKeys: item && typeof item === "object" ? Object.keys(item) : null,
            item,
          },
          null,
          2
        ),
        "utf-8"
      ).catch(() => null);
    }

    if (name && isPlaceholderName) {
      target.name = name;
      updatedName += 1;
    }

    if (imageMode) {
      const img = pickLocaleString(item?.picURL);
      if (img && !target.imageUrl) {
        target.imageUrl = img;
        updatedImage += 1;
      }
    }
  }

  offset += items.length;
  console.log(
    `📦 scanned=${scanned} matched=${matched} name+${updatedName} img+${updatedImage} offset=${offset} images=${imageMode ? "on" : "off"}`
  );

  // Eğer bu sayfada 500 yüzünden imageMode kapandıysa, sonraki sayfada tekrar açmayı deneyelim.
  if (!imageMode && WITH_IMAGES) {
    imageMode = true;
  }
}

await writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
console.log(`✅ Kaydedildi: ${PRODUCTS_PATH}`);
console.log(
  `Özet: scanned=${scanned} matched=${matched} nameUpdated=${updatedName} imageUpdated=${updatedImage} images=${imageMode ? "on" : "off"}`
);


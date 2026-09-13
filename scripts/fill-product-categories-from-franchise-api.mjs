/**
 * Tek seferlik: Getir bayi paneli `/products` endpoint'inden kategori bilgisini
 * sayfa sayfa çekip data/products.json içine `category`, `subCategory` ve
 * `storageType` alanlarını yazar.
 *
 * Aynı cevapta `price` ve `expDays.dead` de geliyor. Bunlar VARSAYILAN OLARAK
 * YAZILMAZ; script sadece mevcut değerlerle ne kadar uyuştuklarını raporlar.
 * Rapor iyiyse FILL_PRICE=1 / FILL_SRD=1 ile ikinci tur atılır.
 *
 * Kullanım (PowerShell):
 *   $env:GETIR_TOKEN="eyJ..."   # bayi (franchise) paneli token'ı
 *   node scripts/fill-product-categories-from-franchise-api.mjs
 *
 * Opsiyonel:
 *   $env:DRY_RUN="1"        # dosyaya yazmaz, ilk sayfaları çekip örnek basar
 *   $env:LIMIT="2"          # sadece N sayfa çek (test)
 *   $env:MS_BETWEEN="150"   # sayfalar arası bekleme
 *   $env:WAREHOUSE_ID="..." # varsayılan Soğukkuyu
 *   $env:OVERWRITE="1"      # dolu kategorileri de ez (varsayılan: sadece boşları doldur)
 *   $env:FILL_PRICE="1"     # boş fiyatları API'den doldur
 *   $env:REFRESH_PRICE="1"  # mevcut fiyatların da üzerine yaz (bayat fiyat tazeleme)
 *   $env:FILL_SRD="1"       # boş supplierReturnDays'leri expDays.dead'den doldur
 */

import { readFile, writeFile, copyFile } from "fs/promises";
import { join } from "path";

const PRODUCTS_PATH = join(process.cwd(), "data", "products.json");
const BACKUP_PATH = join(
  process.cwd(),
  "data",
  "products.json.bak-before-categories"
);
const UNRESOLVED_PATH = join(
  process.cwd(),
  "scripts",
  "unresolved-categories.json"
);

const API_URL = "https://franchise-api-gateway.getirapi.com/products";
const WAREHOUSE_ID = process.env.WAREHOUSE_ID || "6113e59fbb8549d0f20e65f5";
const PAGE_SIZE = 100;
const MAX_PAGES = 200;

const tokenRaw = (process.env.GETIR_TOKEN || "").trim();
const authHeader = tokenRaw
  ? tokenRaw.toLowerCase().startsWith("bearer ")
    ? tokenRaw
    : `Bearer ${tokenRaw}`
  : "";

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const OVERWRITE = process.env.OVERWRITE === "1" || process.env.OVERWRITE === "true";
const FILL_PRICE = process.env.FILL_PRICE === "1" || process.env.FILL_PRICE === "true";
const FILL_SRD = process.env.FILL_SRD === "1" || process.env.FILL_SRD === "true";
/** Boş olanı doldurmakla yetinmeyip mevcut fiyatın da üzerine yaz. */
const REFRESH_PRICE =
  process.env.REFRESH_PRICE === "1" || process.env.REFRESH_PRICE === "true";
const PAGE_LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : null;
const MS_BETWEEN = Math.max(0, parseInt(process.env.MS_BETWEEN || "150", 10));

if (!authHeader) {
  console.error('❌ GETIR_TOKEN env yok. Örn: $env:GETIR_TOKEN="eyJ..."');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const normalizeBarcode = (x) => String(x ?? "").trim().replace(/\s+/g, "");

/** `{ tr, en }` isim nesnesinden Türkçe adı al. */
function pickTr(nameObj) {
  if (!nameObj || typeof nameObj !== "object") return "";
  const tr = typeof nameObj.tr === "string" ? nameObj.tr.trim() : "";
  if (tr) return tr;
  const en = typeof nameObj.en === "string" ? nameObj.en.trim() : "";
  return en;
}

function normalizePrice(v) {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  if (v > 1_000_000) return null;
  return Math.round(v * 100) / 100;
}

function normalizeDays(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (v < 0 || v > 3650) return null;
  return v;
}

/** Cevap zarfı: `{ data: [...] }` bekliyoruz, olmazsa ilk nesne dizisini bul. */
function extractItems(root) {
  if (Array.isArray(root?.data)) return root.data;
  const queue = [root];
  const seen = new Set();
  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
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
}

/** Toplam ürün sayısı cevabın neresinde olursa olsun bulunsun. */
function extractTotal(root) {
  const candidates = [
    root?.total,
    root?.totalCount,
    root?.count,
    root?.meta?.total,
    root?.meta?.totalCount,
    root?.pagination?.total,
    root?.pagination?.totalCount,
  ];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c) && c > 0) return c;
  }
  return null;
}

async function fetchPage(offset) {
  const url = `${API_URL}?limit=${PAGE_SIZE}&offset=${offset}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      warehouseId: WAREHOUSE_ID,
      countryCode: "TR",
      language: "tr",
      searchFilterOptions: {
        fullName: true,
        barcodes: true,
        supplier: true,
        brandName: true,
        manufacturerName: true,
        masterCategoryName: true,
      },
    }),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    return { ok: false, status: res.status, body: text.slice(0, 600) };
  }
  return { ok: true, status: res.status, json: text ? JSON.parse(text) : null };
}

const products = JSON.parse(await readFile(PRODUCTS_PATH, "utf-8"));
if (!Array.isArray(products)) throw new Error("products.json array olmalı");

/** productId -> products.json indeksleri (aynı id birden fazla satırda olabilir) */
const pidToIndexes = new Map();
/** barkod -> indeksler (productId eşleşmezse yedek yol) */
const barcodeToIndexes = new Map();

products.forEach((p, idx) => {
  const pid = String(p?.productId ?? "").trim();
  if (pid) {
    const arr = pidToIndexes.get(pid) ?? [];
    arr.push(idx);
    pidToIndexes.set(pid, arr);
  }
  const all = [p?.barcode, ...(Array.isArray(p?.barcodes) ? p.barcodes : [])];
  for (const b of all) {
    const key = normalizeBarcode(b);
    if (!key) continue;
    const arr = barcodeToIndexes.get(key) ?? [];
    if (!arr.includes(idx)) arr.push(idx);
    barcodeToIndexes.set(key, arr);
  }
});

console.log(`📦 products.json: ${products.length} ürün, ${pidToIndexes.size} tekil productId`);
console.log(
  `⚙️  dryRun=${DRY_RUN} overwrite=${OVERWRITE} fillPrice=${FILL_PRICE} fillSrd=${FILL_SRD} pageLimit=${PAGE_LIMIT ?? "tümü"}`
);

const stats = {
  pages: 0,
  fetched: 0,
  matchedByPid: 0,
  matchedByBarcode: 0,
  unmatched: 0,
  category: 0,
  subCategory: 0,
  storageType: 0,
  price: 0,
  priceRefreshed: 0,
  srd: 0,
};

/** API fiyatı / iade günü mevcut değerlerle uyuşuyor mu? */
const priceCheck = { same: 0, diff: 0, samples: [] };
const srdCheck = { same: 0, diff: 0, samples: [] };

const unmatchedItems = [];
let sampleLogged = 0;
let httpError = null;
/** İlk sayfada bildirilen toplam ürün sayısı; sayfalama bunun üzerinden biter. */
let apiTotal = null;

function applyToProduct(p, item, catTr, subTr) {
  const storage =
    typeof item?.storageType === "string" ? item.storageType.trim() : "";
  const apiPrice = normalizePrice(item?.price);
  const apiSrd = normalizeDays(item?.expDays?.dead);

  if (catTr && (OVERWRITE || !p.category)) {
    p.category = catTr;
    stats.category += 1;
  }
  if (subTr && (OVERWRITE || !p.subCategory)) {
    p.subCategory = subTr;
    stats.subCategory += 1;
  }
  if (storage && (OVERWRITE || !p.storageType)) {
    p.storageType = storage;
    stats.storageType += 1;
  }

  // Doğrulama: mevcut değerle API değerini karşılaştır (yazmadan)
  if (apiPrice != null && typeof p.price === "number") {
    if (Math.abs(apiPrice - p.price) < 0.01) priceCheck.same += 1;
    else {
      priceCheck.diff += 1;
      if (priceCheck.samples.length < 10) {
        priceCheck.samples.push({
          name: String(p.name ?? "").slice(0, 45),
          mevcut: p.price,
          api: apiPrice,
        });
      }
    }
  }
  if (apiSrd != null && typeof p.supplierReturnDays === "number") {
    if (apiSrd === p.supplierReturnDays) srdCheck.same += 1;
    else {
      srdCheck.diff += 1;
      if (srdCheck.samples.length < 10) {
        srdCheck.samples.push({
          name: String(p.name ?? "").slice(0, 45),
          mevcut: p.supplierReturnDays,
          api: apiSrd,
        });
      }
    }
  }

  if (apiPrice != null) {
    if (FILL_PRICE && typeof p.price !== "number") {
      p.price = apiPrice;
      stats.price += 1;
    } else if (REFRESH_PRICE && Math.abs(apiPrice - p.price) >= 0.01) {
      p.price = apiPrice;
      stats.priceRefreshed += 1;
    }
  }
  if (FILL_SRD && apiSrd != null && typeof p.supplierReturnDays !== "number") {
    p.supplierReturnDays = apiSrd;
    stats.srd += 1;
  }
}

for (let page = 0; page < MAX_PAGES; page++) {
  if (PAGE_LIMIT != null && page >= PAGE_LIMIT) break;

  const offset = page * PAGE_SIZE;
  const res = await fetchPage(offset);

  if (!res.ok) {
    httpError = `HTTP ${res.status} (offset=${offset}): ${res.body}`;
    console.error(`❌ ${httpError}`);
    console.error("   Sayfalama durduruldu, o ana kadarki sonuç yazılacak.");
    break;
  }

  const total = extractTotal(res.json) ?? apiTotal;
  if (apiTotal == null && total != null) apiTotal = total;
  const items = extractItems(res.json);
  stats.pages += 1;
  stats.fetched += items.length;

  if (page === 0) {
    console.log(
      `🌐 İlk sayfa: ${items.length} kayıt, API toplam=${total ?? "bildirilmedi"}`
    );
  }

  for (const item of items) {
    const pid = String(item?.id ?? item?._id ?? "").trim();
    const catTr = pickTr(item?.category?.name);
    const subTr = pickTr(item?.subCategory?.name);

    let indexes = pid ? pidToIndexes.get(pid) : undefined;
    let via = "pid";
    if (!indexes) {
      const apiBarcodes = Array.isArray(item?.barcodes) ? item.barcodes : [];
      for (const b of apiBarcodes) {
        const hit = barcodeToIndexes.get(normalizeBarcode(b));
        if (hit) {
          indexes = hit;
          via = "barcode";
          break;
        }
      }
    }

    if (!indexes) {
      stats.unmatched += 1;
      if (unmatchedItems.length < 500) {
        unmatchedItems.push({
          productId: pid,
          name: pickTr(item?.name),
          category: catTr,
        });
      }
      continue;
    }

    if (via === "pid") stats.matchedByPid += 1;
    else stats.matchedByBarcode += 1;

    if (DRY_RUN) {
      if (sampleLogged < 8) {
        sampleLogged += 1;
        const p = products[indexes[0]];
        console.log(
          `[DRY] ${via} ${pid} | ${String(p?.name ?? "").slice(0, 40)} -> ` +
            `kategori="${catTr}" alt="${subTr}" saklama="${item?.storageType ?? ""}" ` +
            `apiFiyat=${item?.price ?? "-"} (mevcut ${p?.price ?? "-"}) ` +
            `apiIadeGün=${item?.expDays?.dead ?? "-"} (mevcut ${p?.supplierReturnDays ?? "-"})`
        );
      }
      // DRY_RUN'da da karşılaştırma raporu için sayımları işlet
      const p = products[indexes[0]];
      const apiPrice = normalizePrice(item?.price);
      const apiSrd = normalizeDays(item?.expDays?.dead);
      if (apiPrice != null && typeof p?.price === "number") {
        if (Math.abs(apiPrice - p.price) < 0.01) priceCheck.same += 1;
        else {
          priceCheck.diff += 1;
          if (priceCheck.samples.length < 10) {
            priceCheck.samples.push({
              name: String(p.name ?? "").slice(0, 45),
              mevcut: p.price,
              api: apiPrice,
            });
          }
        }
      }
      if (apiSrd != null && typeof p?.supplierReturnDays === "number") {
        if (apiSrd === p.supplierReturnDays) srdCheck.same += 1;
        else {
          srdCheck.diff += 1;
          if (srdCheck.samples.length < 10) {
            srdCheck.samples.push({
              name: String(p.name ?? "").slice(0, 45),
              mevcut: p.supplierReturnDays,
              api: apiSrd,
            });
          }
        }
      }
      if (catTr) stats.category += 1;
      if (subTr) stats.subCategory += 1;
      continue;
    }

    for (const idx of indexes) {
      applyToProduct(products[idx], item, catTr, subTr);
    }
  }

  // Kısa sayfa "bitti" demek değil: API bazı sayfalarda 100 yerine 99 döndürüyor.
  // `total` bildirildiği sürece ona güveniyoruz.
  const done =
    items.length === 0 ||
    (total != null ? offset + PAGE_SIZE >= total : items.length < PAGE_SIZE);
  console.log(
    `📄 sayfa=${page + 1} offset=${offset} kayıt=${items.length} ` +
      `eşleşen=${stats.matchedByPid + stats.matchedByBarcode} eşleşmeyen=${stats.unmatched}`
  );
  if (done) break;

  if (MS_BETWEEN) await sleep(MS_BETWEEN);
}

console.log("\n--- Özet ---");
console.log(`sayfa=${stats.pages} çekilen=${stats.fetched}`);
console.log(
  `eşleşme: productId=${stats.matchedByPid} barkod=${stats.matchedByBarcode} eşleşmeyen=${stats.unmatched}`
);
console.log(
  `yazılan: kategori=${stats.category} altKategori=${stats.subCategory} saklama=${stats.storageType} ` +
    `fiyat=${stats.price} fiyatTazelendi=${stats.priceRefreshed} iadeGünü=${stats.srd}`
);

const priceTotal = priceCheck.same + priceCheck.diff;
if (priceTotal > 0) {
  const pct = ((priceCheck.same / priceTotal) * 100).toFixed(1);
  console.log(`\n💰 Fiyat doğrulama: ${priceCheck.same}/${priceTotal} aynı (%${pct})`);
  if (priceCheck.samples.length > 0) {
    console.log("   Farklı örnekler:");
    for (const s of priceCheck.samples) {
      console.log(`   - ${s.name}: mevcut=${s.mevcut} api=${s.api}`);
    }
  }
}

const srdTotal = srdCheck.same + srdCheck.diff;
if (srdTotal > 0) {
  const pct = ((srdCheck.same / srdTotal) * 100).toFixed(1);
  console.log(`\n📅 İade günü doğrulama: ${srdCheck.same}/${srdTotal} aynı (%${pct})`);
  if (srdCheck.samples.length > 0) {
    console.log("   Farklı örnekler:");
    for (const s of srdCheck.samples) {
      console.log(`   - ${s.name}: mevcut=${s.mevcut} api=${s.api}`);
    }
  }
}

if (DRY_RUN) {
  console.log("\n🧪 DRY_RUN açık — products.json yazılmadı.");
} else {
  await copyFile(PRODUCTS_PATH, BACKUP_PATH).catch(() => null);
  console.log(`\n🧷 Yedek: ${BACKUP_PATH}`);
  await writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
  console.log(`✅ Kaydedildi: ${PRODUCTS_PATH}`);

  const withCategory = products.filter((p) => p?.category).length;
  console.log(`📊 Kategorisi olan ürün: ${withCategory}/${products.length}`);

  const missingCategory = products
    .filter((p) => !p?.category)
    .map((p) => ({
      name: String(p?.name ?? "").slice(0, 60),
      barcode: p?.barcode,
      productId: p?.productId,
    }));

  await writeFile(
    UNRESOLVED_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        httpError,
        stats,
        priceCheck: { same: priceCheck.same, diff: priceCheck.diff },
        srdCheck: { same: srdCheck.same, diff: srdCheck.diff },
        katalogdaKategorisizCount: missingCategory.length,
        katalogdaKategorisiz: missingCategory.slice(0, 2000),
        apiDeOlupKatalogdaOlmayanCount: stats.unmatched,
        apiDeOlupKatalogdaOlmayan: unmatchedItems,
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log(`🟠 Rapor: ${UNRESOLVED_PATH}`);
}

if (httpError) {
  console.error(`\n⚠️  Sayfalama hata ile bitti: ${httpError}`);
  process.exit(2);
}

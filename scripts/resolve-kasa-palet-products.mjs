/**
 * Kasa/palet barkodlarının ürün kimliği, adı ve görselini depo panelinden
 * çekip app/lib/kasaPaletProducts.ts dosyasını üretir.
 *
 * Token: Firestore'daki depo paneli token'ı (eklenti otomatik tazeliyor).
 * Elle vermek için: $env:GETIR_TOKEN="eyJ..."
 *
 * Kullanım (proje kökünde):
 *   node --env-file=.env.local scripts/resolve-kasa-palet-products.mjs
 *
 * Sadece ekrana yaz, dosyaya dokunma:
 *   $env:DRY_RUN="1"; node --env-file=.env.local scripts/resolve-kasa-palet-products.mjs
 */

import { writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp } from "firebase/app";
import { doc, getDoc, getFirestore } from "firebase/firestore";

const BARCODES = [
  "3000000000000016",
  "3000000000000006",
  "3000000000000013",
  "3000000000000030",
  "3000000000000011",
  "3000000000000005",
  "3000000000000008",
  "3000000000000023",
  "3000000000000017",
  "3000000000000024",
  "3000000000000029",
  "3000000000000028",
  "3000000000000034",
  "3000000000000010",
  "3000000000000033",
  "3000000000000009",
  "3000000000000014",
  "3000000000000003",
  "3000000000000027",
  "3000000000000015",
  "3000000000000002",
  "3000000000000012",
  "3000000000000007",
  "3000000000000001",
  "3000000000000004",
];

const FILTER_URL =
  "https://warehouse-panel-api-gateway.getirapi.com/v3/products/filter?offset=0&limit=10";
const MS_BETWEEN = 150;
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(__dirname, "..", "app", "lib", "kasaPaletProducts.ts");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodeJwtExp(token) {
  try {
    const part = token.split(".")[1];
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const exp = JSON.parse(json).exp;
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

async function loadToken() {
  const fromEnv = (process.env.GETIR_TOKEN || "").trim().replace(/^Bearer\s+/i, "");
  if (fromEnv) return { token: fromEnv, source: "GETIR_TOKEN" };

  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  if (!config.projectId) {
    throw new Error(
      "Firebase ayarı yok. Script'i `node --env-file=.env.local ...` ile çalıştırın."
    );
  }
  const db = getFirestore(initializeApp(config));
  const snap = await getDoc(doc(db, "getir_tokens", "active_warehouse"));
  const token = snap.exists() ? String(snap.data()?.token || "").trim() : "";
  if (!token) throw new Error("Firestore'da depo paneli token'ı yok.");
  return { token, source: "Firestore" };
}

async function searchBarcode(token, barcode) {
  const res = await fetch(FILTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      countrycode: "TR",
      language: "tr",
      "x-requester-client": "warehouse-panel-frontend",
    },
    body: JSON.stringify({
      fields: "_id barcodes picURL fullName",
      includeDefaultFields: false,
      keyword: barcode,
      language: "tr",
      searchFilterOptions: { fullName: true, barcodes: true, id: true },
    }),
  });
  const text = await res.text();
  if (res.status === 401) {
    throw new Error("401: depo token'ının süresi dolmuş. Depo panelini yenileyip tekrar deneyin.");
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text);
  const products = Array.isArray(json?.data?.products) ? json.data.products : [];
  return products.filter(
    (p) => Array.isArray(p.barcodes) && p.barcodes.map(String).includes(barcode)
  );
}

function pickTr(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return String(value.tr || value.en || "");
}

function renderFile(rows) {
  const body = rows
    .map(
      (r) =>
        `  {\n` +
        `    barcode: ${JSON.stringify(r.barcode)},\n` +
        `    productId: ${JSON.stringify(r.productId)},\n` +
        `    name: ${JSON.stringify(r.name)},\n` +
        `    imageUrl: ${r.imageUrl ? JSON.stringify(r.imageUrl) : "null"},\n` +
        `  },`
    )
    .join("\n");

  return `/**
 * Kasa/palet sayımına girebilecek ürünler (depo paneli ürün kimlikleri).
 * Elle düzenlemeyin; barkod listesi değişirse yeniden üretin:
 *   node --env-file=.env.local scripts/resolve-kasa-palet-products.mjs
 */

export type KasaPaletProduct = {
  barcode: string;
  productId: string;
  name: string;
  imageUrl: string | null;
};

export const KASA_PALET_PRODUCTS: readonly KasaPaletProduct[] = [
${body}
];
`;
}

async function main() {
  const { token, source } = await loadToken();
  const exp = decodeJwtExp(token);
  const minutesLeft = exp ? Math.round((exp - Date.now()) / 60000) : null;
  console.log(
    `Token: ${source}${minutesLeft !== null ? `, ${minutesLeft} dk kaldı` : ""}`
  );
  if (minutesLeft !== null && minutesLeft <= 0) {
    console.warn("⚠️ Token'ın süresi dolmuş görünüyor; yine de deneniyor.");
  }

  const rows = [];
  const problems = [];

  for (const barcode of BARCODES) {
    const matches = await searchBarcode(token, barcode);
    if (matches.length !== 1) {
      problems.push(`${barcode}: ${matches.length} eşleşme`);
      console.log(`❌ ${barcode} → ${matches.length} eşleşme`);
    } else {
      const p = matches[0];
      const row = {
        barcode,
        productId: String(p.id || p._id || ""),
        name: pickTr(p.fullName).trim(),
        imageUrl: pickTr(p.picURL).trim() || null,
      };
      if (!row.productId || !row.name) {
        problems.push(`${barcode}: kimlik veya ad boş`);
        console.log(`❌ ${barcode} → kimlik veya ad boş`);
      } else {
        rows.push(row);
        console.log(`✓ ${barcode} → ${row.name} (${row.productId})`);
      }
    }
    await sleep(MS_BETWEEN);
  }

  console.log(`\n${rows.length}/${BARCODES.length} ürün bulundu.`);
  if (problems.length > 0) {
    console.error("Dosya yazılmadı, sorunlu barkodlar:\n  " + problems.join("\n  "));
    process.exit(1);
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, "tr-TR"));

  if (DRY_RUN) {
    console.log("DRY_RUN: dosya yazılmadı.");
    process.exit(0);
  }
  await writeFile(OUT_FILE, renderFile(rows), "utf8");
  console.log(`Yazıldı: ${path.relative(process.cwd(), OUT_FILE)}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌", err instanceof Error ? err.message : err);
  process.exit(1);
});

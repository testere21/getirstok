// data/products.json (+ data/extension-barcode-aliases.json) → chrome-extension/product-barcodes.js
// Sipariş detayında ürün adı gramajsız gelir ("Sütaş Ayran"); aynı ada birden çok ürün
// düşebildiği için barkod önce ürün görselinden bulunur, ad yalnız tek ürüne gidiyorsa kullanılır.
// Takma adlar: eklentinin önceden kullandığı ad → barkod listesi; aynı ürün için barkodu korunur.
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const root = process.cwd();
const products = JSON.parse(await readFile(join(root, "data", "products.json"), "utf-8"));
const aliases = JSON.parse(await readFile(join(root, "data", "extension-barcode-aliases.json"), "utf-8"));

const normalizeName = (s) => String(s || "").replace(/\s+/g, " ").trim();
const nameKey = (s) => normalizeName(s).toLocaleLowerCase("tr-TR");
/** Sondaki gramaj/hacim parantezi olmadan: "Sütaş Ayran (200 ml)" → "sütaş ayran" */
const baseKey = (s) => nameKey(String(s || "").replace(/\s*\([^)]*\)\s*$/, ""));

/** "Sütaş Ayran (200 ml)" → "200 ml" */
const sizeOf = (s) => normalizeName(s).match(/\(([^()]+)\)\s*$/)?.[1] || "";
/** Sipariş penceresi adı gramajsız gösterdiği için değer "barkod|gramaj" */
const withSize = (barcode, name) => (sizeOf(name) ? `${barcode}|${sizeOf(name)}` : barcode);

/** Yeni CDN adresindeki görsel kimliği (tiresiz ilk 12 hane) */
function imageKeyOf(url) {
  const m = String(url || "").match(/\/([0-9a-f]{8})-([0-9a-f]{4})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z]+/i);
  return m ? `${m[1]}${m[2]}`.toLowerCase() : null;
}

const names = {};
const byBase = new Map();
const imageBarcodes = new Map();
const previousImages = [];
const productIds = {};

for (const p of products) {
  const name = normalizeName(p.name);
  const key = nameKey(name);
  const barcode = String(aliases[key] || p.barcode || "").trim();
  if (!barcode || !name) continue;
  names[key] = barcode;
  const base = baseKey(name);
  if (!byBase.has(base)) byBase.set(base, new Map());
  byBase.get(base).set(barcode, name);
  const img = imageKeyOf(p.imageUrl);
  const value = withSize(barcode, name);
  // Aynı görseli paylaşan farklı ürünler görselden ayırt edilemez
  if (img) imageBarcodes.set(img, imageBarcodes.has(img) && imageBarcodes.get(img) !== value ? null : value);
  if (/^[a-f0-9]{24}$/i.test(p.productId || "")) productIds[p.productId.toLowerCase()] = value;
  for (const old of p.previousImageUrls || []) {
    const key = imageKeyOf(old);
    if (key) previousImages.push([key, value]);
  }
}
// Eski görseller (sync-product-images ile değişenler) yalnız güncel bir ürüne ait değilse
const previousByKey = new Map();
for (const [key, value] of previousImages) {
  if (imageBarcodes.has(key)) continue;
  previousByKey.set(key, previousByKey.has(key) && previousByKey.get(key) !== value ? null : value);
}
for (const [key, value] of previousByKey) imageBarcodes.set(key, value);

const ambiguous = {};
for (const [base, variants] of byBase) {
  if (variants.size > 1) ambiguous[base] = [...variants].map(([barcode, name]) => [name, barcode]);
  else if (!(base in names)) {
    const [[barcode, name]] = [...variants];
    names[base] = withSize(barcode, name);
  }
}
for (const [key, barcode] of Object.entries(aliases)) {
  if (!(key in names) && !(key in ambiguous)) names[key] = barcode;
}
const images = Object.fromEntries([...imageBarcodes].filter(([, b]) => b));

const out =
  `// Otomatik üretildi: npm run build-extension-catalog (kaynak: data/products.json)\n` +
  `window.__GETIRSTOK_CATALOG_BARCODES = ${JSON.stringify(names)};\n` +
  `window.__GETIRSTOK_CATALOG_AMBIGUOUS = ${JSON.stringify(ambiguous)};\n` +
  `window.__GETIRSTOK_CATALOG_IMAGES = ${JSON.stringify(images)};\n` +
  `window.__GETIRSTOK_CATALOG_PRODUCT_IDS = ${JSON.stringify(productIds)};\n`;
await writeFile(join(root, "chrome-extension", "product-barcodes.js"), out, "utf-8");

console.log(
  `Ad: ${Object.keys(names).length}, belirsiz ad: ${Object.keys(ambiguous).length}, ` +
    `görsel: ${Object.keys(images).length}, ürün kimliği: ${Object.keys(productIds).length}, ` +
    `boyut: ${Math.round(Buffer.byteLength(out) / 1024)} KB`
);

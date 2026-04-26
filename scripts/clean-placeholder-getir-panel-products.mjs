import { readFile, writeFile } from "fs/promises";
import { join } from "path";

/**
 * `data/products.json` içindeki placeholder isimli ("Getir panelinden eklendi") kayıtları siler.
 *
 * Kullanım:
 *   node scripts/clean-placeholder-getir-panel-products.mjs
 */

const PRODUCTS_PATH = join(process.cwd(), "data", "products.json");
const raw = await readFile(PRODUCTS_PATH, "utf-8");
const products = JSON.parse(raw);

if (!Array.isArray(products)) {
  throw new Error("products.json array olmalı");
}

const isPlaceholder = (name) =>
  String(name ?? "")
    .toLowerCase()
    .includes("getir panelinden eklendi");

const before = products.length;
const removed = products.filter((p) => isPlaceholder(p?.name));
const next = products.filter((p) => !isPlaceholder(p?.name));

await writeFile(PRODUCTS_PATH, JSON.stringify(next, null, 2), "utf-8");

console.log(`🧹 Silinen placeholder kayıt: ${removed.length}`);
console.log(`📦 Önce: ${before}  Sonra: ${next.length}`);
console.log("Örnek silinenler (ilk 10):");
removed.slice(0, 10).forEach((p, i) => {
  console.log(
    `${i + 1}. barcode=${p?.barcode ?? ""} productId=${p?.productId ?? ""}`
  );
});


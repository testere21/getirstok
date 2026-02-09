import { readFile } from "fs/promises";
import { join } from "path";

const productsPath = join(process.cwd(), "data", "products.json");
const productsData = await readFile(productsPath, "utf-8");
const products = JSON.parse(productsData);

const total = products.length;
const withId = products.filter((p) => p.productId).length;
const withoutId = total - withId;

console.log(`📊 Durum Raporu:`);
console.log(`   Toplam Ürün: ${total}`);
console.log(`   ProductId Var: ${withId}`);
console.log(`   ProductId Yok: ${withoutId}`);
console.log(`\n📋 ProductId olmayan ilk 10 ürün:`);
products
  .filter((p) => !p.productId)
  .slice(0, 10)
  .forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.name} (Barkod: ${p.barcode || "YOK"})`);
  });


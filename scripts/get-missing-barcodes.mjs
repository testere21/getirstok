import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const productsPath = join(process.cwd(), "data", "products.json");
const productsData = await readFile(productsPath, "utf-8");
const products = JSON.parse(productsData);

// productId olmayan ürünlerin barcode'larını çıkar
const missingBarcodes = products
  .filter((p) => !p.productId && p.barcode)
  .map((p) => p.barcode.trim())
  .filter((barcode) => barcode.length > 0);

console.log(`📊 ${missingBarcodes.length} ürün için productId eksik`);
console.log(`\n📋 İlk 20 barcode:`);
missingBarcodes.slice(0, 20).forEach((barcode, i) => {
  console.log(`   ${i + 1}. ${barcode}`);
});

// Barcode'ları bir dosyaya kaydet (console script'i için)
const outputPath = join(process.cwd(), "scripts", "missing-barcodes.json");
await writeFile(outputPath, JSON.stringify(missingBarcodes, null, 2), "utf-8");
console.log(`\n✅ Barcode'lar kaydedildi: ${outputPath}`);
console.log(`\n💡 Bu barcode'ları console script'ine eklemek için:`);
console.log(`   const missingBarcodes = ${JSON.stringify(missingBarcodes)};`);


import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const argv = process.argv.slice(2);
const shouldAdd = argv.includes("--add");

const inputPath =
  argv.find((a) => a.startsWith("--input="))?.slice("--input=".length) ??
  join(process.cwd(), "scripts", "getir-panel-barcodes.json");

const outputPath =
  argv.find((a) => a.startsWith("--output="))?.slice("--output=".length) ??
  join(process.cwd(), "scripts", "missing-from-getir-panel.json");

const productsPath = join(process.cwd(), "data", "products.json");

const parseJsonFile = async (path) => {
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw);
};

const normalizeBarcode = (x) => String(x ?? "").trim();
const extractBarcodesFromInput = (raw) => {
  // Desteklenen input formatları:
  // 1) ["8696...", ...]
  // 2) [{ name, barcode }, ...]  (satır başına tek barkod)
  // 3) { "<name>": "<barcode>", ... } (map)
  if (Array.isArray(raw)) {
    if (raw.length === 0) return [];
    const first = raw[0];
    if (typeof first === "string" || typeof first === "number") {
      return raw.map(normalizeBarcode).filter((b) => b.length > 0);
    }
    if (first && typeof first === "object") {
      return raw
        .map((x) => normalizeBarcode(x?.barcode))
        .filter((b) => b.length > 0);
    }
    return [];
  }

  if (raw && typeof raw === "object") {
    return Object.values(raw)
      .map(normalizeBarcode)
      .filter((b) => b.length > 0);
  }

  return [];
};

const panelBarcodesRaw = await parseJsonFile(inputPath);
const panelBarcodes = extractBarcodesFromInput(panelBarcodesRaw);
if (panelBarcodes.length === 0) {
  throw new Error(
    `Panel barkodları okunamadı/boş. Dosya: ${inputPath} (format: array<string> veya array<{barcode}> veya map)`
  );
}

const products = await parseJsonFile(productsPath);
if (!Array.isArray(products)) {
  throw new Error(
    `Beklenen format: products array. Dosya: ${productsPath} (typeof=${typeof products})`
  );
}

const ourBarcodeSet = new Set(
  products
    .map((p) => normalizeBarcode(p?.barcode))
    .filter((b) => b.length > 0)
);

const uniquePanel = Array.from(new Set(panelBarcodes));
const missing = uniquePanel.filter((b) => !ourBarcodeSet.has(b));

await writeFile(
  outputPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      panelCount: uniquePanel.length,
      ourCount: ourBarcodeSet.size,
      missingCount: missing.length,
      missingBarcodes: missing,
    },
    null,
    2
  ),
  "utf-8"
);

console.log(`✅ Panel barkodu: ${uniquePanel.length}`);
console.log(`✅ Bizdeki barkod: ${ourBarcodeSet.size}`);
console.log(`🟠 Eksik barkod: ${missing.length}`);
console.log(`📄 Yazıldı: ${outputPath}`);

if (shouldAdd && missing.length > 0) {
  const now = new Date().toISOString();
  const toAppend = missing.map((barcode) => ({
    name: "(Getir panelinden eklendi)",
    barcode,
    addedFrom: "getir-panel",
    addedAt: now,
  }));

  const nextProducts = [...products, ...toAppend];
  await writeFile(productsPath, JSON.stringify(nextProducts, null, 2), "utf-8");
  console.log(`➕ products.json içine eklendi: ${toAppend.length} kayıt`);
}


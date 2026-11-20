/**
 * Fırın çık ürün listesi (Soğukkuyu). Liste Firestore'da `getir_tokens/bakery_products` belgesinde
 * tutulur; belge yoksa aşağıdaki varsayılan liste kullanılır (ilk düzenlemede belgeye yazılır).
 */

export const BAKERY_PRODUCTS_DOC_ID = "bakery_products";

/** Bir sihirbaz açılışında stok sorgusuna gidecek en fazla ürün (`/api/getir-stock` toplu sınırı ile aynı) */
export const MAX_BAKERY_PRODUCTS = 50;

/** Eski sabit liste — belge henüz oluşmamışken gösterim sırası */
export const DEFAULT_BAKERY_PRODUCT_BARCODES: readonly string[] = [
  "8682392116211",
  "8681573033125",
  "8682392116112",
  "8681573033712",
  "8681573030063",
  "8681573033842",
  "8681573033316",
  "5941878404550",
  "8681573033804",
  "8681573033927",
  "5941878404789",
  "8681573032241",
  "8681573031923",
  "8681573033392",
  "8681573031756",
  "8681573031732",
  "8681573031749",
  "8681573031978",
  "8681573033637",
  "8681573031961",
  "F004200",
];

export const BAKERY_NOT_IN_CATALOG_LABEL = "Katalogda bulunamadı";

/** Listedeki bir ürün: barkod zorunlu; `name` katalogda bulunamazsa gösterilecek yedek ad */
export interface BakeryProductEntry {
  barcode: string;
  name?: string;
}

export function normalizeBakeryBarcode(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

export function defaultBakeryEntries(): BakeryProductEntry[] {
  return DEFAULT_BAKERY_PRODUCT_BARCODES.map((barcode) => ({ barcode }));
}

/**
 * Firestore'dan gelen `items` değerini temizler: geçersiz satırları ve tekrar eden barkodları atar,
 * sırayı korur. Dizi değilse `null` (belge yok/bozuk sayılır, varsayılan liste kullanılır);
 * boş dizi geçerlidir (kullanıcı tüm ürünleri çıkarmış olabilir).
 */
export function parseBakeryEntries(raw: unknown): BakeryProductEntry[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: BakeryProductEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const barcode = normalizeBakeryBarcode(String((row as { barcode?: unknown }).barcode ?? ""));
    if (!barcode || seen.has(barcode)) continue;
    seen.add(barcode);
    const name = String((row as { name?: unknown }).name ?? "").trim();
    out.push(name ? { barcode, name } : { barcode });
  }
  return out;
}

export type AddBakeryEntryResult =
  | { ok: true; list: BakeryProductEntry[] }
  | { ok: false; reason: "empty" | "duplicate" | "full" };

/** Listenin sonuna ürün ekler (aynı barkod iki kez eklenmez). */
export function addBakeryEntry(
  list: readonly BakeryProductEntry[],
  entry: BakeryProductEntry
): AddBakeryEntryResult {
  const barcode = normalizeBakeryBarcode(entry.barcode);
  if (!barcode) return { ok: false, reason: "empty" };
  if (list.some((e) => e.barcode === barcode)) return { ok: false, reason: "duplicate" };
  if (list.length >= MAX_BAKERY_PRODUCTS) return { ok: false, reason: "full" };
  const name = entry.name?.trim();
  return { ok: true, list: [...list, name ? { barcode, name } : { barcode }] };
}

export function removeBakeryEntry(
  list: readonly BakeryProductEntry[],
  barcode: string
): BakeryProductEntry[] {
  return list.filter((e) => e.barcode !== barcode);
}

/** Ürünü bir basamak yukarı (-1) veya aşağı (+1) taşır; sınır dışıysa liste aynen döner. */
export function moveBakeryEntry(
  list: readonly BakeryProductEntry[],
  barcode: string,
  direction: -1 | 1
): BakeryProductEntry[] {
  const from = list.findIndex((e) => e.barcode === barcode);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Katalog girdisi — `page.tsx` `CatalogProduct` ile uyumlu */
export type BakeryCatalogProduct = {
  barcode: string;
  barcodes?: string[];
  name: string;
  imageUrl?: string;
  productId?: string;
};

export interface BakeryResolvedRow {
  barcode: string;
  displayName: string;
  inCatalog: boolean;
  imageUrl?: string;
  productId?: string;
}

/** Ana veya alternatif barkod eşleşmesi (`catalogBarcodeMatch.ts` ile aynı kural; test için bağımsız tutuldu) */
function catalogHasBarcode(product: BakeryCatalogProduct, barcode: string): boolean {
  const b = normalizeBakeryBarcode(barcode);
  if (!b) return false;
  if (normalizeBakeryBarcode(product.barcode) === b) return true;
  return (product.barcodes ?? []).some((x) => normalizeBakeryBarcode(x) === b);
}

/** Liste sırası korunur; katalogda eşleşen ürünün adı/görseli doldurulur. */
export function resolveBakeryEntries(
  entries: readonly BakeryProductEntry[],
  catalog: ReadonlyArray<BakeryCatalogProduct>
): BakeryResolvedRow[] {
  return entries.map((entry) => {
    const match = catalog.find((p) => catalogHasBarcode(p, entry.barcode));
    if (match) {
      return {
        barcode: entry.barcode,
        displayName: match.name,
        inCatalog: true,
        imageUrl: match.imageUrl,
        productId: match.productId,
      };
    }
    return {
      barcode: entry.barcode,
      displayName: entry.name || BAKERY_NOT_IN_CATALOG_LABEL,
      inCatalog: false,
    };
  });
}

/**
 * Sihirbaz kuyruğu: raf stoğu 0'dan büyük olanlar VE stoğu okunamayanlar (null/eksik) kalır —
 * okunamayan ürün sessizce atlanmaz, sihirbazda "stok okunamadı" diye gösterilir.
 */
export function buildBakeryExitQueue(
  rows: readonly BakeryResolvedRow[],
  stocks: Readonly<Record<string, number | null | undefined>>
): BakeryResolvedRow[] {
  return rows.filter((row) => {
    const s = stocks[row.barcode];
    return typeof s !== "number" || s > 0;
  });
}

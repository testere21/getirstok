/**
 * Hesaplama sekmesi — Faz 1 veri kuralları.
 * Tüm hesaplama UI’si bu kurallara bağlanmalı; davranış değişirse önce burayı güncelle.
 */

import { catalogProductMatchesBarcode } from "@/app/lib/catalogBarcodeMatch";
import type { CatalogProduct, StockItemWithId } from "@/app/lib/types";

/** Fiyat kaynağı: şimdilik yalnızca birleşik katalog `CatalogProduct.price`. API’den otomatik çekme yok. */
export const HESAPLAMA_UNIT_PRICE_SOURCE = "catalog_only" as const;

/**
 * Miktar politikası:
 * - Varsayılan: Firestore’da bu ürüne eşleşen (`catalogProductMatchesBarcode`) kayıtların
 *   `type === 'missing'` / `'extra'` için `quantity` toplamları.
 * - Kullanıcı hesaplama oturumunda satır miktarını serbestçe değiştirebilir (geçici state).
 */
export const HESAPLAMA_QUANTITY_POLICY = {
  defaultFromFirestoreTotals: true,
  userEditable: true,
} as const;

export type HesaplamaQuantityPolicy = typeof HESAPLAMA_QUANTITY_POLICY;

/**
 * Ürün, hesaplamaya adaydır: en az bir eksik veya fazla Firestore kaydı,
 * bu katalog satırıyla barkod üzerinden eşleşir (birincil veya `barcodes[]`).
 */
export function isCatalogProductHesaplamaCandidate(
  product: Pick<CatalogProduct, "barcode" | "barcodes">,
  stockItems: StockItemWithId[]
): boolean {
  for (const item of stockItems) {
    if (item.type !== "missing" && item.type !== "extra") continue;
    if (catalogProductMatchesBarcode(product, item.barcode)) return true;
  }
  return false;
}

export interface FirestoreMissingExtraTotals {
  missingTotal: number;
  extraTotal: number;
}

/**
 * Bu katalog ürünü için Firestore’daki eksik/fazla miktar toplamları (tüm eşleşen satırlar).
 */
export function getFirestoreMissingExtraTotalsForProduct(
  product: Pick<CatalogProduct, "barcode" | "barcodes">,
  stockItems: StockItemWithId[]
): FirestoreMissingExtraTotals {
  let missingTotal = 0;
  let extraTotal = 0;
  for (const item of stockItems) {
    if (!catalogProductMatchesBarcode(product, item.barcode)) continue;
    if (item.type === "missing") missingTotal += item.quantity;
    else if (item.type === "extra") extraTotal += item.quantity;
  }
  return { missingTotal, extraTotal };
}

/**
 * Tek “Listeye ekle” aksiyonu için hedef liste.
 * Yalnız eksik kaydı varsa eksik; yalnız fazla kaydı varsa fazla;
 * ikisi birden pozitifse miktarı büyük olan taraf; eşitlikte eksik.
 */
export function resolveHesaplamaSideFromFirestoreTotals(
  totals: FirestoreMissingExtraTotals
): "missing" | "extra" | null {
  const { missingTotal, extraTotal } = totals;
  if (missingTotal <= 0 && extraTotal <= 0) return null;
  if (missingTotal > 0 && extraTotal <= 0) return "missing";
  if (extraTotal > 0 && missingTotal <= 0) return "extra";
  return missingTotal >= extraTotal ? "missing" : "extra";
}

export interface ResolvedHesaplamaUnitPrice {
  /** TL cinsinden birim fiyat; katalogda yoksa null */
  amount: number | null;
  /** `amount` kullanılabilir mi */
  hasPrice: boolean;
}

/**
 * Birim fiyat: yalnızca `CatalogProduct.price`.
 * Stok API veya başka kaynak Faz 1 kapsamı dışında; fiyat yoksa `hasPrice: false`.
 */
export function resolveHesaplamaUnitPrice(
  product: Pick<CatalogProduct, "price">
): ResolvedHesaplamaUnitPrice {
  const p = product.price;
  if (typeof p !== "number" || !Number.isFinite(p) || p < 0) {
    return { amount: null, hasPrice: false };
  }
  return { amount: p, hasPrice: true };
}

/**
 * Arama kutusu için: aday ürünleri süzmek üzere tüm hesaplamaya aday katalog satırlarını döner.
 */
export function filterCatalogProductsForHesaplama(
  catalogProducts: CatalogProduct[],
  stockItems: StockItemWithId[]
): CatalogProduct[] {
  return catalogProducts.filter((p) =>
    isCatalogProductHesaplamaCandidate(p, stockItems)
  );
}

function normalizeHesaplamaSearchToken(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Ürün adı veya herhangi bir barkod alanında alt dize araması (küçük harf).
 */
export function catalogProductMatchesHesaplamaSearch(
  product: Pick<CatalogProduct, "name" | "barcode" | "barcodes">,
  rawQuery: string
): boolean {
  const q = normalizeHesaplamaSearchToken(rawQuery);
  if (!q) return false;
  const needles = [
    normalizeHesaplamaSearchToken(product.name),
    normalizeHesaplamaSearchToken(product.barcode),
    ...(product.barcodes ?? []).map((b) => normalizeHesaplamaSearchToken(b)),
  ];
  return needles.some((h) => h.length > 0 && h.includes(q));
}

/**
 * Aday katalog listesini arama metnine göre süzer. `minLength` altında boş dizi döner.
 */
export function filterHesaplamaCandidatesBySearch(
  candidates: CatalogProduct[],
  rawQuery: string,
  minLength: number
): CatalogProduct[] {
  const q = rawQuery.trim();
  if (q.length < minLength) return [];
  return candidates.filter((p) => catalogProductMatchesHesaplamaSearch(p, q));
}

/**
 * Aynı birincil barkoda tekrar eklemede miktarlar toplanır (`upsertHesaplamaSessionLine`).
 * Ayrı satır oluşturulmaz.
 */
export const HESAPLAMA_LINE_MERGE_POLICY = "merge_same_barcode_sum_quantity" as const;

/** Hesaplama oturumunda tek satır (birincil barkod ile anahtarlanır). */
export interface HesaplamaSessionLine {
  barcode: string;
  name: string;
  quantity: number;
  /** Katalog birim fiyatı yoksa veya kullanıcı düzeltmesi için geçici TL/ad (oturum sonuna kadar). */
  manualUnitPriceTry?: number;
}

/** Katalogda barkodu eşleşen ilk ürün (birincil veya `barcodes[]`). */
export function findCatalogProductByBarcode(
  catalogProducts: CatalogProduct[],
  barcode: string
): CatalogProduct | undefined {
  const b = barcode.trim();
  if (!b) return undefined;
  return catalogProducts.find((p) => catalogProductMatchesBarcode(p, b));
}

/**
 * Firestore eksik/fazla toplamından varsayılan miktar; taraf için kayıt yoksa en az 1.
 */
export function getDefaultHesaplamaQuantityForSide(
  product: CatalogProduct,
  stockItems: StockItemWithId[],
  side: "missing" | "extra"
): number {
  const t = getFirestoreMissingExtraTotalsForProduct(product, stockItems);
  const v = side === "missing" ? t.missingTotal : t.extraTotal;
  return v > 0 ? v : 1;
}

/** Aynı barkod varsa miktarları toplar; yoksa satır ekler. */
export function upsertHesaplamaSessionLine(
  lines: HesaplamaSessionLine[],
  product: Pick<CatalogProduct, "barcode" | "name">,
  quantityDelta: number
): HesaplamaSessionLine[] {
  if (quantityDelta <= 0) return lines;
  const barcode = product.barcode.trim();
  if (!barcode) return lines;
  const idx = lines.findIndex((l) => l.barcode === barcode);
  if (idx === -1) {
    return [
      ...lines,
      { barcode, name: product.name, quantity: quantityDelta },
    ];
  }
  const next = [...lines];
  next[idx] = {
    ...next[idx],
    quantity: next[idx].quantity + quantityDelta,
  };
  return next;
}

/** Geçici birim fiyat (≥ 0); `null` ile kaldırılır. */
export function setHesaplamaSessionLineManualUnitPrice(
  lines: HesaplamaSessionLine[],
  barcode: string,
  manualUnitPriceTry: number | null
): HesaplamaSessionLine[] {
  const b = barcode.trim();
  if (!b) return lines;
  const idx = lines.findIndex((l) => l.barcode === b);
  if (idx === -1) return lines;
  const next = [...lines];
  if (manualUnitPriceTry === null) {
    const cleared: HesaplamaSessionLine = { ...next[idx] };
    delete cleared.manualUnitPriceTry;
    next[idx] = cleared;
    return next;
  }
  const v = Number(manualUnitPriceTry);
  if (!Number.isFinite(v) || v < 0) return next;
  next[idx] = { ...next[idx], manualUnitPriceTry: v };
  return next;
}

export function removeHesaplamaSessionLine(
  lines: HesaplamaSessionLine[],
  barcode: string
): HesaplamaSessionLine[] {
  const b = barcode.trim();
  if (!b) return lines;
  return lines.filter((l) => l.barcode !== b);
}

/**
 * Miktar geçersiz veya 1’den küçükse satırı listeden çıkarır.
 */
export function setHesaplamaSessionLineQuantity(
  lines: HesaplamaSessionLine[],
  barcode: string,
  quantity: number
): HesaplamaSessionLine[] {
  const b = barcode.trim();
  if (!b) return lines;
  const idx = lines.findIndex((l) => l.barcode === b);
  if (idx === -1) return lines;
  const raw = Math.floor(Number(quantity));
  const q =
    Number.isFinite(raw) && raw >= 1 ? raw : 1;
  const next = [...lines];
  next[idx] = { ...next[idx], quantity: q };
  return next;
}

/**
 * `priceByPrimaryBarcode`: genelde birincil barkod → `CatalogProduct.price` haritası.
 * Barkod yalnızca `barcodes[]` içindeyse ürün bulunup fiyat okunur.
 */
export function getHesaplamaUnitPriceForBarcode(
  barcode: string,
  catalogProducts: CatalogProduct[],
  priceByPrimaryBarcode: Map<string, number>
): ResolvedHesaplamaUnitPrice {
  const b = barcode.trim();
  if (!b) return { amount: null, hasPrice: false };
  const direct = priceByPrimaryBarcode.get(b);
  if (
    typeof direct === "number" &&
    Number.isFinite(direct) &&
    !Number.isNaN(direct)
  ) {
    return { amount: direct, hasPrice: true };
  }
  const product = findCatalogProductByBarcode(catalogProducts, b);
  return product ? resolveHesaplamaUnitPrice(product) : { amount: null, hasPrice: false };
}

/** Önce oturum `manualUnitPriceTry`; yoksa katalog. Manuel değer varsa her zaman kazanır. */
export function getEffectiveHesaplamaUnitPrice(
  line: HesaplamaSessionLine,
  catalogProducts: CatalogProduct[],
  priceByPrimaryBarcode: Map<string, number>
): ResolvedHesaplamaUnitPrice {
  const m = line.manualUnitPriceTry;
  if (typeof m === "number" && Number.isFinite(m) && m >= 0) {
    return { amount: m, hasPrice: true };
  }
  return getHesaplamaUnitPriceForBarcode(
    line.barcode,
    catalogProducts,
    priceByPrimaryBarcode
  );
}

export type HesaplamaLinePricingSource = "manual" | "catalog" | "none";

export function getHesaplamaLinePricingSource(
  line: HesaplamaSessionLine,
  catalogProducts: CatalogProduct[],
  priceByPrimaryBarcode: Map<string, number>
): HesaplamaLinePricingSource {
  const m = line.manualUnitPriceTry;
  if (typeof m === "number" && Number.isFinite(m) && m >= 0) {
    return "manual";
  }
  const cat = getHesaplamaUnitPriceForBarcode(
    line.barcode,
    catalogProducts,
    priceByPrimaryBarcode
  );
  return cat.hasPrice ? "catalog" : "none";
}

export interface HesaplamaLineValueResult {
  /** miktar × birim; fiyat yoksa 0 */
  lineTotalTry: number;
  hasUnitPrice: boolean;
}

export function getHesaplamaLineValueTry(
  line: HesaplamaSessionLine,
  catalogProducts: CatalogProduct[],
  priceByPrimaryBarcode: Map<string, number>
): HesaplamaLineValueResult {
  const { amount, hasPrice } = getEffectiveHesaplamaUnitPrice(
    line,
    catalogProducts,
    priceByPrimaryBarcode
  );
  if (!hasPrice || amount === null) {
    return { lineTotalTry: 0, hasUnitPrice: false };
  }
  return { lineTotalTry: amount * line.quantity, hasUnitPrice: true };
}

export interface HesaplamaSessionSumResult {
  sumTry: number;
  linesWithoutPrice: number;
}

export function sumHesaplamaSessionLinesTry(
  lines: HesaplamaSessionLine[],
  catalogProducts: CatalogProduct[],
  priceByPrimaryBarcode: Map<string, number>
): HesaplamaSessionSumResult {
  let sumTry = 0;
  let linesWithoutPrice = 0;
  for (const line of lines) {
    const r = getHesaplamaLineValueTry(
      line,
      catalogProducts,
      priceByPrimaryBarcode
    );
    sumTry += r.lineTotalTry;
    if (!r.hasUnitPrice) linesWithoutPrice += 1;
  }
  return { sumTry, linesWithoutPrice };
}

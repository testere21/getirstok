/**
 * Referans su ürünleri — sabit barkod listesi.
 * Sıra, slide paneldeki gösterim sırasıdır.
 */
export const REFERENCE_WATER_BARCODES = [
  "8690793010502",
  "8681763366613",
  "8681763366620",
  "8690793010946",
  "8690793600307",
  "8690793600888",
  "8681763366637",
] as const;

export type ReferenceWaterBarcode = (typeof REFERENCE_WATER_BARCODES)[number];

/**
 * Barkoda göre kullanıcıya gösterilen kısa sabit isim (Faz 1.3).
 * Panelde yalnızca isim + barkod görseli isteniyorsa `shortLabel` yeterli.
 */
export const REFERENCE_WATER_SHORT_LABEL_BY_BARCODE = {
  "8690793010502": "Erikli 5 L",
  "8681763366613": "Kuzeyden 5 L",
  "8681763366620": "Kuzeyden 1,5 L",
  "8690793010946": "Erikli 6×1,5 L",
  "8690793600307": "Erikli 6×1 L",
  "8690793600888": "Erikli 12×500 ml",
  "8681763366637": "Kuzeyden 500 ml",
} as const satisfies Record<ReferenceWaterBarcode, string>;

/** Katalogda eşleşme yoksa isteğe bağlı uyarı metni (ikinci satır veya geliştirici mesajı) */
export const REFERENCE_WATER_NOT_FOUND_LABEL = "Katalogda bulunamadı";

/** Panel satırı: ana isim `shortLabel`; tam katalog adı isteğe bağlı */
export interface ReferenceWaterResolvedRow {
  barcode: string;
  shortLabel: string;
  /** Katalogda bulunduysa tam `name`; yoksa `undefined` */
  catalogFullName?: string;
}

/** Katalog girdisi — `page.tsx` içindeki `CatalogProduct` ile uyumlu minimum şekil */
export type ReferenceWaterCatalogProduct = {
  barcode: string;
  name: string;
};

/**
 * Sabit barkod sırası korunarak `shortLabel` ve isteğe bağlı `catalogFullName` doldurulur.
 * Katalogda yoksa bile satır döner; barkod her zaman referans barkoddur (BarcodeImage için).
 */
export function resolveReferenceWaterProducts(
  products: ReadonlyArray<ReferenceWaterCatalogProduct>
): ReferenceWaterResolvedRow[] {
  return REFERENCE_WATER_BARCODES.map((barcode) => {
    const match = products.find((p) => p.barcode === barcode);
    return {
      barcode,
      shortLabel: REFERENCE_WATER_SHORT_LABEL_BY_BARCODE[barcode],
      catalogFullName: match?.name,
    };
  });
}

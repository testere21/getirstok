/**
 * Fırın ürünleri — sabit barkod listesi (ekrandaki gösterim sırası).
 */
export const BAKERY_PRODUCT_BARCODES = [
  "8682392116211",
  "8681573033125",
  "8682392116112",
  "8681573033712",
  "8681573030063",
  "8681573033842",
  "8681573033316",
  "5941878404550",
  "8681573030278",
  "8681573033804",
  "8681573033811",
  "8681573033927",
  "5941878404789",
  "8681573032241",
  "8681573031923",
  "8681573033392",
  "8681573031756",
  "8681573031732",
  "8681573031749",
] as const;

export type BakeryProductBarcode = (typeof BAKERY_PRODUCT_BARCODES)[number];

/** Katalog eşleşmesi yokken satırda gösterilecek isteğe bağlı kısa ad (genişletilebilir) */
export const BAKERY_SHORT_LABEL_BY_BARCODE: Partial<
  Record<BakeryProductBarcode, string>
> = {};

export const BAKERY_NOT_IN_CATALOG_LABEL = "Katalogda bulunamadı";

/** Katalog girdisi — `page.tsx` `CatalogProduct` ile uyumlu */
export type BakeryCatalogProduct = {
  barcode: string;
  name: string;
  imageUrl?: string;
  productId?: string;
  price?: number;
};

export interface BakeryResolvedRow {
  barcode: string;
  displayName: string;
  inCatalog: boolean;
  imageUrl?: string;
}

/**
 * Sabit barkod sırası korunur. Katalogda eşleşen ürün bilgisi doldurulur; yoksa yedek etiket veya
 * `BAKERY_NOT_IN_CATALOG_LABEL` kullanılır.
 */
export function resolveBakeryProducts(
  products: ReadonlyArray<BakeryCatalogProduct>
): BakeryResolvedRow[] {
  return BAKERY_PRODUCT_BARCODES.map((barcode) => {
    const match = products.find((p) => p.barcode === barcode);
    const short = BAKERY_SHORT_LABEL_BY_BARCODE[barcode];
    if (match) {
      return {
        barcode,
        displayName: match.name,
        inCatalog: true,
        imageUrl: match.imageUrl,
      };
    }
    return {
      barcode,
      displayName: short ?? BAKERY_NOT_IN_CATALOG_LABEL,
      inCatalog: false,
    };
  });
}

/**
 * Fırın ürünleri tam ekran görselleri — `public/bakery-images/` altında
 * dosya adı: `{barkod}.jpg` (örn. `8682392116211.jpg`).
 */
export const BAKERY_FULL_IMAGE_PUBLIC_PATH = "/bakery-images";

export function getBakeryFullImageUrl(barcode: string): string {
  const b = barcode.trim();
  return `${BAKERY_FULL_IMAGE_PUBLIC_PATH}/${b}.jpg`;
}

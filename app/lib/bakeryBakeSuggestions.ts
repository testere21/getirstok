/**
 * Eklentinin yüklediği pişirme önerisi biçimi. Panel artık bu öneriyi kullanmıyor; yalnızca
 * `/api/bakery-suggestions/save` ucu eski eklentiyi karşılamak için duruyor (eklenti güncellenince silinecek).
 */
export const BAKE_SLOT_KEYS = ["08-12", "12-16", "16-20", "20-00"] as const;
export type BakeSlotKey = (typeof BAKE_SLOT_KEYS)[number];

export type BakeSlotMap = Partial<Record<BakeSlotKey, number>>;

export interface BakeryBakeSuggestionItem {
  name: string;
  productId?: string;
  slots: BakeSlotMap;
}

export const BAKE_SLOT_KEYS = ["08-12", "12-16", "16-20", "20-00"] as const;
export type BakeSlotKey = (typeof BAKE_SLOT_KEYS)[number];

export const BAKE_SLOT_LABELS: Record<BakeSlotKey, string> = {
  "08-12": "08:00 – 12:00",
  "12-16": "12:00 – 16:00",
  "16-20": "16:00 – 20:00",
  "20-00": "20:00 – 00:00",
};

export type BakeSlotMap = Partial<Record<BakeSlotKey, number>>;

export interface BakeryBakeSuggestionItem {
  name: string;
  productId?: string;
  slots: BakeSlotMap;
}

/** İstanbul saati. 00:00–08:00 arası öneri yok (gece kapanış). */
export function getCurrentBakeSlot(
  now: Date = new Date()
): BakeSlotKey | null {
  const hourStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    hour12: false,
  }).format(now);
  const hour = Number.parseInt(hourStr, 10);
  if (Number.isNaN(hour)) return null;
  if (hour >= 8 && hour < 12) return "08-12";
  if (hour >= 12 && hour < 16) return "12-16";
  if (hour >= 16 && hour < 20) return "16-20";
  if (hour >= 20) return "20-00";
  return null;
}

export function headerTextToSlotKey(text: string): BakeSlotKey | null {
  const t = String(text || "").replace(/\s+/g, " ");
  if (/08:00/.test(t) && /12:00/.test(t)) return "08-12";
  if (/12:00/.test(t) && /16:00/.test(t)) return "12-16";
  if (/16:00/.test(t) && /20:00/.test(t)) return "16-20";
  if (/20:00/.test(t) && /00:00/.test(t)) return "20-00";
  return null;
}

export function normalizeBakeryProductName(name: string): string {
  return String(name || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/la\s*lorraine/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/simiti/g, "simidi")
    .replace(/[^a-z0-9çğıöşüâêîôû\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function bakeryNamesMatch(a: string, b: string): boolean {
  const na = normalizeBakeryProductName(a);
  const nb = normalizeBakeryProductName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function currentSuggestedBakeQty(
  item: BakeryBakeSuggestionItem | undefined,
  slot: BakeSlotKey | null
): number {
  if (!item || !slot) return 0;
  const n = item.slots[slot];
  return typeof n === "number" && n > 0 ? n : 0;
}

export function shouldShowBakeMeAlert(
  suggestedQty: number,
  shelfStock: number | null | undefined
): boolean {
  return suggestedQty > 0 && shelfStock === 0;
}

export function findSuggestionForProduct(
  items: BakeryBakeSuggestionItem[],
  opts: { displayName: string; productId?: string }
): BakeryBakeSuggestionItem | undefined {
  const pid = opts.productId?.trim();
  if (pid) {
    const byId = items.find((i) => i.productId && i.productId === pid);
    if (byId) return byId;
  }
  return items.find((i) => bakeryNamesMatch(i.name, opts.displayName));
}

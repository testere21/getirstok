/**
 * Sayım sekmesi: aynı kategorideki eksik ve fazla kayıtları toplam tutarları
 * en yakın olacak şekilde eşleştirir. Firestore'a dokunmaz, saf fonksiyon.
 */

/** Varsayılan zarar sınırı (TL). Bu tutardan fazla zarar eden çiftler işaretlenir. */
export const SAYIM_DEFAULT_LOSS_LIMIT_TRY = 50;

/** `StockItemWithId` bu şekli yapısal olarak karşılar. */
export type SayimStockInput = {
  id: string;
  name: string;
  barcode: string;
  quantity: number;
  imageUrl?: string | null;
};

export type SayimCandidate = {
  id: string;
  name: string;
  barcode: string;
  quantity: number;
  unitPrice: number;
  /** quantity * unitPrice, 2 basamağa yuvarlanmış */
  total: number;
  category: string;
  imageUrl: string | null;
};

export type SayimSkipReason = "no_category" | "no_price" | "no_quantity";

export type SayimSkipped = {
  id: string;
  name: string;
  barcode: string;
  quantity: number;
  type: "missing" | "extra";
  reason: SayimSkipReason;
};

export type SayimPair = {
  missing: SayimCandidate;
  extra: SayimCandidate;
  category: string;
  /** fazla tutarı − eksik tutarı. Pozitif = kâr, negatif = zarar. */
  net: number;
  /** Zarar, ayarlanan sınırı aşıyor mu? */
  exceedsLimit: boolean;
};

export type SayimMatchResult = {
  pairs: SayimPair[];
  unmatchedMissing: SayimCandidate[];
  unmatchedExtra: SayimCandidate[];
  skipped: SayimSkipped[];
};

export type SayimMatchOptions = {
  /** Barkodun ana (veya alt) kategorisi; bilinmiyorsa null. */
  categoryOf: (barcode: string) => string | null;
  /** Barkodun birim fiyatı (TL); bilinmiyorsa null. */
  priceOf: (barcode: string) => number | null;
  /** Zarar sınırı (TL). Varsayılan 50. */
  lossLimitTry?: number;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, "tr-TR", { sensitivity: "base" });
}

function toCandidates(
  items: readonly SayimStockInput[],
  type: "missing" | "extra",
  opts: SayimMatchOptions,
  skipped: SayimSkipped[]
): SayimCandidate[] {
  const out: SayimCandidate[] = [];

  for (const item of items) {
    const quantity = Number.isFinite(item.quantity) ? item.quantity : 0;
    const base = {
      id: item.id,
      name: item.name,
      barcode: item.barcode,
      quantity,
      type,
    };

    if (quantity <= 0) {
      skipped.push({ ...base, reason: "no_quantity" });
      continue;
    }

    const category = opts.categoryOf(item.barcode)?.trim() ?? "";
    if (!category) {
      skipped.push({ ...base, reason: "no_category" });
      continue;
    }

    const unitPrice = opts.priceOf(item.barcode);
    if (unitPrice == null || !Number.isFinite(unitPrice) || unitPrice <= 0) {
      skipped.push({ ...base, reason: "no_price" });
      continue;
    }

    out.push({
      id: item.id,
      name: item.name,
      barcode: item.barcode,
      quantity,
      unitPrice,
      total: round2(quantity * unitPrice),
      category,
      imageUrl: item.imageUrl?.trim() || null,
    });
  }

  return out;
}

/**
 * Eşleştirme: her kategoride tüm (eksik × fazla) çiftleri kurup net farkın
 * mutlak değerine göre sıralar, sonra baştan başlayarak iki tarafı da boş olan
 * çiftleri tüketir.
 *
 * Çakışma kuralı buradan doğal olarak çıkıyor: iki eksik aynı fazlayı isterse
 * farkı küçük olan çift sırada önce geldiği için fazlayı o kapar, diğeri kendi
 * sonraki adayına kalır (adayı bittiyse eşleşmesiz döner).
 *
 * Not: Açgözlü yaklaşım, kategori genelinde teorik en iyi kombinasyonu garanti
 * etmez. Tek adayı olan bir eksik, o adayı daha iyi bir çifte kaptırabilir.
 */
export function matchSayimItems(
  missingItems: readonly SayimStockInput[],
  extraItems: readonly SayimStockInput[],
  opts: SayimMatchOptions
): SayimMatchResult {
  const lossLimit = Math.max(
    0,
    opts.lossLimitTry ?? SAYIM_DEFAULT_LOSS_LIMIT_TRY
  );

  const skipped: SayimSkipped[] = [];
  const missing = toCandidates(missingItems, "missing", opts, skipped);
  const extra = toCandidates(extraItems, "extra", opts, skipped);

  const extraByCategory = new Map<string, SayimCandidate[]>();
  for (const e of extra) {
    const list = extraByCategory.get(e.category) ?? [];
    list.push(e);
    extraByCategory.set(e.category, list);
  }

  type Combo = { missing: SayimCandidate; extra: SayimCandidate; net: number };
  const combos: Combo[] = [];
  for (const m of missing) {
    for (const e of extraByCategory.get(m.category) ?? []) {
      combos.push({ missing: m, extra: e, net: round2(e.total - m.total) });
    }
  }

  combos.sort((a, b) => {
    const byNet = Math.abs(a.net) - Math.abs(b.net);
    if (byNet !== 0) return byNet;
    const byMissing = compareNames(a.missing.name, b.missing.name);
    if (byMissing !== 0) return byMissing;
    return compareNames(a.extra.name, b.extra.name);
  });

  const usedMissing = new Set<string>();
  const usedExtra = new Set<string>();
  const pairs: SayimPair[] = [];

  for (const combo of combos) {
    if (usedMissing.has(combo.missing.id)) continue;
    if (usedExtra.has(combo.extra.id)) continue;
    usedMissing.add(combo.missing.id);
    usedExtra.add(combo.extra.id);
    pairs.push({
      missing: combo.missing,
      extra: combo.extra,
      category: combo.missing.category,
      net: combo.net,
      exceedsLimit: combo.net < -lossLimit,
    });
  }

  return {
    pairs,
    unmatchedMissing: missing.filter((m) => !usedMissing.has(m.id)),
    unmatchedExtra: extra.filter((e) => !usedExtra.has(e.id)),
    skipped,
  };
}

export function summarizeSayimResult(result: SayimMatchResult): {
  pairCount: number;
  withinLimitCount: number;
  exceedingCount: number;
  netTotal: number;
} {
  let netTotal = 0;
  let exceedingCount = 0;
  for (const pair of result.pairs) {
    if (pair.exceedsLimit) {
      exceedingCount += 1;
      continue;
    }
    netTotal += pair.net;
  }
  return {
    pairCount: result.pairs.length,
    withinLimitCount: result.pairs.length - exceedingCount,
    exceedingCount,
    netTotal: round2(netTotal),
  };
}

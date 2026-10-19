/**
 * Toplayıcı performansı: isim eşleştirme, renk kuralı ve rapor → gün dokümanı birleştirme.
 * Firestore'a ve Excel'e bağımlı değil (panel tarafı da kullanır).
 */

export type PickerColor = "green" | "red";

const TURKISH_FOLD: Record<string, string> = {
  ı: "i",
  ğ: "g",
  ü: "u",
  ş: "s",
  ö: "o",
  ç: "c",
};

/** Rapordaki tutarsız yazımları ("BERKCAN  ÖZKAN", "Sarikaya") tek anahtara indirger. */
export function pickerKey(name: string): string {
  return name
    .toLocaleLowerCase("tr-TR")
    .replace(/[ığüşöç]/g, (ch) => TURKISH_FOLD[ch] ?? ch)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePickerName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/** Tahmin uyum performansı 1'in altıysa yeşil; tam 1 ve üstü kırmızı. */
export function colorOf(ratio: number): PickerColor {
  return ratio < 1 ? "green" : "red";
}

/** Soğukkuyu toplayıcıları; ilk senkronda listeye elle eklenmiş gibi yazılır */
export const INITIAL_PICKER_NAMES = [
  "Hüseyin Sarıkaya",
  "Baran Özgün",
  "Ferhat Kortak",
  "Ferruh Melik Camgözoğlu",
];

export type PickerSource = "auto" | "manual";

export interface PickerEntry {
  name: string;
  active: boolean;
  source: PickerSource;
  firstSeenAt: string;
}

/** Gün dokümanındaki sipariş (alan adları doküman boyutu için kısa) */
export interface StoredPickerOrder {
  /** pickerKey */
  p: string;
  /** tahmin uyum performansı */
  r: number;
  /** "g" yeşil, "r" kırmızı — oran yuvarlansa da renk değişmesin diye ayrı tutulur */
  c: "g" | "r";
  /** prepare_duration (sn) */
  d: number;
  /** tahmini hazırlama süresi (sn) */
  e: number;
  /** siparişin geldiği rapor id'si */
  rep: string;
  /** o raporun oluşturulma zamanı; eski rapor yeni raporun değerini ezmesin */
  rc: string;
}

/** Ayrıştırılmış sipariş satırının bu modülün ihtiyaç duyduğu kısmı */
export interface PickerOrderInput {
  orderId: string;
  orderDate: string;
  pickerName: string;
  pickerKey: string;
  prepareDuration: number;
  estimatedDuration: number;
  ratio: number;
  color: PickerColor;
}

export function toStoredOrder(
  order: PickerOrderInput,
  reportId: string,
  reportCreatedAt: string
): StoredPickerOrder {
  return {
    p: order.pickerKey,
    r: Math.round(order.ratio * 1e6) / 1e6,
    c: order.color === "green" ? "g" : "r",
    d: order.prepareDuration,
    e: order.estimatedDuration,
    rep: reportId,
    rc: reportCreatedAt,
  };
}

export interface ReportSelection<T extends PickerOrderInput> {
  kept: T[];
  /** Sadece Soğukkuyu raporunda görülen, listede olmayan toplayıcılar */
  newPickers: { key: string; name: string }[];
}

/**
 * Sadece Soğukkuyu raporu: tüm satırlar alınır, yeni toplayıcılar listeye önerilir.
 * Çok depolu rapor: sadece listedeki (aktif ya da pasif) toplayıcıların satırları.
 */
export function selectReportOrders<T extends PickerOrderInput>(
  orders: T[],
  options: { sogukkuyuOnly: boolean; knownPickerKeys: ReadonlySet<string> }
): ReportSelection<T> {
  if (!options.sogukkuyuOnly) {
    return { kept: orders.filter((o) => options.knownPickerKeys.has(o.pickerKey)), newPickers: [] };
  }
  const newPickers = new Map<string, string>();
  for (const o of orders) {
    if (!options.knownPickerKeys.has(o.pickerKey) && !newPickers.has(o.pickerKey)) {
      newPickers.set(o.pickerKey, o.pickerName);
    }
  }
  return {
    kept: orders,
    newPickers: [...newPickers].map(([key, name]) => ({ key, name })),
  };
}

export function groupByDay<T extends PickerOrderInput>(orders: T[]): Map<string, T[]> {
  const days = new Map<string, T[]>();
  for (const o of orders) {
    const list = days.get(o.orderDate);
    if (list) list.push(o);
    else days.set(o.orderDate, [o]);
  }
  return days;
}

function sameValues(a: StoredPickerOrder, b: StoredPickerOrder): boolean {
  return a.p === b.p && a.d === b.d && a.e === b.e && a.c === b.c;
}

export interface PickerStatRow {
  key: string;
  name: string;
  active: boolean;
  total: number;
  green: number;
  red: number;
  /** 0–1; hiç sipariş yoksa null */
  greenRate: number | null;
  /** Ortalama tahmin uyum performansı; hiç sipariş yoksa null */
  avgRatio: number | null;
  /** Bayi paneli Toplayıcı Performansı: sipariş SKU sayısı */
  sku: number;
  /** Bayi paneli: problemli sipariş sayısı */
  problematic: number;
  /** Bayi paneli: yıldız puanı ortalaması; puan yoksa null */
  rating: number | null;
}

/** Bayi panelinden gelen metrikler (toplayıcı başına, bir gün ya da aralık) */
export interface PickerRangeMetrics {
  sku: number;
  problematic: number;
  rating: number | null;
}

/**
 * Seçilen günlerin siparişlerini toplayıcı başına toplar.
 * Aktif toplayıcılar siparişi olmasa da 0 ile listelenir; pasifler sadece istenirse.
 * `metricDays`: günlük bayi paneli metrikleri (SKU ve problemli toplanır).
 * `ratings`: aynı aralığın yıldız ortalaması (pickerKey → puan).
 */
export function aggregatePickerStats(
  days: Iterable<Readonly<Record<string, StoredPickerOrder>>>,
  pickers: Readonly<Record<string, PickerEntry>>,
  options: {
    includeInactive?: boolean;
    metricDays?: Iterable<Readonly<Record<string, Pick<PickerRangeMetrics, "sku" | "problematic">>>>;
    ratings?: Readonly<Record<string, number>>;
  } = {}
): PickerStatRow[] {
  const rows = new Map<string, PickerStatRow & { ratioSum: number }>();
  const include = (p: PickerEntry) => p.active || options.includeInactive === true;
  for (const [key, p] of Object.entries(pickers)) {
    if (!include(p)) continue;
    rows.set(key, {
      key,
      name: p.name,
      active: p.active,
      total: 0,
      green: 0,
      red: 0,
      greenRate: null,
      avgRatio: null,
      sku: 0,
      problematic: 0,
      rating: options.ratings?.[key] ?? null,
      ratioSum: 0,
    });
  }
  for (const day of options.metricDays ?? []) {
    for (const [key, m] of Object.entries(day)) {
      const row = rows.get(key);
      if (!row) continue;
      row.sku += m.sku;
      row.problematic += m.problematic;
    }
  }
  for (const orders of days) {
    for (const o of Object.values(orders)) {
      const row = rows.get(o.p);
      if (!row) continue;
      row.total++;
      if (o.c === "g") row.green++;
      else row.red++;
      row.ratioSum += o.r;
    }
  }
  return [...rows.values()].map(({ ratioSum, ...row }) => ({
    ...row,
    greenRate: row.total > 0 ? row.green / row.total : null,
    avgRatio: row.total > 0 ? ratioSum / row.total : null,
  }));
}

export type PickerSortKey =
  | "total"
  | "sku"
  | "green"
  | "red"
  | "greenRate"
  | "problematic"
  | "rating";
export type SortDirection = "desc" | "asc";

/** Eşitlikte isim sırası; siparişi olmayanın yüzdesi (null) her zaman en sonda. */
export function sortPickerStats(
  rows: readonly PickerStatRow[],
  key: PickerSortKey,
  direction: SortDirection
): PickerStatRow[] {
  const sign = direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null || bv == null) {
      if (av == null && bv != null) return 1;
      if (bv == null && av != null) return -1;
    } else if (av !== bv) {
      return (av - bv) * sign;
    }
    return a.name.localeCompare(b.name, "tr");
  });
}

/**
 * Gün dokümanına yazılacak siparişleri seçer: yeni olanlar ve daha yeni bir rapordan
 * farklı değerle gelenler. Değişmeyen sipariş yazılmaz (Firestore kotası).
 */
export function planDayUpdates(
  existing: Readonly<Record<string, StoredPickerOrder>> | undefined,
  incoming: Readonly<Record<string, StoredPickerOrder>>
): Record<string, StoredPickerOrder> {
  const updates: Record<string, StoredPickerOrder> = {};
  for (const [orderId, next] of Object.entries(incoming)) {
    const prev = existing?.[orderId];
    if (!prev) {
      updates[orderId] = next;
      continue;
    }
    if (prev.rc > next.rc) continue;
    if (sameValues(prev, next)) continue;
    updates[orderId] = next;
  }
  return updates;
}

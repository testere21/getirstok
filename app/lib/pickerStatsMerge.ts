/**
 * Toplayıcı performansı: isim eşleştirme, renk kuralı ve rapor → gün dokümanı birleştirme.
 * Firestore'a ve Excel'e bağımlı değil (panel tarafı da kullanır).
 */
import { SOGUKKUYU_WAREHOUSE_ID } from "./franchiseWarehouses";

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

/** Excel'den gelen 1'in kayan nokta sapması (1.0000000001) tam 1 sayılsın */
const RATIO_EPSILON = 1e-9;

/** Tahmin uyum performansı 1 ve altıysa yeşil; 1'in üstü kırmızı. */
export function colorOf(ratio: number): PickerColor {
  return ratio <= 1 + RATIO_EPSILON ? "green" : "red";
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
  /** Çalıştığı depo; depocular depo değiştirmiyor. Eski kayıtlarda yok → Soğukkuyu */
  warehouseId?: string;
}

export function pickerWarehouseId(entry: Pick<PickerEntry, "warehouseId">): string {
  return entry.warehouseId ?? SOGUKKUYU_WAREHOUSE_ID;
}

/** pickerKey → depo (listedeki herkes, pasifler dahil) */
export function pickerWarehouseMap(pickers: Readonly<Record<string, PickerEntry>>): Map<string, string> {
  return new Map(Object.entries(pickers).map(([key, p]) => [key, pickerWarehouseId(p)]));
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
  /** depo → o deponun gün dokümanlarına yazılacak siparişler */
  byWarehouse: Map<string, T[]>;
  /** Tek depolu raporda görülen, listede olmayan toplayıcılar (raporun deposuyla) */
  newPickers: { key: string; name: string; warehouseId: string }[];
  /** Çok depolu raporda deposu bilinmeyen toplayıcıların siparişleri */
  unassigned: T[];
}

/**
 * "Depo İçi Süre" sayfasında depo sütunu yok; sipariş deposu şöyle bulunur:
 * - Tek depolu rapor: hepsi raporun deposu; listede olmayanlar o depoyla önerilir.
 * - Çok depolu rapor: toplayıcının listedeki deposu; bilinmeyenler `unassigned`.
 */
export function selectReportOrders<T extends PickerOrderInput>(
  orders: T[],
  options: { reportWarehouseId: string | null; pickerWarehouses: ReadonlyMap<string, string> }
): ReportSelection<T> {
  const byWarehouse = new Map<string, T[]>();
  const add = (warehouseId: string, o: T) => {
    const list = byWarehouse.get(warehouseId);
    if (list) list.push(o);
    else byWarehouse.set(warehouseId, [o]);
  };
  const newPickers = new Map<string, { key: string; name: string; warehouseId: string }>();
  const unassigned: T[] = [];

  for (const o of orders) {
    if (options.reportWarehouseId) {
      add(options.reportWarehouseId, o);
      if (!options.pickerWarehouses.has(o.pickerKey) && !newPickers.has(o.pickerKey)) {
        newPickers.set(o.pickerKey, { key: o.pickerKey, name: o.pickerName, warehouseId: options.reportWarehouseId });
      }
      continue;
    }
    const warehouseId = options.pickerWarehouses.get(o.pickerKey);
    if (warehouseId) add(warehouseId, o);
    else unassigned.push(o);
  }
  return { byWarehouse, newPickers: [...newPickers.values()], unassigned };
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
  warehouseId: string;
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
    /** Verilirse sadece bu depoların toplayıcıları */
    warehouseIds?: ReadonlySet<string>;
    metricDays?: Iterable<Readonly<Record<string, Pick<PickerRangeMetrics, "sku" | "problematic">>>>;
    ratings?: Readonly<Record<string, number>>;
  } = {}
): PickerStatRow[] {
  const rows = new Map<string, PickerStatRow & { ratioSum: number }>();
  const include = (p: PickerEntry) =>
    (p.active || options.includeInactive === true) &&
    (!options.warehouseIds || options.warehouseIds.has(pickerWarehouseId(p)));
  for (const [key, p] of Object.entries(pickers)) {
    if (!include(p)) continue;
    rows.set(key, {
      key,
      name: p.name,
      active: p.active,
      warehouseId: pickerWarehouseId(p),
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

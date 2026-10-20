/**
 * Toplayıcı performansı Firestore katmanı.
 * - `picker_stats_days/{depoId}_{YYYY-MM-DD}`: o deponun o günkü siparişleri, sipariş id'si anahtar
 * - `picker_stats_meta/state`: okunan raporlar + toplayıcı listesi (toplayıcının deposu dahil)
 * - `picker_metric_days_all/{YYYY-MM-DD}`: bayi panelinden o günün SKU / problemli / yıldız
 *   değeri, tüm depolar (toplayıcı başına küçük veri; depocular depo değiştirmiyor)
 * - `picker_rating_ranges_all/{from}_{to}`: çok günlü aralığın yıldız ortalaması, tüm depolar
 */
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { FRANCHISE_WAREHOUSE_IDS, isFranchiseWarehouseId } from "./franchiseWarehouses";
import { pickerRatingRangeDocId, type PickerMetrics } from "./pickerMetrics";
import {
  normalizePickerName,
  pickerKey,
  pickerWarehouseId,
  type PickerEntry,
  type StoredPickerOrder,
} from "./pickerStatsMerge";

export const PICKER_STATS_DAYS_COLLECTION = "picker_stats_days";
export const PICKER_STATS_META_COLLECTION = "picker_stats_meta";
export const PICKER_METRIC_DAYS_COLLECTION = "picker_metric_days_all";
export const PICKER_RATING_RANGES_COLLECTION = "picker_rating_ranges_all";
const STATE_DOC_ID = "state";
/** Depo önekli doküman aralığının üst sınırı (her tarihten büyük) */
const YMD_MAX = "9999-99-99";

export interface ProcessedReportInfo {
  at: string;
  startDate: string | null;
  endDate: string | null;
  /** Eski kayıtlar: sadece Soğukkuyu raporu mu */
  sogukkuyuOnly: boolean;
  /** Raporun kapsadığı depolar */
  warehouseIds?: string[];
  /** Tüm depolar okunarak işlendi; eski (sadece Soğukkuyu alan) işlemede yok */
  allWarehouses?: boolean;
  /** Rapordaki sipariş sayısı */
  orders: number;
  /** Bizim aldığımız (deposu bilinen) sipariş sayısı */
  kept: number;
  /** Getir raporu veri hazır olmadan üretmiş ("There is no record…") */
  noRecords?: boolean;
  /** Dosya Getir'de silinmiş (8 gün sınırı); bir daha denenmez */
  fileGone?: boolean;
}

export interface PickerStatsState {
  processedReports: Record<string, ProcessedReportInfo>;
  pickers: Record<string, PickerEntry>;
  lastSyncAt: string | null;
  /** Elde siparişi olan en son gün ("veri şu tarihe kadar") */
  latestDay: string | null;
}

export interface PickerStatsDay {
  orders: Record<string, StoredPickerOrder>;
}

function stateRef() {
  return doc(db, PICKER_STATS_META_COLLECTION, STATE_DOC_ID);
}

export function pickerStatsDayDocId(warehouseId: string, ymd: string): string {
  return `${warehouseId}_${ymd}`;
}

export function dayRef(warehouseId: string, ymd: string) {
  return doc(db, PICKER_STATS_DAYS_COLLECTION, pickerStatsDayDocId(warehouseId, ymd));
}

function warehouseDaysQuery(warehouseId: string, fromYmd: string, toYmd: string) {
  return query(
    collection(db, PICKER_STATS_DAYS_COLLECTION),
    where(documentId(), ">=", pickerStatsDayDocId(warehouseId, fromYmd)),
    where(documentId(), "<=", pickerStatsDayDocId(warehouseId, toYmd))
  );
}

/** "6113…_2026-10-15" → "2026-10-15" */
function ymdFromDayDocId(id: string): string {
  return id.slice(id.indexOf("_") + 1);
}

function asRecord<T>(v: unknown): Record<string, T> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, T>) : {};
}

export function parseState(data: unknown): PickerStatsState {
  const o = asRecord<unknown>(data);
  return {
    processedReports: asRecord<ProcessedReportInfo>(o.processedReports),
    pickers: asRecord<PickerEntry>(o.pickers),
    lastSyncAt: typeof o.lastSyncAt === "string" ? o.lastSyncAt : null,
    latestDay: typeof o.latestDay === "string" ? o.latestDay : null,
  };
}

export async function readPickerStatsState(): Promise<PickerStatsState> {
  const snap = await getDoc(stateRef());
  return parseState(snap.exists() ? snap.data() : null);
}

/**
 * Durum dokümanına kısmi yazar. İç içe haritalar birleştirilir
 * (ör. `{ pickers: { x: … } }` diğer toplayıcıları silmez).
 */
export async function patchPickerStatsState(patch: {
  processedReports?: Record<string, ProcessedReportInfo>;
  pickers?: Record<string, PickerEntry>;
  lastSyncAt?: string;
  latestDay?: string;
}): Promise<void> {
  await setDoc(stateRef(), patch, { merge: true });
}

export async function readPickerStatsDay(warehouseId: string, ymd: string): Promise<PickerStatsDay> {
  const snap = await getDoc(dayRef(warehouseId, ymd));
  return { orders: asRecord<StoredPickerOrder>(snap.exists() ? snap.data()?.orders : null) };
}

/**
 * Bir deponun aralıktaki gün dokümanlarını tek sorguda okur (gün başına bir okuma).
 * Dokümanı olmayan günler sonuçta yer almaz. Anahtar YYYY-MM-DD.
 */
export async function readPickerStatsDaysRange(
  warehouseId: string,
  fromYmd: string,
  toYmd: string
): Promise<Map<string, Record<string, StoredPickerOrder>>> {
  const snap = await getDocs(warehouseDaysQuery(warehouseId, fromYmd, toYmd));
  const days = new Map<string, Record<string, StoredPickerOrder>>();
  for (const d of snap.docs) days.set(ymdFromDayDocId(d.id), asRecord<StoredPickerOrder>(d.data()?.orders));
  return days;
}

/**
 * Verilen günden bu yana herhangi bir depoda dokümanı olan en son gün. Ters sıralı sorgu
 * Firestore'da ayrı dizin istediği için düz aralık okunur; sadece `latestDay` hiç
 * yazılmamışsa (eski veri) bir kez kullanılır.
 */
export async function scanLatestPickerStatsDay(sinceYmd: string): Promise<string | null> {
  let latest: string | null = null;
  for (const warehouseId of FRANCHISE_WAREHOUSE_IDS) {
    const snap = await getDocs(warehouseDaysQuery(warehouseId, sinceYmd, YMD_MAX));
    for (const d of snap.docs) {
      const ymd = ymdFromDayDocId(d.id);
      if (!latest || ymd > latest) latest = ymd;
    }
  }
  return latest;
}

export class PickerListError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PickerListError";
  }
}

export async function setPickerActive(key: string, active: boolean): Promise<void> {
  await setDoc(stateRef(), { pickers: { [key]: { active } } }, { merge: true });
}

/** Rapor birden fazla depoyu kapsıyor mu (eski kayıtlarda depo listesi yok) */
export function isMultiWarehouseReport(info: ProcessedReportInfo): boolean {
  return info.warehouseIds ? info.warehouseIds.length > 1 : !info.sogukkuyuOnly;
}

/**
 * Listeye elle toplayıcı ekler (pasifse aktif eder). Çok depolu raporlarda bu kişinin
 * satırları deposu bilinmediği için alınmamış olabilir; o raporlar yeniden okunmak üzere
 * işaretlenir, yeniden okumada sadece eksik siparişler yazılır.
 * @returns Yeniden okunacak rapor sayısı
 */
export async function addPicker(
  rawName: string,
  warehouseId: string
): Promise<{ key: string; reprocess: number }> {
  const name = normalizePickerName(rawName);
  if (name.length < 3 || name.length > 60) {
    throw new PickerListError("İsim 3–60 karakter olmalı.");
  }
  if (!isFranchiseWarehouseId(warehouseId)) {
    throw new PickerListError("Depo seçin.");
  }
  const key = pickerKey(name);
  const state = await readPickerStatsState();
  const existing = state.pickers[key];
  if (existing?.active) {
    throw new PickerListError(`"${existing.name}" zaten listede.`);
  }
  if (existing && pickerWarehouseId(existing) !== warehouseId) {
    throw new PickerListError(`"${existing.name}" listede başka depoyla kayıtlı; deposunu listeden değiştirin.`);
  }

  const reprocessIds = Object.entries(state.processedReports)
    .filter(([, info]) => isMultiWarehouseReport(info) && !info.fileGone)
    .map(([id]) => id);

  const entry: PickerEntry = existing
    ? { ...existing, active: true }
    : { name, active: true, source: "manual", firstSeenAt: new Date().toISOString(), warehouseId };
  await setDoc(
    stateRef(),
    {
      pickers: { [key]: entry },
      processedReports: Object.fromEntries(reprocessIds.map((id) => [id, deleteField()])),
    },
    { merge: true }
  );
  return { key, reprocess: reprocessIds.length };
}

/**
 * Toplayıcının deposunu değiştirir ve kayıtlı siparişlerini eski deponun gün
 * dokümanlarından yenisine taşır (panel depo dokümanını okuduğu için).
 * @returns Taşınan sipariş sayısı
 */
export async function setPickerWarehouse(key: string, warehouseId: string): Promise<number> {
  if (!isFranchiseWarehouseId(warehouseId)) throw new PickerListError("Geçersiz depo.");
  const state = await readPickerStatsState();
  const entry = state.pickers[key];
  if (!entry) throw new PickerListError("Toplayıcı listede yok.");
  const from = pickerWarehouseId(entry);
  if (from === warehouseId) return 0;

  const snap = await getDocs(warehouseDaysQuery(from, "0000-00-00", YMD_MAX));
  let moved = 0;
  for (const d of snap.docs) {
    const orders = asRecord<StoredPickerOrder>(d.data()?.orders);
    const mine = Object.entries(orders).filter(([, o]) => o.p === key);
    if (mine.length === 0) continue;
    const ymd = ymdFromDayDocId(d.id);
    // Önce hedefe yaz, sonra kaynaktan sil: arada kesilirse sipariş kaybolmaz (sadece iki kez sayılır)
    await setDoc(
      dayRef(warehouseId, ymd),
      { orders: Object.fromEntries(mine), updatedAt: new Date().toISOString() },
      { merge: true }
    );
    await setDoc(
      d.ref,
      { orders: Object.fromEntries(mine.map(([id]) => [id, deleteField()])), updatedAt: new Date().toISOString() },
      { merge: true }
    );
    moved += mine.length;
  }
  await setDoc(stateRef(), { pickers: { [key]: { warehouseId } } }, { merge: true });
  return moved;
}

/**
 * Elle eklenmiş toplayıcıyı listeden tamamen çıkarır (yanlış yazılan isim için).
 * Siparişleri gün dokümanlarında kalır ama listede olmadığı için sayılmaz.
 * Otomatik eklenenler sonraki raporda geri geleceği için pasif yapılmalı.
 */
export async function removeManualPicker(key: string): Promise<void> {
  const state = await readPickerStatsState();
  const entry = state.pickers[key];
  if (!entry) return;
  if (entry.source !== "manual") {
    throw new PickerListError("Raporlardan otomatik eklenen toplayıcı kaldırılamaz; pasif yapın.");
  }
  await setDoc(stateRef(), { pickers: { [key]: deleteField() } }, { merge: true });
}

export interface PickerMetricDay {
  /** pickerKey → o günün metrikleri */
  pickers: Record<string, PickerMetrics>;
  fetchedAt: string;
}

/** Aralıktaki günlük metrik kayıtları; çekilmemiş günler sonuçta yer almaz. */
export async function readPickerMetricDaysRange(
  fromYmd: string,
  toYmd: string
): Promise<Map<string, PickerMetricDay>> {
  const snap = await getDocs(
    query(
      collection(db, PICKER_METRIC_DAYS_COLLECTION),
      where(documentId(), ">=", fromYmd),
      where(documentId(), "<=", toYmd)
    )
  );
  const days = new Map<string, PickerMetricDay>();
  for (const d of snap.docs) {
    const data = d.data();
    days.set(d.id, {
      pickers: asRecord<PickerMetrics>(data?.pickers),
      fetchedAt: typeof data?.fetchedAt === "string" ? data.fetchedAt : "",
    });
  }
  return days;
}

/** Günün tamamını yazar (Getir her seferinde o günün tüm toplayıcılarını verir). */
export async function writePickerMetricDay(ymd: string, day: PickerMetricDay): Promise<void> {
  await setDoc(doc(db, PICKER_METRIC_DAYS_COLLECTION, ymd), day);
}

export interface PickerRatingRange {
  from: string;
  to: string;
  /** pickerKey → yıldız ortalaması (puanı olmayan yer almaz) */
  ratings: Record<string, number>;
  fetchedAt: string;
}

function ratingRef(from: string, to: string) {
  return doc(db, PICKER_RATING_RANGES_COLLECTION, pickerRatingRangeDocId(from, to));
}

export async function readPickerRatingRange(from: string, to: string): Promise<PickerRatingRange | null> {
  const snap = await getDoc(ratingRef(from, to));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    from,
    to,
    ratings: asRecord<number>(data?.ratings),
    fetchedAt: typeof data?.fetchedAt === "string" ? data.fetchedAt : "",
  };
}

export async function writePickerRatingRange(range: PickerRatingRange): Promise<void> {
  await setDoc(ratingRef(range.from, range.to), range);
}

/** `cutoffYmd`'den önceki günlük kayıtları ve bitişi ondan önce olan aralıkları siler. */
export async function deletePickerMetricsBefore(cutoffYmd: string): Promise<number> {
  const [days, ranges] = await Promise.all([
    getDocs(query(collection(db, PICKER_METRIC_DAYS_COLLECTION), where(documentId(), "<", cutoffYmd))),
    getDocs(query(collection(db, PICKER_RATING_RANGES_COLLECTION), where("to", "<", cutoffYmd))),
  ]);
  await Promise.all([...days.docs, ...ranges.docs].map((d) => deleteDoc(d.ref)));
  return days.size + ranges.size;
}

/** Sadece verilen siparişleri yazar; gündeki diğer siparişler korunur. */
export async function writePickerStatsDayOrders(
  warehouseId: string,
  ymd: string,
  orders: Record<string, StoredPickerOrder>
): Promise<void> {
  await setDoc(dayRef(warehouseId, ymd), { orders, updatedAt: new Date().toISOString() }, { merge: true });
}

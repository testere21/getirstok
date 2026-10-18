/**
 * Toplayıcı performansı Firestore katmanı.
 * - `picker_stats_days/{YYYY-MM-DD}`: o günün siparişleri, sipariş id'si anahtar
 * - `picker_stats_meta/state`: okunan raporlar + toplayıcı listesi
 */
import {
  collection,
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
import {
  normalizePickerName,
  pickerKey,
  type PickerEntry,
  type StoredPickerOrder,
} from "./pickerStatsMerge";

export const PICKER_STATS_DAYS_COLLECTION = "picker_stats_days";
export const PICKER_STATS_META_COLLECTION = "picker_stats_meta";
const STATE_DOC_ID = "state";

export interface ProcessedReportInfo {
  at: string;
  startDate: string | null;
  endDate: string | null;
  sogukkuyuOnly: boolean;
  /** Rapordaki sipariş sayısı */
  orders: number;
  /** Bizim aldığımız (Soğukkuyu) sipariş sayısı */
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

export function dayRef(ymd: string) {
  return doc(db, PICKER_STATS_DAYS_COLLECTION, ymd);
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

export async function readPickerStatsDay(ymd: string): Promise<PickerStatsDay> {
  const snap = await getDoc(dayRef(ymd));
  return { orders: asRecord<StoredPickerOrder>(snap.exists() ? snap.data()?.orders : null) };
}

/**
 * Aralıktaki gün dokümanlarını tek sorguda okur (gün başına bir okuma).
 * Dokümanı olmayan günler sonuçta yer almaz.
 */
export async function readPickerStatsDaysRange(
  fromYmd: string,
  toYmd: string
): Promise<Map<string, Record<string, StoredPickerOrder>>> {
  const snap = await getDocs(
    query(
      collection(db, PICKER_STATS_DAYS_COLLECTION),
      where(documentId(), ">=", fromYmd),
      where(documentId(), "<=", toYmd)
    )
  );
  const days = new Map<string, Record<string, StoredPickerOrder>>();
  for (const d of snap.docs) days.set(d.id, asRecord<StoredPickerOrder>(d.data()?.orders));
  return days;
}

/**
 * Verilen günden bu yana dokümanı olan en son gün. Ters sıralı sorgu Firestore'da
 * ayrı dizin istediği için düz aralık okunur; sadece `latestDay` hiç yazılmamışsa
 * (eski veri) bir kez kullanılır.
 */
export async function scanLatestPickerStatsDay(sinceYmd: string): Promise<string | null> {
  const snap = await getDocs(
    query(collection(db, PICKER_STATS_DAYS_COLLECTION), where(documentId(), ">=", sinceYmd))
  );
  let latest: string | null = null;
  for (const d of snap.docs) if (!latest || d.id > latest) latest = d.id;
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

/**
 * Listeye elle toplayıcı ekler (pasifse aktif eder). Çok depolu raporlarda bu kişinin
 * satırları daha önce alınmadığı için o raporlar yeniden okunmak üzere işaretlenir;
 * yeniden okumada sadece eksik siparişler yazılır.
 * @returns Yeniden okunacak rapor sayısı
 */
export async function addPicker(rawName: string): Promise<{ key: string; reprocess: number }> {
  const name = normalizePickerName(rawName);
  if (name.length < 3 || name.length > 60) {
    throw new PickerListError("İsim 3–60 karakter olmalı.");
  }
  const key = pickerKey(name);
  const state = await readPickerStatsState();
  const existing = state.pickers[key];
  if (existing?.active) {
    throw new PickerListError(`"${existing.name}" zaten listede.`);
  }

  const reprocessIds = Object.entries(state.processedReports)
    .filter(([, info]) => !info.sogukkuyuOnly && !info.fileGone)
    .map(([id]) => id);

  const entry: PickerEntry = existing
    ? { ...existing, active: true }
    : { name, active: true, source: "manual", firstSeenAt: new Date().toISOString() };
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
 * Elle eklenmiş toplayıcıyı listeden tamamen çıkarır (yanlış yazılan isim için).
 * Siparişleri gün dokümanlarında kalır ama listede olmadığı için sayılmaz.
 * Otomatik eklenenler sonraki Soğukkuyu raporunda geri geleceği için pasif yapılmalı.
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

/** Sadece verilen siparişleri yazar; gündeki diğer siparişler korunur. */
export async function writePickerStatsDayOrders(
  ymd: string,
  orders: Record<string, StoredPickerOrder>
): Promise<void> {
  await setDoc(dayRef(ymd), { orders, updatedAt: new Date().toISOString() }, { merge: true });
}

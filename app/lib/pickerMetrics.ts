/**
 * Bayi paneli Toplayıcı Performansı (`/picker/v2/metrics`) metrikleri.
 * - SKU ve problemli sipariş gün gün saklanır; aralık toplamı günlerden hesaplanır.
 * - Yıldız ortalaması günlere bölünüp toplanamadığı için çok günlü aralıkta Getir'den
 *   aralık olarak alınır (tek gün aralıkta günün kaydındaki değer kullanılır).
 * Firestore'a bağımlı değil.
 */
import { subtractMonthsYmd } from "./dpsRange";
import { pickerKey, type PickerRangeMetrics } from "./pickerStatsMerge";
import { addDaysYmd, istanbulTodayYmd, normalizeRange, type YmdRange } from "./pickerStatsPeriod";

export type PickerMetrics = PickerRangeMetrics;

export interface PickerMetricsPage {
  /** pickerKey → metrikler */
  pickers: Record<string, PickerMetrics>;
  /** Bu sayfadaki satır sayısı */
  rows: number;
  totalCount: number;
}

/** Kayıtlar bu kadar ay tutulur (DPS ile aynı) */
export const PICKER_METRICS_RETENTION_MONTHS = 5;

function toNumber(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

export function parsePickerMetrics(json: unknown): PickerMetricsPage {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const data = Array.isArray(o.data) ? o.data : [];
  const pickers: Record<string, PickerMetrics> = {};
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name : "";
    if (!name.trim()) continue;
    const rating = toNumber(row.avg_rating);
    pickers[pickerKey(name)] = {
      sku: Math.max(0, Math.round(toNumber(row.total_order_sku_count) ?? 0)),
      problematic: Math.max(0, Math.round(toNumber(row.problematic_order_count) ?? 0)),
      rating: rating != null && rating > 0 ? rating : null,
    };
  }
  return {
    pickers,
    rows: data.length,
    totalCount: typeof o.total_count === "number" ? o.total_count : data.length,
  };
}

/**
 * Getir günü geç tamamlayabilir: son günden sonraki ikinci gün (İstanbul) veya daha sonra
 * çekilen değer kesin sayılır. Kesinleşmemiş kayıt sadece "Güncelle" ile yenilenir.
 */
export function isPickerMetricsFinal(to: string, fetchedAt: string): boolean {
  if (!fetchedAt) return false;
  return istanbulTodayYmd(new Date(fetchedAt)) >= addDaysYmd(to, 2);
}

/**
 * Kayıt Getir'den (yeniden) çekilmeli mi?
 * @param refreshSince "Güncelle"ye basılma anı (ISO). Verilirse bu andan önce çekilmiş
 *   kesinleşmemiş kayıtlar yenilenir; aynı turda ikinci kez çekilmez.
 */
export function needsMetricsFetch(
  doc: { fetchedAt: string } | null | undefined,
  to: string,
  refreshSince: string | null
): boolean {
  if (!doc) return true;
  if (!refreshSince) return false;
  return doc.fetchedAt < refreshSince && !isPickerMetricsFinal(to, doc.fetchedAt);
}

/** Getir bugünden sonrasını bilmez; aralık bugüne kırpılır */
export function clampMetricsRange(range: YmdRange, today: string): YmdRange {
  const normalized = normalizeRange(range);
  const to = normalized.to > today ? today : normalized.to;
  return { from: normalized.from > to ? to : normalized.from, to };
}

/** Bitişi bu günden önce olan kayıtlar silinir */
export function pickerMetricsRetentionCutoff(today: string): string {
  return subtractMonthsYmd(today, PICKER_METRICS_RETENTION_MONTHS);
}

export function pickerRatingRangeDocId(from: string, to: string): string {
  return `${from}_${to}`;
}

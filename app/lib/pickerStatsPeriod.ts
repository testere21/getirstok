/** Toplayıcı performansı dönem seçimi: İstanbul takvim günleri (YYYY-MM-DD). */

export type PeriodPreset = "today" | "yesterday" | "last2" | "last7" | "thisWeek" | "thisMonth";

export interface YmdRange {
  from: string;
  to: string;
}

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Yanlışlıkla yıllarca geriye gidip yüzlerce gün dokümanı okunmasın */
export const MAX_RANGE_DAYS = 93;

export function isYmd(value: string): boolean {
  const m = YMD_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function istanbulTodayYmd(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(now);
}

function toUtcDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = toUtcDate(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtcDate(d);
}

/** Hafta pazartesi başlar */
export function presetRange(preset: PeriodPreset, today: string): YmdRange {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = addDaysYmd(today, -1);
      return { from: y, to: y };
    }
    case "last2":
      return { from: addDaysYmd(today, -1), to: today };
    case "last7":
      return { from: addDaysYmd(today, -6), to: today };
    case "thisWeek": {
      const mondayOffset = (toUtcDate(today).getUTCDay() + 6) % 7;
      return { from: addDaysYmd(today, -mondayOffset), to: today };
    }
    case "thisMonth":
      return { from: `${today.slice(0, 8)}01`, to: today };
  }
}

/** Ters girilen aralığı düzeltir ve en fazla MAX_RANGE_DAYS güne kırpar (sondan geriye). */
export function normalizeRange(range: YmdRange): YmdRange {
  let { from, to } = range;
  if (from > to) [from, to] = [to, from];
  const earliest = addDaysYmd(to, -(MAX_RANGE_DAYS - 1));
  if (from < earliest) from = earliest;
  return { from, to };
}

export function daysInRange(range: YmdRange): string[] {
  const { from, to } = normalizeRange(range);
  const days: string[] = [];
  for (let d = from; d <= to; d = addDaysYmd(d, 1)) days.push(d);
  return days;
}

const MONTHS_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

/** "2026-10-15" → "15 Eki" (yıl farklıysa "15 Eki 2025") */
export function formatYmdShort(ymd: string, currentYear?: string): string {
  const [y, m, d] = ymd.split("-");
  const base = `${Number(d)} ${MONTHS_TR[Number(m) - 1]}`;
  return currentYear && currentYear !== y ? `${base} ${y}` : base;
}

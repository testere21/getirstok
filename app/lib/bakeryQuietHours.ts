/** Fırın otomatik stok turu — gece molası (İstanbul). */

export const BAKERY_QUIET_HOURS_TIME_ZONE = "Europe/Istanbul";

/** Molanın bittiği saat (hariç). 07:00’de sorgu açık. */
export const BAKERY_QUIET_END_HOUR = 7;

export function getIstanbulHour(now: Date = new Date()): number {
  const raw = new Intl.DateTimeFormat("en-GB", {
    timeZone: BAKERY_QUIET_HOURS_TIME_ZONE,
    hour: "numeric",
    hourCycle: "h23",
  }).format(now);
  const hour = Number.parseInt(raw, 10);
  if (!Number.isFinite(hour)) return 0;
  if (hour === 24) return 0;
  return hour;
}

/** 00:00 dahil, 07:00 hariç. */
export function isBakeryQuietHours(now: Date = new Date()): boolean {
  const hour = getIstanbulHour(now);
  return hour >= 0 && hour < BAKERY_QUIET_END_HOUR;
}

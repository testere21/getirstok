/** İstanbul takvim günü → UTC ISO aralığı (Getir warehouse tarih filtreleri). */

export class IstanbulDayBoundsError extends Error {
  readonly code = "BAD_DATE";
  constructor(message: string) {
    super(message);
    this.name = "IstanbulDayBoundsError";
  }
}

export type IstanbulUtcIsoRange = {
  startDate: string;
  endDate: string;
};

export function istanbulDayToUtcIsoRange(ymd: string): IstanbulUtcIsoRange {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw new IstanbulDayBoundsError(
      "Tarih YYYY-MM-DD formatında olmalı (ör. 2026-09-09)."
    );
  }
  const start = new Date(`${ymd}T00:00:00+03:00`);
  const end = new Date(`${ymd}T23:59:59.999+03:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new IstanbulDayBoundsError("Geçersiz tarih.");
  }
  const istanbulYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(start);
  if (istanbulYmd !== ymd) {
    throw new IstanbulDayBoundsError("Geçersiz tarih.");
  }
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

/** Depo `get-expiring-products` gövdesi. */
export function buildRemoveFromSaleDateRange(ymd: string): {
  removeFromSaleDateRange: IstanbulUtcIsoRange;
} {
  return { removeFromSaleDateRange: istanbulDayToUtcIsoRange(ymd) };
}

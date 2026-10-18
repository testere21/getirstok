/** DPS tarih kuralları: en son gün dün (Getir bugünü hesaplamıyor), en eski 5 ay önce. */
import { addDaysYmd, isYmd } from "./pickerStatsPeriod";

export const DPS_RETENTION_MONTHS = 5;

/** Ay çıkarır; hedef ayda o gün yoksa ayın son günü (31 Mart − 1 ay → 28/29 Şubat) */
export function subtractMonthsYmd(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const totalMonths = y * 12 + (m - 1) - months;
  const ty = Math.floor(totalMonths / 12);
  const tm = totalMonths % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${ty}-${String(tm + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export interface DpsDateLimits {
  /** Seçilebilecek en eski gün */
  min: string;
  /** Seçilebilecek en son gün (dün) */
  max: string;
}

export function dpsDateLimits(today: string): DpsDateLimits {
  return { min: subtractMonthsYmd(today, DPS_RETENTION_MONTHS), max: addDaysYmd(today, -1) };
}

/** Bitişi bu günden önce olan kayıtlar silinir */
export function dpsRetentionCutoff(today: string): string {
  return dpsDateLimits(today).min;
}

/** @returns Hata mesajı; aralık geçerliyse null */
export function validateDpsRange(from: string, to: string, today: string): string | null {
  if (!isYmd(from) || !isYmd(to)) return "Tarih YYYY-MM-DD biçiminde olmalı.";
  if (from > to) return "Başlangıç tarihi bitişten sonra olamaz.";
  const { min, max } = dpsDateLimits(today);
  if (to > max) return "Getir bugünün DPS puanını hesaplamıyor; en son dün seçilebilir.";
  if (from < min) return `En fazla ${DPS_RETENTION_MONTHS} ay öncesi seçilebilir.`;
  return null;
}

export function dpsDocId(from: string, to: string): string {
  return `${from}_${to}`;
}

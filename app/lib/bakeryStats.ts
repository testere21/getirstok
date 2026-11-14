/**
 * Pişirme istatistikleri: "Beni pişir" uyarısı açıkken geçen dakikalar (depo başına, gün başına).
 * Eklenti dakika dakika işaretler; dakikalar 60 karakterlik 0/1 dizisi olarak tutulur, böylece
 * aynı depoda birden çok bilgisayar aynı dakikayı gönderse de birleşince bir kez sayılır.
 */

export const BAKERY_STATS_KEEP_DAYS = 120;
export const BAKERY_STATS_MAX_RANGE_DAYS = 62;

/** Saat → izlenen dakikalar (o), uyarılı dakikalar (a), en yüksek bekleyen adet (q) */
export interface BakeryStatsHour {
  o: string;
  a: string;
  q: number;
}

/** Getir'in dilim verisi: öneri, pişirilen, satılan */
export interface BakeryStatsSlot {
  p: number;
  c: number | null;
  s: number;
}

export interface BakeryStatsDay {
  h: Record<string, BakeryStatsHour>;
  /** Ürün → saat → uyarılı dakikalar */
  ih: Record<string, Record<string, string>>;
  slots: Record<string, BakeryStatsSlot>;
}

const BITS_RE = /^[01]{60}$/;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const WAREHOUSE_ID_RE = /^[a-f0-9]{24}$/i;
const SLOT_KEYS = new Set(["08-12", "12-16", "16-20", "20-00"]);
const MAX_PRODUCTS = 80;
const MAX_PRODUCT_NAME = 120;
const MAX_DAYS_PER_PUSH = 7;

export function isBakeryStatsYmd(v: unknown): v is string {
  return typeof v === "string" && YMD_RE.test(v);
}

export function isBakeryStatsWarehouseId(v: unknown): v is string {
  return typeof v === "string" && WAREHOUSE_ID_RE.test(v);
}

export function bakeryStatsDocId(warehouseId: string, ymd: string): string {
  return `${warehouseId}_${ymd}`;
}

export function orBits(a: string | undefined, b: string | undefined): string {
  const x = a && BITS_RE.test(a) ? a : null;
  const y = b && BITS_RE.test(b) ? b : null;
  if (!x) return y ?? "0".repeat(60);
  if (!y) return x;
  let out = "";
  for (let i = 0; i < 60; i++) out += x[i] === "1" || y[i] === "1" ? "1" : "0";
  return out;
}

function isHourKey(k: string): boolean {
  const n = Number(k);
  return /^\d{1,2}$/.test(k) && n >= 0 && n <= 23;
}

function finiteNonNegative(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
}

export function sanitizeBakeryStatsDay(raw: unknown): BakeryStatsDay | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const day: BakeryStatsDay = { h: {}, ih: {}, slots: {} };

  if (r.h && typeof r.h === "object") {
    for (const [k, v] of Object.entries(r.h as Record<string, unknown>)) {
      if (!isHourKey(k) || !v || typeof v !== "object") continue;
      const hv = v as Record<string, unknown>;
      const o = typeof hv.o === "string" && BITS_RE.test(hv.o) ? hv.o : null;
      if (!o) continue;
      const a = typeof hv.a === "string" && BITS_RE.test(hv.a) ? hv.a : "0".repeat(60);
      day.h[String(Number(k))] = { o, a, q: finiteNonNegative(hv.q) ?? 0 };
    }
  }

  if (r.ih && typeof r.ih === "object") {
    for (const [name, hours] of Object.entries(r.ih as Record<string, unknown>).slice(0, MAX_PRODUCTS)) {
      const clean = name.replace(/\s+/g, " ").trim().slice(0, MAX_PRODUCT_NAME);
      if (!clean || !hours || typeof hours !== "object") continue;
      const out: Record<string, string> = {};
      for (const [k, bits] of Object.entries(hours as Record<string, unknown>)) {
        if (isHourKey(k) && typeof bits === "string" && BITS_RE.test(bits)) out[String(Number(k))] = bits;
      }
      if (Object.keys(out).length) day.ih[clean] = out;
    }
  }

  if (r.slots && typeof r.slots === "object") {
    for (const [k, v] of Object.entries(r.slots as Record<string, unknown>)) {
      if (!SLOT_KEYS.has(k) || !v || typeof v !== "object") continue;
      const sv = v as Record<string, unknown>;
      const p = finiteNonNegative(sv.p);
      if (p == null) continue;
      day.slots[k] = { p, c: finiteNonNegative(sv.c), s: finiteNonNegative(sv.s) ?? 0 };
    }
  }

  return day;
}

/**
 * Dakikalar birleşir (VEYA). Dilimde öneri en yeni gelen; pişirilen/satılan gün içinde
 * sadece arttığı için büyük olan alınır (geride kalan bir bilgisayar eski değeri yazmasın).
 */
export function mergeBakeryStatsDay(base: BakeryStatsDay | null, add: BakeryStatsDay): BakeryStatsDay {
  const out: BakeryStatsDay = {
    h: { ...(base?.h ?? {}) },
    ih: { ...(base?.ih ?? {}) },
    slots: { ...(base?.slots ?? {}) },
  };
  for (const [k, hv] of Object.entries(add.h)) {
    const prev = out.h[k];
    out.h[k] = prev
      ? { o: orBits(prev.o, hv.o), a: orBits(prev.a, hv.a), q: Math.max(prev.q || 0, hv.q || 0) }
      : { ...hv };
  }
  for (const [name, hours] of Object.entries(add.ih)) {
    const prev = { ...(out.ih[name] ?? {}) };
    for (const [k, bits] of Object.entries(hours)) prev[k] = orBits(prev[k], bits);
    out.ih[name] = prev;
  }
  for (const [k, sv] of Object.entries(add.slots)) {
    const prev = out.slots[k];
    out.slots[k] = prev
      ? {
          p: sv.p,
          c: sv.c == null ? prev.c : prev.c == null ? sv.c : Math.max(prev.c, sv.c),
          s: Math.max(prev.s, sv.s),
        }
      : { ...sv };
  }
  return out;
}

export interface BakeryStatsPush {
  warehouseId: string;
  days: Record<string, BakeryStatsDay>;
}

/** `{ warehouseId, days: { "YYYY-MM-DD": { h, ih, slots } } }` */
export function parseBakeryStatsPush(body: unknown): BakeryStatsPush | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!isBakeryStatsWarehouseId(b.warehouseId)) return null;
  if (!b.days || typeof b.days !== "object") return null;
  const days: Record<string, BakeryStatsDay> = {};
  for (const [ymd, raw] of Object.entries(b.days as Record<string, unknown>).slice(0, MAX_DAYS_PER_PUSH)) {
    if (!isBakeryStatsYmd(ymd)) continue;
    const day = sanitizeBakeryStatsDay(raw);
    if (day && (Object.keys(day.h).length || Object.keys(day.slots).length)) days[ymd] = day;
  }
  if (!Object.keys(days).length) return null;
  return { warehouseId: b.warehouseId.toLowerCase(), days };
}

function ymdToUtc(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDaysYmd(ymd: string, days: number): string {
  return new Date(ymdToUtc(ymd) + days * 86400000).toISOString().slice(0, 10);
}

/** Okuma aralığı geçerli mi; hata mesajı ya da null */
export function validateBakeryStatsRange(from: unknown, to: unknown): string | null {
  if (!isBakeryStatsYmd(from) || !isBakeryStatsYmd(to)) return "Tarihler YYYY-MM-DD biçiminde olmalı.";
  if (from > to) return "Başlangıç bitişten sonra olamaz.";
  if ((ymdToUtc(to) - ymdToUtc(from)) / 86400000 + 1 > BAKERY_STATS_MAX_RANGE_DAYS) {
    return `En fazla ${BAKERY_STATS_MAX_RANGE_DAYS} gün okunabilir.`;
  }
  return null;
}

/**
 * Bayi paneli DPS (`/wps/criteria`) cevabını panelde gösterilecek sade yapıya çevirir.
 * Getir'e ve Firestore'a bağımlı değil.
 */

export type DpsSectionKey = "bayi" | "kurye" | "depocu";

export const DPS_SECTION_LABELS: Record<DpsSectionKey, string> = {
  bayi: "Bayi DPS",
  kurye: "Kurye DPS",
  depocu: "Depocu DPS",
};

const SECTION_SOURCE: Record<DpsSectionKey, string> = {
  bayi: "warehouseDpsPoints",
  kurye: "courierDpsPoints",
  depocu: "pickerDpsPoints",
};

/** Getir'in kriter anahtarı → bayi panelindeki adı */
export const DPS_CRITERION_LABELS: Record<string, string> = {
  RED_BASKET: "Kırmızı Sepet",
  PICKER_ASSIGN_DURATION: "Toplayıcı Bekliyor",
  PROBLEMATIC_ORDER: "Sorunsuz Teslimat",
  COUNTING_PERFORMANCE: "Sayım Performansı",
  BAKERY_PERFORMANCE: "Fırın Bulunurluk",
  NEW_IN_WH_DURATION: "Depo İçi Süre",
  COURIER_DISCIPLINE_INDEX: "Kurye Disiplin İndeksi",
  ACCEPTANCE_OF_GOODS: "Mal Kabul",
  FLEET_AUDITS: "Filo Denetimi",
  QA_AUDITS: "Kalite Denetimi",
};

export interface DpsCriterion {
  key: string;
  label: string;
  /** 0–100 puan */
  point: number | null;
  /** Getir'in "Performans %" kolonu; bazı kriterlerde yok */
  performance: number | null;
  /** Kriter ağırlığı (%) */
  weight: number | null;
}

export interface DpsAudit {
  key: string;
  label: string;
  /** Bölüm puanına doğrudan eklenen puan */
  point: number | null;
  /** Denetimden alınan % (denetim yoksa 0) */
  performance: number | null;
}

/** Bölüm puanı = `performancePoint` (kriterlerin ağırlıklı toplamı) + denetim puanları */
export interface DpsSection {
  point: number | null;
  letterGrade: string | null;
  performancePoint: number | null;
  criteria: DpsCriterion[];
  audits: DpsAudit[];
}

export interface DpsRankEntry {
  name: string;
  rank: number | null;
  /** Bayi DPS puanı */
  point: number | null;
  isUs: boolean;
}

export interface DpsSnapshot {
  bayi: DpsSection;
  kurye: DpsSection;
  depocu: DpsSection;
  /** Sadece sıralamalı istekte; Soğukkuyu'nun sırası */
  rank: number | null;
  /** Sadece sıralamalı istekte; etrafındaki depolar, sıraya göre */
  neighbors: DpsRankEntry[];
}

export type DpsParseResult = { empty: true } | { empty: false; snapshot: DpsSnapshot };

export class DpsParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DpsParseError";
  }
}

type Obj = Record<string, unknown>;

function asObj(v: unknown): Obj | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null;
}

/** Firestore kaydı küçük kalsın; ekranda en fazla 2 basamak gösteriliyor */
function num(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.round(v * 10000) / 10000;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function criterionLabel(key: string): string {
  return DPS_CRITERION_LABELS[key] ?? key;
}

function parseSection(raw: unknown): DpsSection {
  const o = asObj(raw);
  const section: DpsSection = {
    point: num(o?.point),
    letterGrade: str(o?.letterGrade),
    performancePoint: null,
    criteria: [],
    audits: [],
  };
  const criterionPoints = Array.isArray(o?.criterionPoints) ? o.criterionPoints : [];
  for (const c of criterionPoints) {
    const co = asObj(c);
    if (!co) continue;
    const subs = co.subCriterionPoints;
    if (Array.isArray(subs)) {
      // Toplam satırı (TOTAL_75 / COURIER_TOTAL / PICKER_TOTAL): asıl kriterler altında
      section.performancePoint = num(co.criterionPoint);
      for (const s of subs) {
        const so = asObj(s);
        const key = str(so?.subCriterionTranslationKey_75);
        if (!so || !key) continue;
        section.criteria.push({
          key,
          label: criterionLabel(key),
          point: num(so.subCriterionPoint_75),
          performance: num(so.subCriterionPerformancePercentage_75),
          weight: num(so.subCriterionWeight_75),
        });
      }
      continue;
    }
    const key = str(co.criterionTranslationKey);
    if (key) {
      section.audits.push({
        key,
        label: criterionLabel(key),
        point: num(co.criterionPoint),
        performance: num(co.criterionPerformancePercentage),
      });
    }
  }
  return section;
}

/**
 * @param warehouseId Bizim depo; sıralamalı cevapta etraftaki depolardan bununla ayrılır
 * @returns `[]` gelirse `{ empty: true }` (Getir o günü henüz hesaplamamış)
 * @throws DpsParseError Cevap beklenen biçimde değilse veya bizim depo yoksa
 */
export function parseDpsCriteria(json: unknown, warehouseId: string): DpsParseResult {
  if (!Array.isArray(json)) {
    throw new DpsParseError("Getir'den beklenmeyen bir DPS cevabı geldi.");
  }
  if (json.length === 0) return { empty: true };

  const entries = json.map(asObj).filter((o): o is Obj => o != null);
  const ours = entries.find((e) => e.warehouseId === warehouseId);
  if (!ours) {
    throw new DpsParseError("DPS cevabında Soğukkuyu deposu yok.");
  }
  if (!asObj(ours.warehouseDpsPoints) && !asObj(ours.pickerDpsPoints)) {
    throw new DpsParseError("DPS cevabında puan alanları yok. Getir biçimi değiştirmiş olabilir.");
  }

  const neighbors: DpsRankEntry[] =
    entries.length > 1 || ours.currentRank != null
      ? entries
          .map((e) => ({
            name: str(e.warehouseName) ?? "?",
            rank: num(e.currentRank),
            point: num(asObj(e.warehouseDpsPoints)?.point),
            isUs: e.warehouseId === warehouseId,
          }))
          .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
      : [];

  return {
    empty: false,
    snapshot: {
      bayi: parseSection(ours[SECTION_SOURCE.bayi]),
      kurye: parseSection(ours[SECTION_SOURCE.kurye]),
      depocu: parseSection(ours[SECTION_SOURCE.depocu]),
      rank: num(ours.currentRank),
      neighbors,
    },
  };
}

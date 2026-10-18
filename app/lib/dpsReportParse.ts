/**
 * DPS raporu (bayi paneli → Raporlar) "Depo İçi Süre" sayfasını okur.
 * Getir'e bağımlı değil: indirilen .xlsx içeriğini alır, sipariş satırlarını döndürür.
 */
import ExcelJS from "exceljs";
import {
  colorOf,
  normalizePickerName,
  pickerKey,
  type PickerColor,
  type PickerOrderInput,
} from "./pickerStatsMerge";

export { colorOf, normalizePickerName, pickerKey, type PickerColor };

export const DEPO_ICI_SURE_SHEET = "Depo İçi Süre";

const COLUMN = {
  orderId: "sipariş id",
  orderDate: "sipariş tarihi",
  picker: "toplayıcı adı",
  prepareDuration: "prepare_duration",
  estimatedDuration: "tahmini hazırlama süresi",
  ratio: "tahmin uyum performansı",
} as const;

type ColumnKey = keyof typeof COLUMN;

/** Türkiye 2016'dan beri sabit UTC+3 */
const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;

const ORDER_ID_RE = /^[a-f0-9]{24}$/i;

export interface DpsPickerOrder extends PickerOrderInput {
  /** İstanbul takvim günü (YYYY-MM-DD) */
  orderDate: string;
  /** Siparişin gerçek anı (UTC ISO) */
  orderedAt: string;
  /** Rapordaki yazımla, boşlukları sadeleştirilmiş */
  pickerName: string;
}

export interface DpsSkippedCounts {
  missingOrderId: number;
  missingPicker: number;
  badDate: number;
  badDuration: number;
}

export interface DepoIciSureResult {
  orders: DpsPickerOrder[];
  skipped: DpsSkippedCounts;
  /** Getir sayfaya başlık yerine "There is no record for a given dates." yazmış */
  noRecords: boolean;
}

const NO_RECORD_RE = /there is no record/i;

export class DpsReportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DpsReportParseError";
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Excel'deki tarih saat dilimsiz İstanbul saati; exceljs bunu UTC sanıyor.
 * Bu yüzden UTC alanları doğrudan İstanbul duvar saatidir.
 */
function istanbulWallClock(value: unknown): { ymd: string; instantIso: string } | null {
  let wall: Date | null = null;
  if (value instanceof Date) {
    wall = value;
  } else if (typeof value === "string") {
    const m = value
      .trim()
      .match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/);
    if (m) {
      const ms = m[7] ? Number(m[7].slice(0, 3).padEnd(3, "0")) : 0;
      wall = new Date(
        Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0, ms)
      );
    }
  }
  if (!wall || Number.isNaN(wall.getTime())) return null;
  const ymd = `${wall.getUTCFullYear()}-${pad2(wall.getUTCMonth() + 1)}-${pad2(wall.getUTCDate())}`;
  return { ymd, instantIso: new Date(wall.getTime() - ISTANBUL_OFFSET_MS).toISOString() };
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && "richText" in value) {
    const parts = (value as { richText?: { text?: string }[] }).richText ?? [];
    return parts.map((p) => p.text ?? "").join("");
  }
  if (typeof value === "object" && "result" in value) {
    return cellText((value as { result?: unknown }).result);
  }
  return String(value);
}

function cellNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value && typeof value === "object" && "result" in value) {
    return cellNumber((value as { result?: unknown }).result);
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Başlık satırı + veri satırlarından sipariş listesi çıkarır.
 * Kolonlar sıraya göre değil başlık adına göre bulunur.
 */
export function ordersFromRows(header: unknown[], rows: unknown[][]): DepoIciSureResult {
  const emptySkipped: DpsSkippedCounts = {
    missingOrderId: 0,
    missingPicker: 0,
    badDate: 0,
    badDuration: 0,
  };
  // Getir veri yokken başlık yerine `0` ve bir uyarı satırı yazıyor
  if ([header, ...rows.slice(0, 2)].some((r) => r.some((c) => NO_RECORD_RE.test(cellText(c))))) {
    return { orders: [], skipped: emptySkipped, noRecords: true };
  }

  const index = {} as Record<ColumnKey, number>;
  const missing: string[] = [];
  const normalizedHeader = header.map((h) => cellText(h).trim().toLocaleLowerCase("tr-TR"));
  for (const key of Object.keys(COLUMN) as ColumnKey[]) {
    const i = normalizedHeader.indexOf(COLUMN[key]);
    if (i === -1 && key !== "ratio") missing.push(COLUMN[key]);
    index[key] = i;
  }
  if (missing.length > 0) {
    throw new DpsReportParseError(
      `"${DEPO_ICI_SURE_SHEET}" sayfasında beklenen kolonlar yok: ${missing.join(", ")}. Getir rapor biçimini değiştirmiş olabilir.`
    );
  }

  const skipped = emptySkipped;
  const byId = new Map<string, DpsPickerOrder>();

  for (const row of rows) {
    const orderId = cellText(row[index.orderId]).trim();
    if (!ORDER_ID_RE.test(orderId)) {
      skipped.missingOrderId++;
      continue;
    }
    const pickerName = normalizePickerName(cellText(row[index.picker]));
    if (!pickerName) {
      skipped.missingPicker++;
      continue;
    }
    const when = istanbulWallClock(row[index.orderDate]);
    if (!when) {
      skipped.badDate++;
      continue;
    }
    const prepareDuration = cellNumber(row[index.prepareDuration]);
    const estimatedDuration = cellNumber(row[index.estimatedDuration]);
    if (prepareDuration == null || estimatedDuration == null || estimatedDuration <= 0) {
      skipped.badDuration++;
      continue;
    }
    const reportedRatio = index.ratio >= 0 ? cellNumber(row[index.ratio]) : null;
    const ratio = reportedRatio ?? prepareDuration / estimatedDuration;

    byId.set(orderId, {
      orderId,
      orderDate: when.ymd,
      orderedAt: when.instantIso,
      pickerName,
      pickerKey: pickerKey(pickerName),
      prepareDuration,
      estimatedDuration,
      ratio,
      color: colorOf(ratio),
    });
  }

  return { orders: [...byId.values()], skipped, noRecords: false };
}

/** İndirilen DPS raporu (.xlsx) içeriğinden "Depo İçi Süre" siparişlerini okur. */
export async function parseDepoIciSure(content: ArrayBuffer | Uint8Array): Promise<DepoIciSureResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  } catch {
    throw new DpsReportParseError("Rapor dosyası okunamadı (geçerli bir Excel dosyası değil).");
  }

  const sheet = workbook.worksheets.find(
    (ws) => ws.name.trim().toLocaleLowerCase("tr-TR") === DEPO_ICI_SURE_SHEET.toLocaleLowerCase("tr-TR")
  );
  if (!sheet) {
    throw new DpsReportParseError(
      `Raporda "${DEPO_ICI_SURE_SHEET}" sayfası yok. Sayfalar: ${workbook.worksheets.map((ws) => ws.name).join(", ")}`
    );
  }

  const rowValues = (r: number): unknown[] => {
    const values = sheet.getRow(r).values;
    // exceljs satır değerleri 1'den başlar; 0. eleman boş
    return Array.isArray(values) ? values.slice(1) : [];
  };

  const header = rowValues(1);
  const rows: unknown[][] = [];
  for (let r = 2; r <= sheet.rowCount; r++) rows.push(rowValues(r));
  return ordersFromRows(header, rows);
}

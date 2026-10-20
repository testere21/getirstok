/**
 * Bayi paneli → Performans & Takip → Toplayıcı Performansı isteği (`/picker/v2/metrics`).
 * Metrik grubu ve toplayıcı filtresi boş bırakılır: verilen depolarda o aralıkta çalışan
 * tüm toplayıcılar, tüm metrikleriyle gelir. Cevapta depo bilgisi yok.
 */
import { gatewayJson } from "./getirDpsReportService";
import { FRANCHISE_WAREHOUSE_IDS } from "./franchiseWarehouses";
import {
  assignPickerWarehouses,
  parsePickerMetrics,
  parsePickerOrderCounts,
  type PickerMetrics,
} from "./pickerMetrics";

const METRICS_URL = "https://franchise-api-gateway.getirapi.com/picker/v2/metrics";
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

/** Bayi panelinin gönderdiği biçimde (gün başı/sonu `Z` ekiyle); panelle aynı sayılar çıksın */
async function fetchMetricsPages(
  from: string,
  to: string,
  warehouseIds: readonly string[],
  token: string,
  onPage: (json: unknown) => number
): Promise<void> {
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const json = await gatewayJson(
      METRICS_URL,
      {
        method: "POST",
        body: JSON.stringify({
          startDate: `${from}T00:00:00.000Z`,
          endDate: `${to}T23:59:59.999Z`,
          limit: PAGE_SIZE,
          offset,
          // Alanlar yoksa Getir 400 döner; boş liste = hepsi
          metricGroups: [],
          pickerIds: [],
          warehouseIds,
        }),
      },
      token
    );
    const rows = onPage(json);
    const total = (json as { total_count?: unknown } | null)?.total_count;
    offset += rows;
    if (rows === 0 || offset >= (typeof total === "number" ? total : offset)) break;
  }
}

/**
 * Aralığın toplayıcı başına metrikleri, bayinin tüm depoları birlikte.
 * @returns pickerKey → metrikler
 */
export async function fetchPickerMetrics(
  from: string,
  to: string,
  token: string
): Promise<Record<string, PickerMetrics>> {
  const pickers: Record<string, PickerMetrics> = {};
  await fetchMetricsPages(from, to, FRANCHISE_WAREHOUSE_IDS, token, (json) => {
    const parsed = parsePickerMetrics(json);
    Object.assign(pickers, parsed.pickers);
    return parsed.rows;
  });
  return pickers;
}

/**
 * Hangi toplayıcının hangi depoda çalıştığını bulur: her depo için ayrı istek, toplayıcı
 * en çok sipariş topladığı depoya atanır.
 * @returns pickerKey → { ad, depo }
 */
export async function fetchPickerWarehouseAssignments(
  from: string,
  to: string,
  token: string
): Promise<Map<string, { name: string; warehouseId: string }>> {
  const counts = new Map<string, Record<string, { name: string; orders: number }>>();
  await Promise.all(
    FRANCHISE_WAREHOUSE_IDS.map(async (warehouseId) => {
      const perWarehouse: Record<string, { name: string; orders: number }> = {};
      await fetchMetricsPages(from, to, [warehouseId], token, (json) => {
        Object.assign(perWarehouse, parsePickerOrderCounts(json));
        const data = (json as { data?: unknown } | null)?.data;
        return Array.isArray(data) ? data.length : 0;
      });
      counts.set(warehouseId, perWarehouse);
    })
  );
  return assignPickerWarehouses(counts);
}

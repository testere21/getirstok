/**
 * Bayi paneli → Performans & Takip → Toplayıcı Performansı isteği (`/picker/v2/metrics`).
 * Metrik grubu ve toplayıcı filtresi boş bırakılır: Soğukkuyu'nun o aralıkta çalışan tüm
 * toplayıcıları, tüm metrikleriyle gelir.
 */
import { gatewayJson } from "./getirDpsReportService";
import { parsePickerMetrics, type PickerMetrics } from "./pickerMetrics";
import { FRANCHISE_WAREHOUSE_ID_SOGUKKUYU } from "./types";

const METRICS_URL = "https://franchise-api-gateway.getirapi.com/picker/v2/metrics";
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

/**
 * Aralığın toplayıcı başına metrikleri. Tarih, bayi panelinin gönderdiği biçimde
 * (gün başı/sonu `Z` ekiyle) gider; panelde görülen sayılarla aynı çıksın diye.
 * @returns pickerKey → metrikler
 */
export async function fetchPickerMetrics(
  from: string,
  to: string,
  token: string
): Promise<Record<string, PickerMetrics>> {
  const pickers: Record<string, PickerMetrics> = {};
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
          warehouseIds: [FRANCHISE_WAREHOUSE_ID_SOGUKKUYU],
        }),
      },
      token
    );
    const parsed = parsePickerMetrics(json);
    Object.assign(pickers, parsed.pickers);
    offset += parsed.rows;
    if (parsed.rows === 0 || offset >= parsed.totalCount) break;
  }
  return pickers;
}

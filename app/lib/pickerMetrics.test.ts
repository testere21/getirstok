import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampMetricsRange,
  isPickerMetricsFinal,
  needsMetricsFetch,
  parsePickerMetrics,
  pickerMetricsRetentionCutoff,
} from "./pickerMetrics";
import { pickerKey } from "./pickerStatsMerge";

/** Bayi panelindeki 01–17.10 cevabının kısaltılmışı (sayılar metin olarak geliyor) */
const SAMPLE = {
  total_count: 2,
  data: [
    {
      id: "63c50ada9b24f9cd93a8a1f2",
      name: "Ferruh Melik Camgözoğlu",
      total_order_count: 826,
      total_order_sku_count: 4421,
      problematic_order_count: 14,
      avg_rating: "4.3",
      missing_order_ratio: "0.0%",
    },
    { id: "x", name: "Hüseyin Sarikaya", total_order_sku_count: 355, problematic_order_count: 0, avg_rating: "0.0" },
  ],
};

test("parsePickerMetrics: SKU, problemli, yıldız; 'Sarikaya' listedeki 'Sarıkaya' ile eşleşir", () => {
  const page = parsePickerMetrics(SAMPLE);
  assert.equal(page.totalCount, 2);
  assert.equal(page.rows, 2);
  assert.deepEqual(page.pickers, {
    [pickerKey("Ferruh Melik Camgözoğlu")]: { sku: 4421, problematic: 14, rating: 4.3 },
    // Puanı olmayan (0.0) boş sayılır
    [pickerKey("Hüseyin Sarıkaya")]: { sku: 355, problematic: 0, rating: null },
  });
});

test("parsePickerMetrics: eksik alanlar 0/boş, isimsiz satır ve bozuk cevap atlanır", () => {
  const page = parsePickerMetrics({ data: [{ name: "Baran Özgün" }, { name: "", total_order_sku_count: 5 }] });
  assert.deepEqual(page.pickers, { [pickerKey("Baran Özgün")]: { sku: 0, problematic: 0, rating: null } });
  assert.deepEqual(parsePickerMetrics(null), { pickers: {}, rows: 0, totalCount: 0 });
});

test("isPickerMetricsFinal: bitişten 2 gün sonra (İstanbul) çekilen kayıt kesin", () => {
  // 16.10 23:30 İstanbul = 20:30Z
  assert.equal(isPickerMetricsFinal("2026-10-15", "2026-10-16T20:30:00.000Z"), false);
  // 17.10 00:30 İstanbul = 16.10 21:30Z
  assert.equal(isPickerMetricsFinal("2026-10-15", "2026-10-16T21:30:00.000Z"), true);
  assert.equal(isPickerMetricsFinal("2026-10-15", ""), false);
});

test("needsMetricsFetch: kayıt yoksa çek; kayıtlı kesinleşmemiş gün sadece Güncelle'de", () => {
  const fresh = { fetchedAt: "2026-10-18T23:00:00.000Z" }; // 19.10 02:00 İstanbul
  const final = { fetchedAt: "2026-10-18T08:00:00.000Z" }; // 18.10 — 16.10 için kesin
  assert.equal(needsMetricsFetch(null, "2026-10-18", null), true);
  // Panel açılışı (refreshSince yok): kayıt varsa Getir'e gidilmez
  assert.equal(needsMetricsFetch(fresh, "2026-10-18", null), false);
  // Güncelle: basılmadan önce çekilmiş, kesinleşmemiş kayıt yenilenir
  assert.equal(needsMetricsFetch(fresh, "2026-10-18", "2026-10-18T23:10:00.000Z"), true);
  // Aynı Güncelle turunda yeniden çekilmiş kayıt tekrar çekilmez
  assert.equal(needsMetricsFetch(fresh, "2026-10-18", "2026-10-18T22:50:00.000Z"), false);
  // Kesinleşmiş kayıt Güncelle'de de çekilmez
  assert.equal(needsMetricsFetch(final, "2026-10-16", "2026-10-18T23:10:00.000Z"), false);
});

test("clampMetricsRange: bugünü aşan aralık bugüne kırpılır", () => {
  assert.deepEqual(clampMetricsRange({ from: "2026-10-18", to: "2026-10-25" }, "2026-10-19"), {
    from: "2026-10-18",
    to: "2026-10-19",
  });
  assert.deepEqual(clampMetricsRange({ from: "2026-10-21", to: "2026-10-25" }, "2026-10-19"), {
    from: "2026-10-19",
    to: "2026-10-19",
  });
});

test("pickerMetricsRetentionCutoff: 5 ay öncesi", () => {
  assert.equal(pickerMetricsRetentionCutoff("2026-10-19"), "2026-05-19");
});

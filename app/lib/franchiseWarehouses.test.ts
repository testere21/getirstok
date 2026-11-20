import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BOSTANLI_WAREHOUSE_ID,
  DEFAULT_PANEL_WAREHOUSE_ID,
  FRANCHISE_WAREHOUSE_IDS,
  SOGUKKUYU_WAREHOUSE_ID,
  isFranchiseWarehouseId,
  normalizeWarehouseId,
  requireExplicitWarehouseId,
  resolvePanelWarehouseId,
  warehouseLabelPrefix,
  warehouseName,
} from "./franchiseWarehouses";
import { ACTIVE_WAREHOUSE_TOKEN_DOC_ID, warehouseTokenDocId } from "./types";

const ULUPARK = "60b4d307df4c67250e096bfb";

test("depo listesi: yalnızca Soğukkuyu ve Bostanlı", () => {
  assert.deepEqual([...FRANCHISE_WAREHOUSE_IDS], [SOGUKKUYU_WAREHOUSE_ID, BOSTANLI_WAREHOUSE_ID]);
  assert.equal(isFranchiseWarehouseId(ULUPARK), false);
  assert.equal(warehouseName(SOGUKKUYU_WAREHOUSE_ID), "Soğukkuyu");
  assert.equal(warehouseName(BOSTANLI_WAREHOUSE_ID), "Bostanlı");
  assert.equal(warehouseName(ULUPARK), "Bilinmeyen depo");
});

test("normalizeWarehouseId: geçersiz/eski değer varsayılan depoya düşer", () => {
  assert.equal(DEFAULT_PANEL_WAREHOUSE_ID, SOGUKKUYU_WAREHOUSE_ID);
  assert.equal(normalizeWarehouseId(BOSTANLI_WAREHOUSE_ID), BOSTANLI_WAREHOUSE_ID);
  assert.equal(normalizeWarehouseId(ULUPARK), SOGUKKUYU_WAREHOUSE_ID);
  assert.equal(normalizeWarehouseId("all"), SOGUKKUYU_WAREHOUSE_ID);
  assert.equal(normalizeWarehouseId(null), SOGUKKUYU_WAREHOUSE_ID);
  assert.equal(normalizeWarehouseId(undefined), SOGUKKUYU_WAREHOUSE_ID);
  assert.equal(normalizeWarehouseId(42), SOGUKKUYU_WAREHOUSE_ID);
});

test("resolvePanelWarehouseId: boş istek Soğukkuyu, tanınmayan depo reddedilir", () => {
  assert.equal(resolvePanelWarehouseId(undefined), SOGUKKUYU_WAREHOUSE_ID);
  assert.equal(resolvePanelWarehouseId(null), SOGUKKUYU_WAREHOUSE_ID);
  assert.equal(resolvePanelWarehouseId(""), SOGUKKUYU_WAREHOUSE_ID);
  assert.equal(resolvePanelWarehouseId(SOGUKKUYU_WAREHOUSE_ID), SOGUKKUYU_WAREHOUSE_ID);
  assert.equal(resolvePanelWarehouseId(BOSTANLI_WAREHOUSE_ID), BOSTANLI_WAREHOUSE_ID);
  // yazım hatası / Ulupark / başka tür: sessizce Soğukkuyu'ya düşmemeli
  assert.equal(resolvePanelWarehouseId(ULUPARK), null);
  assert.equal(resolvePanelWarehouseId("123"), null);
  assert.equal(resolvePanelWarehouseId(42), null);
});

test("requireExplicitWarehouseId: depo verilmezse Soğukkuyu'ya düşmez", () => {
  assert.equal(requireExplicitWarehouseId(undefined), null);
  assert.equal(requireExplicitWarehouseId(null), null);
  assert.equal(requireExplicitWarehouseId(""), null);
  assert.equal(requireExplicitWarehouseId(ULUPARK), null);
  assert.equal(requireExplicitWarehouseId(42), null);
  assert.equal(requireExplicitWarehouseId(SOGUKKUYU_WAREHOUSE_ID), SOGUKKUYU_WAREHOUSE_ID);
  assert.equal(requireExplicitWarehouseId(BOSTANLI_WAREHOUSE_ID), BOSTANLI_WAREHOUSE_ID);
});

test("warehouseTokenDocId: depo başına ayrı kayıt, eski tek kayıttan farklı", () => {
  assert.equal(warehouseTokenDocId(BOSTANLI_WAREHOUSE_ID), `active_warehouse_${BOSTANLI_WAREHOUSE_ID}`);
  assert.notEqual(warehouseTokenDocId(SOGUKKUYU_WAREHOUSE_ID), warehouseTokenDocId(BOSTANLI_WAREHOUSE_ID));
  assert.notEqual(warehouseTokenDocId(SOGUKKUYU_WAREHOUSE_ID), ACTIVE_WAREHOUSE_TOKEN_DOC_ID);
});

test("warehouseLabelPrefix: Soğukkuyu mesajı değişmez, Bostanlı etiketlenir", () => {
  assert.equal(warehouseLabelPrefix(SOGUKKUYU_WAREHOUSE_ID), "");
  assert.equal(warehouseLabelPrefix(undefined), "");
  assert.equal(warehouseLabelPrefix(ULUPARK), "");
  assert.equal(warehouseLabelPrefix(BOSTANLI_WAREHOUSE_ID), "📍 Depo: Bostanlı\n");
});

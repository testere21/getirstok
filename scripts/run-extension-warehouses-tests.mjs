// chrome-extension/warehouses.js (depo tablosu + özellik bayrakları) testleri
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const W = require(join(root, "chrome-extension", "warehouses.js"));

const SOG = "6113e59fbb8549d0f20e65f5";
const BOS = "5dc32dc9734a192200caddfb";
const ULUPARK = "60b4d307df4c67250e096bfb";

test("depo kimlikleri panelin depo tablosuyla aynı", () => {
  const src = readFileSync(join(root, "app", "lib", "franchiseWarehouses.ts"), "utf8");
  assert.ok(src.includes(SOG), "Soğukkuyu kimliği panel tablosunda yok");
  assert.ok(src.includes(BOS), "Bostanlı kimliği panel tablosunda yok");
  assert.equal(W.SOGUKKUYU_ID, SOG);
  assert.equal(W.BOSTANLI_ID, BOS);
  assert.deepEqual(Object.keys(W.WAREHOUSES).sort(), [BOS, SOG].sort());
});

test("depo adresten algılanır", () => {
  assert.equal(W.warehouseIdFromPath(`/r/${BOS}/stock/stock-management/product/list`), BOS);
  assert.equal(W.warehouseIdFromPath(`/r/${SOG.toUpperCase()}`), SOG);
  assert.equal(W.warehouseIdFromPath("/login"), null);
  assert.equal(W.warehouseIdFromPath("/r/123/xyz"), null);
  assert.equal(W.warehouseIdFromPageUrl(`https://warehouse.getir.com/r/${SOG}/dashboard`), SOG);
  assert.equal(W.warehouseIdFromPageUrl("not a url"), null);
  assert.equal(
    W.warehouseIdFromGatewayUrl(`https://warehouse-panel-api-gateway.getirapi.com/warehouse/${BOS}/products?x=1`),
    BOS
  );
  assert.equal(W.warehouseIdFromGatewayUrl("https://warehouse-panel-api-gateway.getirapi.com/heating-estimations"), null);
});

test("Soğukkuyu'da bütün özellikler açık (eski eklentiyle aynı)", () => {
  const f = W.featuresFor(SOG);
  for (const name of W.FEATURE_NAMES) assert.equal(f[name], true, name);
});

test("Bostanlı'da barkod, toplama ve SKT stoğu kapalı; görünüm, fırın, token ve sevkiyat açık", () => {
  const f = W.featuresFor(BOS);
  assert.equal(f.barcodeSearch, false);
  assert.equal(f.picking, false);
  assert.equal(f.expiryStock, false);
  for (const name of ["layout", "boardSearch", "bakery", "bakeryStats", "tokenSync", "transferCapture"]) {
    assert.equal(f[name], true, name);
  }
});

test("bilinmeyen ya da algılanamayan depoda yalnızca temel özellikler", () => {
  for (const id of [null, undefined, "", "abc", ULUPARK]) {
    const f = W.featuresFor(id);
    assert.deepEqual(
      Object.keys(f).filter((k) => f[k]),
      ["layout"],
      String(id)
    );
  }
  // Seçim yapılsa bile tabloda olmayan depo temel kalır
  assert.equal(W.featuresFor(ULUPARK, { [ULUPARK]: { tokenSync: true } }).tokenSync, false);
});

test("kullanıcı seçimi depo varsayılanını ezer; seçilmeyen özellik varsayılanda kalır", () => {
  const overrides = { [BOS]: { barcodeSearch: true, bakery: false, picking: "evet" } };
  const f = W.featuresFor(BOS, overrides);
  assert.equal(f.barcodeSearch, true);
  assert.equal(f.bakery, false);
  assert.equal(f.picking, false, "boolean olmayan değer yok sayılır");
  assert.equal(f.tokenSync, true);
  // Bir deponun seçimi öbürünü etkilemez
  assert.equal(W.featuresFor(SOG, overrides).bakery, true);
  assert.equal(W.featureEnabled(BOS, "barcodeSearch", overrides), true);
});

test("tanınan her depo özelleştirilebilir; tanınmayan depo değil", () => {
  assert.equal(W.isEditableWarehouse(SOG), true);
  assert.equal(W.isEditableWarehouse(BOS), true);
  assert.equal(W.isEditableWarehouse(ULUPARK), false);
  const overrides = { [SOG]: { bakery: false, barcodeSearch: false } };
  const f = W.featuresFor(SOG, overrides);
  assert.equal(f.bakery, false);
  assert.equal(f.barcodeSearch, false);
  assert.equal(f.layout, true);
  assert.equal(W.featureEnabled(SOG, "bakery", overrides), false);
});

test("kritik özellikler (token, sevkiyat, fırın istatistiği) kilitli: seçim yok sayılır, listede yok", () => {
  assert.deepEqual([...W.LOCKED_FEATURES].sort(), ["bakeryStats", "tokenSync", "transferCapture"]);
  for (const name of W.LOCKED_FEATURES) assert.ok(!W.EDITABLE_FEATURE_NAMES.includes(name), name);
  assert.deepEqual(
    [...W.EDITABLE_FEATURE_NAMES, ...W.LOCKED_FEATURES].sort(),
    [...W.FEATURE_NAMES].sort()
  );
  for (const id of [SOG, BOS]) {
    const overrides = { [id]: { tokenSync: false, transferCapture: false, bakeryStats: false, bakery: false } };
    const f = W.featuresFor(id, overrides);
    assert.equal(f.tokenSync, true, id);
    assert.equal(f.transferCapture, true, id);
    assert.equal(f.bakeryStats, true, id);
    assert.equal(f.bakery, false, "kilitsiz özellik seçimi geçerli");
  }
});

test("seçimler depoya özel: bir deponun seçimi öbürünü etkilemez", () => {
  const overrides = { [SOG]: { bakery: false }, [BOS]: { barcodeSearch: true } };
  assert.equal(W.featuresFor(SOG, overrides).bakery, false);
  assert.equal(W.featuresFor(BOS, overrides).bakery, true);
  assert.equal(W.featuresFor(BOS, overrides).barcodeSearch, true);
  assert.equal(W.featuresFor(SOG, overrides).barcodeSearch, true);
});

test("sayfa görünümleri: varsayılan yeni; tanınan depoda ve izin verilen modlarda değişir", () => {
  const views = {
    [BOS]: { removal: "old", expiration: "hidden", sidebar: "hidden", board: "old", returns: "bilinmeyen" },
    [SOG]: { removal: "old", expiration: "hidden" },
  };
  assert.equal(W.pageViewFor(BOS, "removal", {}), "new");
  assert.equal(W.pageViewFor(BOS, "removal", views), "old");
  assert.equal(W.pageViewFor(BOS, "expiration", views), "hidden");
  assert.equal(W.pageViewFor(BOS, "sidebar", views), "new", "bu bölüm gizlenemez");
  assert.equal(W.pageViewFor(BOS, "board", views), "old");
  assert.equal(W.pageViewFor(BOS, "returns", views), "new", "geçersiz mod yok sayılır");
  assert.equal(W.pageViewFor(BOS, "yok", views), "new");
  assert.equal(W.pageViewFor(SOG, "removal", views), "old", "Soğukkuyu da değiştirilebilir");
  assert.equal(W.pageViewFor(SOG, "expiration", views), "hidden");
  assert.equal(W.pageViewFor(ULUPARK, "removal", views), "new");
  assert.equal(W.pageViewFor(null, "removal", views), "new");
  const keys = W.PAGE_VIEWS.map((p) => p.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const p of W.PAGE_VIEWS) {
    assert.ok(p.modes.includes("new") && p.modes.includes("old"));
    assert.ok(p.modes.every((m) => W.VIEW_MODES.includes(m)));
  }
});

test("depo adları", () => {
  assert.equal(W.warehouseName(SOG), "Soğukkuyu");
  assert.equal(W.warehouseName(BOS), "Bostanlı");
  assert.equal(W.warehouseName(ULUPARK), null);
  assert.equal(W.isKnownWarehouse(ULUPARK), false);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  INITIAL_PICKER_NAMES,
  aggregatePickerStats,
  pickerWarehouseId,
  groupByDay,
  sortPickerStats,
  type PickerEntry,
  pickerKey,
  planDayUpdates,
  selectReportOrders,
  toStoredOrder,
  type PickerOrderInput,
  type StoredPickerOrder,
} from "./pickerStatsMerge";

function order(
  orderId: string,
  pickerName: string,
  orderDate = "2026-10-15",
  prepare = 30,
  estimated = 60
): PickerOrderInput {
  const ratio = prepare / estimated;
  return {
    orderId,
    orderDate,
    pickerName,
    pickerKey: pickerKey(pickerName),
    prepareDuration: prepare,
    estimatedDuration: estimated,
    ratio,
    color: ratio <= 1 ? "green" : "red",
  };
}

const OLD = "2026-10-13T10:00:00.000Z";
const NEW = "2026-10-17T10:00:00.000Z";

test("başlangıç listesi rapordaki yazımla eşleşir", () => {
  const keys = new Set(INITIAL_PICKER_NAMES.map(pickerKey));
  assert.ok(keys.has(pickerKey("Hüseyin Sarikaya")));
  assert.ok(keys.has(pickerKey("Ferruh Melik Camgözoğlu")));
  assert.equal(keys.size, 4);
});

test("toStoredOrder: renk orandan ayrı saklanır, yuvarlama rengi değiştirmez", () => {
  const o = { ...order("a", "Baran Özgün"), ratio: 0.9999999, color: "green" as const };
  const stored = toStoredOrder(o, "rep1", OLD);
  assert.equal(stored.r, 1);
  assert.equal(stored.c, "g");
  assert.equal(stored.p, "baran ozgun");
});

const SOG = "6113e59fbb8549d0f20e65f5";
const BOS = "5dc32dc9734a192200caddfb";

test("selectReportOrders: tek depolu raporda hepsi o depoya, yeni isim o depoyla önerilir", () => {
  const known = new Map([[pickerKey("Baran Özgün"), SOG]]);
  const { byWarehouse, newPickers, unassigned } = selectReportOrders(
    [order("a", "Baran Özgün"), order("b", "Yeni Kişi"), order("c", "YENİ  KİŞİ")],
    { reportWarehouseId: BOS, pickerWarehouses: known }
  );
  assert.deepEqual([...byWarehouse.keys()], [BOS]);
  assert.equal(byWarehouse.get(BOS)?.length, 3);
  assert.deepEqual(newPickers, [{ key: "yeni kisi", name: "Yeni Kişi", warehouseId: BOS }]);
  assert.deepEqual(unassigned, []);
});

test("selectReportOrders: çok depolu raporda toplayıcının deposuna, bilinmeyen ayrı", () => {
  const known = new Map([
    [pickerKey("Hüseyin Sarıkaya"), SOG],
    [pickerKey("Özge Turhan"), BOS],
  ]);
  const { byWarehouse, newPickers, unassigned } = selectReportOrders(
    [order("a", "Hüseyin Sarikaya"), order("b", "Özge Turhan"), order("c", "Bilinmeyen Kişi")],
    { reportWarehouseId: null, pickerWarehouses: known }
  );
  assert.deepEqual(byWarehouse.get(SOG)?.map((o) => o.orderId), ["a"]);
  assert.deepEqual(byWarehouse.get(BOS)?.map((o) => o.orderId), ["b"]);
  assert.deepEqual(unassigned.map((o) => o.orderId), ["c"]);
  assert.deepEqual(newPickers, []);
});

test("pickerWarehouseId: deposu yazılmamış eski kayıt Soğukkuyu", () => {
  assert.equal(pickerWarehouseId({}), SOG);
  assert.equal(pickerWarehouseId({ warehouseId: BOS }), BOS);
});

test("groupByDay: siparişler İstanbul gününe göre ayrılır", () => {
  const days = groupByDay([
    order("a", "X", "2026-10-14"),
    order("b", "X", "2026-10-15"),
    order("c", "X", "2026-10-15"),
  ]);
  assert.deepEqual([...days.keys()], ["2026-10-14", "2026-10-15"]);
  assert.equal(days.get("2026-10-15")?.length, 2);
});

function stored(o: PickerOrderInput, rc: string, rep = "rep"): StoredPickerOrder {
  return toStoredOrder(o, rep, rc);
}

test("planDayUpdates: yeni sipariş yazılır, aynısı tekrar gelince yazılmaz", () => {
  const a = order("a", "Baran Özgün");
  const first = planDayUpdates(undefined, { a: stored(a, OLD) });
  assert.deepEqual(Object.keys(first), ["a"]);
  // Üst üste binen ikinci rapor aynı siparişi getirdi: değişiklik yok, yazma yok
  const again = planDayUpdates(first, { a: stored(a, NEW, "rep2") });
  assert.deepEqual(again, {});
});

test("planDayUpdates: daha yeni rapor farklı değerle gelirse güncellenir", () => {
  const before = { a: stored(order("a", "Baran Özgün", "2026-10-15", 30, 60), OLD) };
  const after = planDayUpdates(before, { a: stored(order("a", "Baran Özgün", "2026-10-15", 70, 60), NEW) });
  assert.equal(after.a.d, 70);
  assert.equal(after.a.c, "r");
});

function picker(name: string, active = true): [string, PickerEntry] {
  return [pickerKey(name), { name, active, source: "manual", firstSeenAt: OLD }];
}

test("aggregatePickerStats: günler toplanır, siparişsiz aktif 0 ile görünür, pasif gizli", () => {
  const pickers = Object.fromEntries([
    picker("Baran Özgün"),
    picker("Ferhat Kortak"),
    picker("Eski Eleman", false),
  ]);
  const day1 = {
    a: stored(order("a", "Baran Özgün", "2026-10-15", 30, 60), OLD),
    b: stored(order("b", "Baran Özgün", "2026-10-15", 60, 60), OLD),
    c: stored(order("c", "Eski Eleman", "2026-10-15", 10, 60), OLD),
  };
  const day2 = { d: stored(order("d", "Baran Özgün", "2026-10-16", 90, 60), OLD) };

  const rows = aggregatePickerStats([day1, day2], pickers);
  const baran = rows.find((r) => r.name === "Baran Özgün");
  // 30/60 ve tam 60/60 yeşil, 90/60 kırmızı
  assert.deepEqual(
    { total: baran?.total, green: baran?.green, red: baran?.red },
    { total: 3, green: 2, red: 1 }
  );
  assert.ok(Math.abs((baran?.greenRate ?? 0) - 2 / 3) < 1e-9);
  assert.ok(Math.abs((baran?.avgRatio ?? 0) - (0.5 + 1 + 1.5) / 3) < 1e-9);
  const ferhat = rows.find((r) => r.name === "Ferhat Kortak");
  assert.equal(ferhat?.total, 0);
  assert.equal(ferhat?.greenRate, null);
  assert.equal(rows.some((r) => r.name === "Eski Eleman"), false);

  const withInactive = aggregatePickerStats([day1], pickers, { includeInactive: true });
  assert.equal(withInactive.find((r) => r.name === "Eski Eleman")?.total, 1);
});

test("aggregatePickerStats: depo filtresi sadece o deponun toplayıcılarını listeler", () => {
  const pickers = {
    ...Object.fromEntries([picker("Baran Özgün")]),
    [pickerKey("Özge Turhan")]: { name: "Özge Turhan", active: true, source: "auto" as const, firstSeenAt: OLD, warehouseId: BOS },
  };
  const bos = aggregatePickerStats([], pickers, { warehouseIds: new Set([BOS]) });
  assert.deepEqual(bos.map((r) => [r.name, r.warehouseId]), [["Özge Turhan", BOS]]);
  const all = aggregatePickerStats([], pickers);
  assert.equal(all.length, 2);
  assert.equal(all.find((r) => r.name === "Baran Özgün")?.warehouseId, SOG);
});

test("aggregatePickerStats: günlük SKU/problemli toplanır, yıldız aralıktan gelir", () => {
  const pickers = Object.fromEntries([picker("Baran Özgün"), picker("Ferhat Kortak")]);
  const metricDays = [
    {
      [pickerKey("Ferhat Kortak")]: { sku: 230, problematic: 2 },
      [pickerKey("Yabancı")]: { sku: 99, problematic: 1 },
    },
    { [pickerKey("Ferhat Kortak")]: { sku: 429, problematic: 3 } },
  ];
  const ratings = { [pickerKey("Ferhat Kortak")]: 4.3, [pickerKey("Yabancı")]: 5 };
  const rows = aggregatePickerStats([], pickers, { metricDays, ratings });
  const ferhat = rows.find((r) => r.name === "Ferhat Kortak");
  assert.deepEqual(
    { sku: ferhat?.sku, problematic: ferhat?.problematic, rating: ferhat?.rating },
    { sku: 659, problematic: 5, rating: 4.3 }
  );
  const baran = rows.find((r) => r.name === "Baran Özgün");
  assert.deepEqual(
    { sku: baran?.sku, problematic: baran?.problematic, rating: baran?.rating, total: baran?.total },
    { sku: 0, problematic: 0, rating: null, total: 0 }
  );
  assert.equal(rows.length, 2);
});

test("sortPickerStats: sipariş, yeşil, kırmızı, yüzde; iki yön", () => {
  const rows = [
    { key: "a", name: "Ali", active: true, warehouseId: SOG, total: 10, green: 8, red: 2, greenRate: 0.8, avgRatio: 0.7, sku: 30, problematic: 3, rating: 4.6 },
    { key: "b", name: "Can", active: true, warehouseId: SOG, total: 20, green: 6, red: 14, greenRate: 0.3, avgRatio: 1.2, sku: 25, problematic: 9, rating: 4.1 },
    { key: "c", name: "Ece", active: true, warehouseId: SOG, total: 0, green: 0, red: 0, greenRate: null, avgRatio: null, sku: 0, problematic: 0, rating: null },
    { key: "d", name: "Banu", active: true, warehouseId: SOG, total: 10, green: 5, red: 5, greenRate: 0.5, avgRatio: 1, sku: 40, problematic: 1, rating: 4.4 },
  ];
  const names = (key: Parameters<typeof sortPickerStats>[1], dir: "asc" | "desc") =>
    sortPickerStats(rows, key, dir).map((r) => r.name);
  // Eşit toplamda (Ali, Banu) isim sırası
  assert.deepEqual(names("total", "desc"), ["Can", "Ali", "Banu", "Ece"]);
  assert.deepEqual(names("total", "asc"), ["Ece", "Ali", "Banu", "Can"]);
  assert.deepEqual(names("green", "desc"), ["Ali", "Can", "Banu", "Ece"]);
  assert.deepEqual(names("red", "desc"), ["Can", "Banu", "Ali", "Ece"]);
  assert.deepEqual(names("sku", "desc"), ["Banu", "Ali", "Can", "Ece"]);
  assert.deepEqual(names("problematic", "desc"), ["Can", "Ali", "Banu", "Ece"]);
  // Puanı olmayan her iki yönde de en sonda
  assert.deepEqual(names("rating", "desc"), ["Ali", "Banu", "Can", "Ece"]);
  assert.deepEqual(names("rating", "asc"), ["Can", "Banu", "Ali", "Ece"]);
  // Siparişi olmayanın yüzdesi her iki yönde de en sonda
  assert.deepEqual(names("greenRate", "desc"), ["Ali", "Banu", "Can", "Ece"]);
  assert.deepEqual(names("greenRate", "asc"), ["Can", "Banu", "Ali", "Ece"]);
});

test("planDayUpdates: eski rapor yeni raporun değerini ezmez", () => {
  const before = { a: stored(order("a", "Baran Özgün", "2026-10-15", 70, 60), NEW) };
  const after = planDayUpdates(before, { a: stored(order("a", "Baran Özgün", "2026-10-15", 30, 60), OLD) });
  assert.deepEqual(after, {});
});

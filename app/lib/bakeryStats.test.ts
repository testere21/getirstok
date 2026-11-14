import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDaysYmd,
  mergeBakeryStatsDay,
  orBits,
  parseBakeryStatsPush,
  sanitizeBakeryStatsDay,
  validateBakeryStatsRange,
} from "./bakeryStats";

const WID = "6113e59fbb8549d0f20e65f5";
const bits = (...minutes: number[]) => {
  const arr = Array(60).fill("0");
  for (const m of minutes) arr[m] = "1";
  return arr.join("");
};

test("orBits: iki bilgisayarın aynı dakikası bir kez sayılır", () => {
  assert.equal(orBits(bits(1, 2), bits(2, 3)), bits(1, 2, 3));
  assert.equal(orBits(undefined, bits(5)), bits(5));
  assert.equal(orBits("bozuk", bits(5)), bits(5));
  assert.equal(orBits(undefined, undefined), bits());
});

test("mergeBakeryStatsDay: saatler, ürünler ve dilimler", () => {
  const base = sanitizeBakeryStatsDay({
    h: { "9": { o: bits(0, 1, 2), a: bits(1), q: 4 } },
    ih: { "Sokak Simiti (90 g)": { "9": bits(1) } },
    slots: { "08-12": { p: 70, c: 40, s: 50 } },
  })!;
  const add = sanitizeBakeryStatsDay({
    h: { "9": { o: bits(2, 3), a: bits(2, 3), q: 7 }, "10": { o: bits(0), a: bits(), q: 0 } },
    ih: { "Sokak Simiti (90 g)": { "9": bits(3) }, "Taze Baget (110 g)": { "9": bits(2) } },
    slots: { "08-12": { p: 72, c: 35, s: 52 } },
  })!;
  const m = mergeBakeryStatsDay(base, add);
  assert.deepEqual(m.h["9"], { o: bits(0, 1, 2, 3), a: bits(1, 2, 3), q: 7 });
  assert.deepEqual(m.h["10"], { o: bits(0), a: bits(), q: 0 });
  assert.equal(m.ih["Sokak Simiti (90 g)"]["9"], bits(1, 3));
  assert.equal(m.ih["Taze Baget (110 g)"]["9"], bits(2));
  // Öneri en yeni, pişirilen/satılan büyük olan
  assert.deepEqual(m.slots["08-12"], { p: 72, c: 40, s: 52 });
});

test("parseBakeryStatsPush: geçersizler elenir", () => {
  assert.equal(parseBakeryStatsPush({ warehouseId: "x", days: {} }), null);
  assert.equal(parseBakeryStatsPush({ warehouseId: WID, days: { "14.11.2026": { h: {} } } }), null);
  const p = parseBakeryStatsPush({
    warehouseId: WID.toUpperCase(),
    days: { "2026-11-14": { h: { "9": { o: bits(1), a: "kısa", q: -3 }, "30": { o: bits(1) } } } },
  });
  assert.ok(p);
  assert.equal(p.warehouseId, WID);
  assert.deepEqual(p.days["2026-11-14"].h, { "9": { o: bits(1), a: bits(), q: 0 } });
});

test("validateBakeryStatsRange ve addDaysYmd", () => {
  assert.equal(validateBakeryStatsRange("2026-10-16", "2026-11-14"), null);
  assert.match(validateBakeryStatsRange("2026-11-15", "2026-11-14") ?? "", /sonra/);
  assert.match(validateBakeryStatsRange("2026-01-01", "2026-11-14") ?? "", /62/);
  assert.equal(addDaysYmd("2026-03-01", -1), "2026-02-28");
  assert.equal(addDaysYmd("2026-12-31", 1), "2027-01-01");
});

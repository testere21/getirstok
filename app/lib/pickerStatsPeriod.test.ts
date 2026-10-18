import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_RANGE_DAYS,
  addDaysYmd,
  daysInRange,
  formatYmdShort,
  isYmd,
  istanbulTodayYmd,
  normalizeRange,
  presetRange,
} from "./pickerStatsPeriod";

// 18.10.2026 Pazar
const TODAY = "2026-10-18";

test("istanbulTodayYmd: gece yarısından sonra UTC'de dün olsa da İstanbul günü", () => {
  assert.equal(istanbulTodayYmd(new Date("2026-10-17T21:30:00Z")), "2026-10-18");
  assert.equal(istanbulTodayYmd(new Date("2026-10-17T20:59:00Z")), "2026-10-17");
});

test("addDaysYmd: ay ve yıl geçişleri", () => {
  assert.equal(addDaysYmd("2026-10-01", -1), "2026-09-30");
  assert.equal(addDaysYmd("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysYmd("2028-02-28", 1), "2028-02-29");
});

test("presetRange: hazır dönemler", () => {
  assert.deepEqual(presetRange("today", TODAY), { from: TODAY, to: TODAY });
  assert.deepEqual(presetRange("yesterday", TODAY), { from: "2026-10-17", to: "2026-10-17" });
  assert.deepEqual(presetRange("last2", TODAY), { from: "2026-10-17", to: TODAY });
  assert.deepEqual(presetRange("last7", TODAY), { from: "2026-10-12", to: TODAY });
  // Pazar günü "bu hafta" o haftanın pazartesisinden başlar
  assert.deepEqual(presetRange("thisWeek", TODAY), { from: "2026-10-12", to: TODAY });
  assert.deepEqual(presetRange("thisWeek", "2026-10-12"), { from: "2026-10-12", to: "2026-10-12" });
  assert.deepEqual(presetRange("thisMonth", TODAY), { from: "2026-10-01", to: TODAY });
});

test("normalizeRange / daysInRange: ters aralık düzelir, uzun aralık kırpılır", () => {
  assert.deepEqual(normalizeRange({ from: "2026-10-16", to: "2026-10-14" }), {
    from: "2026-10-14",
    to: "2026-10-16",
  });
  assert.deepEqual(daysInRange({ from: "2026-10-14", to: "2026-10-16" }), [
    "2026-10-14",
    "2026-10-15",
    "2026-10-16",
  ]);
  const long = daysInRange({ from: "2024-01-01", to: TODAY });
  assert.equal(long.length, MAX_RANGE_DAYS);
  assert.equal(long[long.length - 1], TODAY);
});

test("isYmd ve formatYmdShort", () => {
  assert.equal(isYmd("2026-10-15"), true);
  assert.equal(isYmd("2026-02-30"), false);
  assert.equal(isYmd("15.10.2026"), false);
  assert.equal(formatYmdShort("2026-10-15", "2026"), "15 Eki");
  assert.equal(formatYmdShort("2025-12-01", "2026"), "1 Ara 2025");
});

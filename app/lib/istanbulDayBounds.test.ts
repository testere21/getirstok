import assert from "node:assert/strict";
import { test } from "node:test";
import {
  IstanbulDayBoundsError,
  buildRemoveFromSaleDateRange,
  istanbulDayToUtcIsoRange,
} from "./istanbulDayBounds";

test("2026-09-09 İstanbul günü yakalanan Getir aralığıyla aynı", () => {
  const range = istanbulDayToUtcIsoRange("2026-09-09");
  assert.equal(range.startDate, "2026-09-08T21:00:00.000Z");
  assert.equal(range.endDate, "2026-09-09T20:59:59.999Z");
  assert.deepEqual(buildRemoveFromSaleDateRange("2026-09-09"), {
    removeFromSaleDateRange: range,
  });
});

test("geçersiz tarih hata atar, boş aralık dönmez", () => {
  assert.throws(() => istanbulDayToUtcIsoRange(""), IstanbulDayBoundsError);
  assert.throws(() => istanbulDayToUtcIsoRange("09.09.2026"), IstanbulDayBoundsError);
  assert.throws(() => istanbulDayToUtcIsoRange("2026-13-40"), IstanbulDayBoundsError);
  assert.throws(() => istanbulDayToUtcIsoRange("2026-02-31"), IstanbulDayBoundsError);
});

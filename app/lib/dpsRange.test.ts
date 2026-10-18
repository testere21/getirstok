import assert from "node:assert/strict";
import { test } from "node:test";
import { dpsDateLimits, dpsDocId, dpsRetentionCutoff, subtractMonthsYmd, validateDpsRange } from "./dpsRange";

const TODAY = "2026-10-18";

test("subtractMonthsYmd: yıl geçişi ve ay sonu", () => {
  assert.equal(subtractMonthsYmd("2026-10-18", 5), "2026-05-18");
  assert.equal(subtractMonthsYmd("2026-03-15", 5), "2025-10-15");
  assert.equal(subtractMonthsYmd("2026-07-31", 5), "2026-02-28");
  assert.equal(subtractMonthsYmd("2028-07-31", 5), "2028-02-29");
});

test("dpsDateLimits: en son dün, en eski 5 ay önce", () => {
  assert.deepEqual(dpsDateLimits(TODAY), { min: "2026-05-18", max: "2026-10-17" });
  assert.equal(dpsRetentionCutoff(TODAY), "2026-05-18");
});

test("validateDpsRange", () => {
  assert.equal(validateDpsRange("2026-10-17", "2026-10-17", TODAY), null);
  assert.equal(validateDpsRange("2026-05-18", "2026-10-17", TODAY), null);
  assert.match(validateDpsRange("2026-10-18", "2026-10-18", TODAY) ?? "", /en son dün/);
  assert.match(validateDpsRange("2026-05-17", "2026-06-01", TODAY) ?? "", /5 ay/);
  assert.match(validateDpsRange("2026-10-16", "2026-10-15", TODAY) ?? "", /bitişten sonra/);
  assert.match(validateDpsRange("17.10.2026", "2026-10-17", TODAY) ?? "", /biçiminde/);
  assert.match(validateDpsRange("2026-02-30", "2026-03-01", TODAY) ?? "", /biçiminde/);
});

test("dpsDocId", () => {
  assert.equal(dpsDocId("2026-09-17", "2026-10-17"), "2026-09-17_2026-10-17");
});

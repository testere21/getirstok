import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseWarehouseExpiringProductsPayload,
  warehouseExpiryCalendarHasProductId,
  warehouseExpiryPayloadHasUnfetchedPages,
} from "./warehouseExpiringProductsParse";

const samplePayload = {
  data: [
    {
      fullName: "Salkım Domates Paket (900 g)",
      id: "5b8b749e3210ed327d7e05b0",
      removeFromSaleDate: "2026-09-09T00:00:00.000Z",
      expiryDate: "2026-09-10T00:00:00.000Z",
      count: 4,
    },
  ],
};

test("data dizisi satırları parse eder; dizi yoksa boş", () => {
  const rows = parseWarehouseExpiringProductsPayload(samplePayload);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "5b8b749e3210ed327d7e05b0");
  assert.equal(rows[0].fullName, "Salkım Domates Paket (900 g)");
  assert.deepEqual(parseWarehouseExpiringProductsPayload({}), []);
  assert.deepEqual(parseWarehouseExpiringProductsPayload({ data: null }), []);
  assert.deepEqual(parseWarehouseExpiringProductsPayload(null), []);
});

test("ürün id eşleşmesi küçük/büyük harf; yoksa false", () => {
  const rows = parseWarehouseExpiringProductsPayload(samplePayload);
  assert.equal(rows[0].id, "5b8b749e3210ed327d7e05b0");
  assert.equal(
    warehouseExpiryCalendarHasProductId(rows, "5B8B749E3210ED327D7E05B0"),
    true
  );
  assert.equal(warehouseExpiryCalendarHasProductId(rows, "aaaaaaaaaaaaaaaaaaaaaaaa"), false);
  assert.equal(warehouseExpiryCalendarHasProductId(rows, "  "), false);
  assert.equal(warehouseExpiryCalendarHasProductId(rows, "not-an-object-id"), false);
});

test("24 hex olmayan satır id atlanır; data[] tamamen taranır", () => {
  const rows = parseWarehouseExpiringProductsPayload({
    data: [
      { id: "not-hex", fullName: "skip" },
      { id: "5B8B749E3210ED327D7E05B0", fullName: "ok" },
      { id: "cccccccccccccccccccccccc", fullName: "second" },
    ],
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, "5b8b749e3210ed327d7e05b0");
  assert.equal(rows[1].id, "cccccccccccccccccccccccc");
  assert.equal(
    warehouseExpiryCalendarHasProductId(rows, "CCCCCCCCCCCCCCCCCCCCCCCC"),
    true
  );
});

test("sayfalama işareti varsa yarım liste sayılır", () => {
  assert.equal(warehouseExpiryPayloadHasUnfetchedPages(samplePayload), false);
  assert.equal(
    warehouseExpiryPayloadHasUnfetchedPages({
      data: samplePayload.data,
      hasNext: true,
    }),
    true
  );
  assert.equal(
    warehouseExpiryPayloadHasUnfetchedPages({
      data: samplePayload.data,
      pagination: { total: 40 },
    }),
    true
  );
});

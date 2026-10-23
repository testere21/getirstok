import assert from "node:assert/strict";
import { test } from "node:test";
import { isPickingOrderExpired, PICKING_ORDER_TTL_MS, sanitizePickingOrder } from "./pickingOrders";

const now = new Date("2026-10-23T07:30:00.000Z");

test("geçerli sipariş temizlenir", () => {
  const order = sanitizePickingOrder(
    {
      orderId: "6ADAFC1AB66DFB091B5D4BC8",
      locations: ["BNK.012", " BNK.012 ", ""],
      items: [
        { name: "  Sütaş Ayran   (200 ml) ", quantity: "5", imageUrl: "https://cdn-image.getir.com/a.jpg", barcode: "8690767710537" },
        { name: "Söke Un", quantity: "", imageUrl: "javascript:alert(1)", barcode: "abc" },
        { name: "", quantity: "1" },
      ],
      clientName: "Müşteri",
    },
    now
  );
  assert.deepEqual(order, {
    orderId: "6adafc1ab66dfb091b5d4bc8",
    locations: ["BNK.012"],
    items: [
      { name: "Sütaş Ayran (200 ml)", quantity: "5", imageUrl: "https://cdn-image.getir.com/a.jpg", barcode: "8690767710537" },
      { name: "Söke Un", quantity: "1", imageUrl: null, barcode: null },
    ],
    addedAt: now.toISOString(),
  });
});

test("kimliksiz ya da ürünsüz sipariş reddedilir", () => {
  assert.equal(sanitizePickingOrder({ orderId: "x", items: [{ name: "A" }] }, now), null);
  assert.equal(sanitizePickingOrder({ orderId: "6adafc1ab66dfb091b5d4bc8", items: [] }, now), null);
  assert.equal(sanitizePickingOrder(null, now), null);
});

test("24 saati geçen liste süresi dolmuş sayılır", () => {
  const addedAt = now.toISOString();
  assert.equal(isPickingOrderExpired({ addedAt }, now.getTime() + PICKING_ORDER_TTL_MS - 1), false);
  assert.equal(isPickingOrderExpired({ addedAt }, now.getTime() + PICKING_ORDER_TTL_MS + 1), true);
  assert.equal(isPickingOrderExpired({ addedAt: "bozuk" }, now.getTime()), true);
});

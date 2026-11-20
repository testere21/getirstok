import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BAKERY_NOT_IN_CATALOG_LABEL,
  DEFAULT_BAKERY_PRODUCT_BARCODES,
  MAX_BAKERY_PRODUCTS,
  addBakeryEntry,
  buildBakeryExitQueue,
  defaultBakeryEntries,
  moveBakeryEntry,
  parseBakeryEntries,
  removeBakeryEntry,
  resolveBakeryEntries,
} from "./bakeryProducts";

test("varsayılan liste: eski sabit liste, tekrarsız ve sırası korunur", () => {
  const entries = defaultBakeryEntries();
  assert.equal(entries.length, DEFAULT_BAKERY_PRODUCT_BARCODES.length);
  assert.equal(new Set(entries.map((e) => e.barcode)).size, entries.length);
  assert.equal(entries[0].barcode, "8682392116211");
  assert.equal(entries[entries.length - 1].barcode, "F004200");
});

test("parseBakeryEntries: dizi değilse null, boş dizi geçerli, bozuk/tekrar satırlar atılır", () => {
  assert.equal(parseBakeryEntries(undefined), null);
  assert.equal(parseBakeryEntries("x"), null);
  assert.deepEqual(parseBakeryEntries([]), []);
  assert.deepEqual(
    parseBakeryEntries([
      { barcode: " 111 222 ", name: " Simit " },
      { barcode: "111222" },
      { barcode: "" },
      null,
      42,
      { barcode: "333" },
    ]),
    [{ barcode: "111222", name: "Simit" }, { barcode: "333" }]
  );
});

test("addBakeryEntry: sona ekler; boş, tekrar ve dolu liste reddedilir", () => {
  const base = [{ barcode: "1" }];
  const added = addBakeryEntry(base, { barcode: " 2 ", name: " Poğaça " });
  assert.deepEqual(added, { ok: true, list: [{ barcode: "1" }, { barcode: "2", name: "Poğaça" }] });
  assert.deepEqual(addBakeryEntry(base, { barcode: "1" }), { ok: false, reason: "duplicate" });
  assert.deepEqual(addBakeryEntry(base, { barcode: "  " }), { ok: false, reason: "empty" });
  const full = Array.from({ length: MAX_BAKERY_PRODUCTS }, (_, i) => ({ barcode: String(i + 1) }));
  assert.deepEqual(addBakeryEntry(full, { barcode: "999999" }), { ok: false, reason: "full" });
  assert.deepEqual(base, [{ barcode: "1" }], "orijinal liste değişmez");
});

test("removeBakeryEntry ve moveBakeryEntry", () => {
  const list = [{ barcode: "a" }, { barcode: "b" }, { barcode: "c" }];
  assert.deepEqual(removeBakeryEntry(list, "b").map((e) => e.barcode), ["a", "c"]);
  assert.deepEqual(removeBakeryEntry(list, "yok").map((e) => e.barcode), ["a", "b", "c"]);
  assert.deepEqual(moveBakeryEntry(list, "b", -1).map((e) => e.barcode), ["b", "a", "c"]);
  assert.deepEqual(moveBakeryEntry(list, "b", 1).map((e) => e.barcode), ["a", "c", "b"]);
  // sınırlar: ilk ürün yukarı, son ürün aşağı gitmez
  assert.deepEqual(moveBakeryEntry(list, "a", -1).map((e) => e.barcode), ["a", "b", "c"]);
  assert.deepEqual(moveBakeryEntry(list, "c", 1).map((e) => e.barcode), ["a", "b", "c"]);
  assert.deepEqual(moveBakeryEntry(list, "yok", 1).map((e) => e.barcode), ["a", "b", "c"]);
});

test("resolveBakeryEntries: katalog eşleşmesi (alternatif barkod dahil), yoksa yedek ad", () => {
  const catalog = [
    { barcode: "111", name: "Simit", imageUrl: "u1", productId: "p1" },
    { barcode: "222", barcodes: ["333"], name: "Poğaça" },
  ];
  const rows = resolveBakeryEntries(
    [{ barcode: "333" }, { barcode: "111" }, { barcode: "999", name: "Elle eklenen" }, { barcode: "888" }],
    catalog
  );
  assert.deepEqual(
    rows.map((r) => [r.barcode, r.displayName, r.inCatalog]),
    [
      ["333", "Poğaça", true],
      ["111", "Simit", true],
      ["999", "Elle eklenen", false],
      ["888", BAKERY_NOT_IN_CATALOG_LABEL, false],
    ]
  );
  assert.equal(rows[1].imageUrl, "u1");
  assert.equal(rows[1].productId, "p1");
});

test("buildBakeryExitQueue: stok>0 ve okunamayan kalır, stok 0 düşer, sıra korunur", () => {
  const rows = ["a", "b", "c", "d", "e"].map((barcode) => ({
    barcode,
    displayName: barcode,
    inCatalog: true,
  }));
  const queue = buildBakeryExitQueue(rows, { a: 3, b: 0, c: null, d: 1 });
  assert.deepEqual(
    queue.map((r) => r.barcode),
    ["a", "c", "d", "e"],
    "b (0) düşer; c (null) ve e (hiç dönmedi) okunamadı olarak kalır"
  );
});

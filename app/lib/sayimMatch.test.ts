import assert from "node:assert/strict";
import { test } from "node:test";
import {
  matchSayimItems,
  summarizeSayimResult,
  type SayimMatchOptions,
  type SayimStockInput,
} from "./sayimMatch";

type Fixture = { category: string; price: number };

/** Barkod -> kategori + fiyat sözlüğünden `categoryOf` / `priceOf` üretir. */
function optionsFrom(
  table: Record<string, Fixture>,
  lossLimitTry?: number
): SayimMatchOptions {
  return {
    categoryOf: (barcode) => table[barcode]?.category ?? null,
    priceOf: (barcode) => table[barcode]?.price ?? null,
    lossLimitTry,
  };
}

function item(
  id: string,
  name: string,
  barcode: string,
  quantity: number
): SayimStockInput {
  return { id, name, barcode, quantity };
}

test("tutar bazlı tam kapanma: 3×100 fazla vs 2×150 eksik → net 0", () => {
  const table = {
    x: { category: "Peynir", price: 100 },
    y: { category: "Peynir", price: 150 },
  };
  const result = matchSayimItems(
    [item("m1", "Y peyniri", "y", 2)],
    [item("e1", "X peyniri", "x", 3)],
    optionsFrom(table)
  );

  assert.equal(result.pairs.length, 1);
  const pair = result.pairs[0];
  assert.equal(pair.missing.total, 300);
  assert.equal(pair.extra.total, 300);
  assert.equal(pair.net, 0);
  assert.equal(pair.exceedsLimit, false);
  assert.equal(result.unmatchedMissing.length, 0);
  assert.equal(result.unmatchedExtra.length, 0);
});

test("en yakın toplam tutar kazanır, birim fiyat farkı değil", () => {
  // Eksik A: 2×150 = 300. Adaylar: Z 3×100 = 300 (tutar farkı 0, birim farkı 50)
  // ve Y 2×140 = 280 (tutar farkı 20, birim farkı 10). Tutar bazlı model Z der.
  const table = {
    a: { category: "Peynir", price: 150 },
    z: { category: "Peynir", price: 100 },
    y: { category: "Peynir", price: 140 },
  };
  const result = matchSayimItems(
    [item("m1", "A", "a", 2)],
    [item("e1", "Z", "z", 3), item("e2", "Y", "y", 2)],
    optionsFrom(table)
  );

  assert.equal(result.pairs.length, 1);
  assert.equal(result.pairs[0].extra.id, "e1");
  assert.equal(result.pairs[0].net, 0);
  assert.deepEqual(
    result.unmatchedExtra.map((e) => e.id),
    ["e2"]
  );
});

test("tek aday varsa fark büyük olsa da eşleşir", () => {
  const table = {
    a: { category: "Peynir", price: 150 },
    z: { category: "Peynir", price: 400 },
  };
  const result = matchSayimItems(
    [item("m1", "A", "a", 1)],
    [item("e1", "Z", "z", 1)],
    optionsFrom(table)
  );

  assert.equal(result.pairs.length, 1);
  assert.equal(result.pairs[0].extra.id, "e1");
  assert.equal(result.pairs[0].net, 250);
});

test("çakışma: aynı fazlayı iki eksik isterse zararı az olan alır", () => {
  // Fazla Z = 100. Eksik A = 110 (fark 10), eksik B = 160 (fark 60).
  const table = {
    a: { category: "Peynir", price: 110 },
    b: { category: "Peynir", price: 160 },
    z: { category: "Peynir", price: 100 },
  };
  const result = matchSayimItems(
    [item("m1", "A", "a", 1), item("m2", "B", "b", 1)],
    [item("e1", "Z", "z", 1)],
    optionsFrom(table, 1000)
  );

  assert.equal(result.pairs.length, 1);
  assert.equal(result.pairs[0].missing.id, "m1");
  assert.equal(result.pairs[0].net, -10);
  assert.deepEqual(
    result.unmatchedMissing.map((m) => m.id),
    ["m2"]
  );
});

test("farklı kategoriler asla eşleşmez", () => {
  const table = {
    a: { category: "Peynir", price: 100 },
    z: { category: "İçecek", price: 100 },
  };
  const result = matchSayimItems(
    [item("m1", "A", "a", 1)],
    [item("e1", "Z", "z", 1)],
    optionsFrom(table)
  );

  assert.equal(result.pairs.length, 0);
  assert.equal(result.unmatchedMissing.length, 1);
  assert.equal(result.unmatchedExtra.length, 1);
});

test("zarar sınırı: 1×200 fazla vs 5×209 eksik işaretlenir ama atılmaz", () => {
  const table = {
    kucuk: { category: "Peynir", price: 200 },
    buyuk: { category: "Peynir", price: 209 },
  };
  const result = matchSayimItems(
    [item("m1", "Sütaş 110 g", "buyuk", 5)],
    [item("e1", "Sütaş 100 g", "kucuk", 1)],
    optionsFrom(table, 50)
  );

  assert.equal(result.pairs.length, 1);
  assert.equal(result.pairs[0].net, -845);
  assert.equal(result.pairs[0].exceedsLimit, true);

  const summary = summarizeSayimResult(result);
  assert.equal(summary.exceedingCount, 1);
  assert.equal(summary.withinLimitCount, 0);
  // Sınırı aşan çift özet tutarına katılmaz
  assert.equal(summary.netTotal, 0);
});

test("kâr tarafında sınır yok", () => {
  const table = {
    a: { category: "Peynir", price: 100 },
    z: { category: "Peynir", price: 900 },
  };
  const result = matchSayimItems(
    [item("m1", "A", "a", 1)],
    [item("e1", "Z", "z", 1)],
    optionsFrom(table, 50)
  );

  assert.equal(result.pairs[0].net, 800);
  assert.equal(result.pairs[0].exceedsLimit, false);
});

test("kategorisi veya fiyatı olmayan kayıt eşleşmeye girmez, sebebiyle raporlanır", () => {
  const table = {
    a: { category: "Peynir", price: 100 },
    kategorisiz: { category: "", price: 100 },
  };
  const result = matchSayimItems(
    [
      item("m1", "Kategorisiz ürün", "kategorisiz", 1),
      item("m2", "Katalogda yok", "bilinmeyen", 1),
      item("m3", "Sıfır adet", "a", 0),
    ],
    [item("e1", "A", "a", 1)],
    optionsFrom(table)
  );

  assert.equal(result.pairs.length, 0);
  assert.deepEqual(
    result.skipped.map((s) => [s.id, s.reason]),
    [
      ["m1", "no_category"],
      ["m2", "no_category"],
      ["m3", "no_quantity"],
    ]
  );
});

test("fiyatı olmayan ürün no_price ile atlanır", () => {
  const options: SayimMatchOptions = {
    categoryOf: () => "Peynir",
    priceOf: () => null,
  };
  const result = matchSayimItems(
    [item("m1", "Fiyatsız", "x", 1)],
    [],
    options
  );

  assert.equal(result.pairs.length, 0);
  assert.deepEqual(
    result.skipped.map((s) => s.reason),
    ["no_price"]
  );
});

test("boş girdi sorun çıkarmaz", () => {
  const result = matchSayimItems([], [], optionsFrom({}));
  assert.deepEqual(result.pairs, []);
  assert.deepEqual(result.skipped, []);
  assert.equal(summarizeSayimResult(result).netTotal, 0);
});

test("aynı kategoride çok kayıt: en küçük farklardan başlayarak eşleşir", () => {
  const table = {
    m100: { category: "Peynir", price: 100 },
    m200: { category: "Peynir", price: 200 },
    e105: { category: "Peynir", price: 105 },
    e195: { category: "Peynir", price: 195 },
  };
  const result = matchSayimItems(
    [item("m1", "Eksik 100", "m100", 1), item("m2", "Eksik 200", "m200", 1)],
    [item("e1", "Fazla 105", "e105", 1), item("e2", "Fazla 195", "e195", 1)],
    optionsFrom(table)
  );

  assert.equal(result.pairs.length, 2);
  const byMissing = new Map(result.pairs.map((p) => [p.missing.id, p]));
  assert.equal(byMissing.get("m1")?.extra.id, "e1");
  assert.equal(byMissing.get("m2")?.extra.id, "e2");

  const summary = summarizeSayimResult(result);
  assert.equal(summary.pairCount, 2);
  assert.equal(summary.netTotal, 0); // +5 ve -5
});

test("ondalıklı fiyatlarda kuruş kayması olmaz", () => {
  const table = {
    a: { category: "Yoğurt", price: 101.99 },
    z: { category: "Yoğurt", price: 111.5 },
  };
  const result = matchSayimItems(
    [item("m1", "Activia", "a", 3)],
    [item("e1", "Sütaş", "z", 3)],
    optionsFrom(table, 1000)
  );

  assert.equal(result.pairs[0].missing.total, 305.97);
  assert.equal(result.pairs[0].extra.total, 334.5);
  assert.equal(result.pairs[0].net, 28.53);
});

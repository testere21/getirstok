import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatIncomingProductLine,
  formatMissingMatchLine,
  groupIncomingProductsByPallet,
  matchMissingWithTransferProducts,
  palletQuantityFor,
  searchMatchesIncomingProduct,
  sortIncomingProducts,
  sortIncomingProductsByPallet,
  summarizeIncomingProducts,
} from "./sevkiyatMatch";

test("eşleşme satır metni paletli ve paletsiz", () => {
  assert.equal(
    formatMissingMatchLine({
      displayName: "Süt",
      missingQty: 5,
      palletCodes: ["K0011039635"],
      transferQty: 24,
      barcode: "8690",
      imageUrl: null,
    }),
    "Süt (5 eksik) · K0011039635 paletinde var"
  );
  assert.equal(
    formatMissingMatchLine({
      displayName: "Süt",
      missingQty: 5,
      palletCodes: [],
      transferQty: 24,
      barcode: "8690",
      imageUrl: null,
    }),
    "Süt (5 eksik)"
  );
});

test("süt 5 eksik + palet → bir satır", () => {
  const rows = matchMissingWithTransferProducts(
    [{ name: "Sütaş yarım yağlı süt", barcode: "8690", quantity: 5 }],
    [
      {
        name: "Sütaş Yarım Yağlı Süt",
        barcode: "8690",
        quantity: 24,
        palletCodes: ["K0011039635"],
      },
    ]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].displayName, "Sütaş yarım yağlı süt");
  assert.equal(rows[0].missingQty, 5);
  assert.equal(rows[0].transferQty, 24);
  assert.deepEqual(rows[0].palletCodes, ["K0011039635"]);
});

test("sevkiyatta yok → dizi boş", () => {
  const rows = matchMissingWithTransferProducts(
    [{ name: "Olmayan ürün", barcode: "000", quantity: 2 }],
    [
      {
        name: "Fanta",
        barcode: "500",
        quantity: 12,
        palletCodes: ["K001"],
      },
    ]
  );
  assert.deepEqual(rows, []);
});

test("aynı barkod iki eksik kaydı toplanır", () => {
  const rows = matchMissingWithTransferProducts(
    [
      { name: "Süt", barcode: " 8690 ", quantity: 2 },
      { name: "Süt", barcode: "8690", quantity: 3 },
    ],
    [
      {
        name: "Süt",
        barcode: "8690",
        quantity: 10,
        palletCodes: ["K001", "K002"],
      },
    ]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].missingQty, 5);
  assert.deepEqual(rows[0].palletCodes, ["K001", "K002"]);
});

test("barkodsuz tek ada eşleşir", () => {
  const rows = matchMissingWithTransferProducts(
    [{ name: "  Fanta  (1 L) ", barcode: "", quantity: 1 }],
    [
      {
        name: "Fanta (1 L)",
        barcode: "5000112664980",
        quantity: 24,
        palletCodes: ["K009"],
      },
    ]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].missingQty, 1);
  assert.equal(rows[0].palletCodes[0], "K009");
});

test("aynı ada birden fazla SKU → eşleşme yok", () => {
  const rows = matchMissingWithTransferProducts(
    [{ name: "Fanta", barcode: "", quantity: 1 }],
    [
      {
        name: "Fanta",
        barcode: "111",
        quantity: 6,
        palletCodes: ["K1"],
      },
      {
        name: "Fanta",
        barcode: "222",
        quantity: 6,
        palletCodes: ["K2"],
      },
    ]
  );
  assert.deepEqual(rows, []);
});

test("barkod uyuşmaz, ad tek SKU ise ad ile bulunur", () => {
  const rows = matchMissingWithTransferProducts(
    [{ name: "Coca-Cola Zero Sugar (250 ml)", barcode: "yanlis", quantity: 4 }],
    [
      {
        name: "Coca-Cola Zero Sugar (250 ml)",
        barcode: "5000112664843",
        quantity: 24,
        palletCodes: ["K0011060743"],
      },
    ]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].missingQty, 4);
});

test("gelen ürünler ada göre A→Z ve toplam miktar", () => {
  const sorted = sortIncomingProducts([
    { name: "Fanta", barcode: "2", quantity: 10, palletCodes: ["K2"] },
    { name: "Coca-Cola", barcode: "1", quantity: 24, palletCodes: ["K1"] },
    { name: "Lipton", barcode: "3", quantity: null, palletCodes: [] },
  ]);
  assert.deepEqual(
    sorted.map((r) => r.name),
    ["Coca-Cola", "Fanta", "Lipton"]
  );
  const summary = summarizeIncomingProducts(sorted);
  assert.equal(summary.skuCount, 3);
  assert.equal(summary.totalQty, 34);
  assert.equal(summary.missingQtyCount, 1);
  assert.equal(
    formatIncomingProductLine(sorted[0]),
    "Coca-Cola · 1 · 24 · K1"
  );
});

test("searchMatchesIncomingProduct: ürün adı, barkod ve palet ile arama", () => {
  const prod = {
    name: "7 Days Çilekli Kruvasan (60 g)",
    barcode: "7622202365355",
    quantity: 24,
    palletCodes: ["K0011215706"],
  };

  // Tam veya kısmi isim
  assert.equal(searchMatchesIncomingProduct(prod, "Çilekli"), true);
  // Türkçe karakter toleransı (cilekli -> Çilekli)
  assert.equal(searchMatchesIncomingProduct(prod, "cilekli"), true);
  assert.equal(searchMatchesIncomingProduct(prod, "kruvasan"), true);
  // Barkod araması
  assert.equal(searchMatchesIncomingProduct(prod, "762220"), true);
  // Palet kodu araması
  assert.equal(searchMatchesIncomingProduct(prod, "K0011215706"), true);
  assert.equal(searchMatchesIncomingProduct(prod, "1215706"), true);
  // Uyuşmayan arama
  assert.equal(searchMatchesIncomingProduct(prod, "Peynir"), false);
  // Boş arama hepsiyle eşleşir
  assert.equal(searchMatchesIncomingProduct(prod, ""), true);
});

test("sortIncomingProductsByPallet: palet koduna göre sıralama", () => {
  const items = [
    { name: "Çilekli Kruvasan", barcode: "1", quantity: 5, palletCodes: ["K002"] },
    { name: "Süt", barcode: "2", quantity: 10, palletCodes: [] },
    { name: "Ayran", barcode: "3", quantity: 20, palletCodes: ["K001"] },
    { name: "Kakaolu Kruvasan", barcode: "4", quantity: 3, palletCodes: ["K002"] },
  ];

  const sorted = sortIncomingProductsByPallet(items);
  // K001 önce gelir
  assert.equal(sorted[0].name, "Ayran");
  // K002 ürünleri (kendi içinde ada göre A-Z)
  assert.equal(sorted[1].name, "Çilekli Kruvasan");
  assert.equal(sorted[2].name, "Kakaolu Kruvasan");
  // Paletsiz en sonda
  assert.equal(sorted[3].name, "Süt");
});

test("groupIncomingProductsByPallet: palet gruplama ve miktar hesaplama", () => {
  const items = [
    { name: "Kruvasan 1", barcode: "1", quantity: 10, palletCodes: ["K002"] },
    { name: "Ayran", barcode: "2", quantity: 20, palletCodes: ["K001"] },
    { name: "Kruvasan 2", barcode: "3", quantity: 5, palletCodes: ["K002"] },
    { name: "Paletsiz Ürün", barcode: "4", quantity: 2, palletCodes: [] },
  ];

  const groups = groupIncomingProductsByPallet(items);
  assert.equal(groups.length, 3);

  // K001
  assert.equal(groups[0].palletCode, "K001");
  assert.equal(groups[0].skuCount, 1);
  assert.equal(groups[0].totalQty, 20);

  // K002
  assert.equal(groups[1].palletCode, "K002");
  assert.equal(groups[1].skuCount, 2);
  assert.equal(groups[1].totalQty, 15);

  // Palet Kodu Yok
  assert.equal(groups[2].isNoPallet, true);
  assert.equal(groups[2].skuCount, 1);
  assert.equal(groups[2].totalQty, 2);
});


test("arama: önbellekli anahtar Türkçe karakter, barkod ve palet için doğru çalışır", () => {
  const row = {
    name: "ÇİKOLATALI Süt 1 L",
    barcode: "8690575109219",
    quantity: 3,
    palletCodes: ["K0011526041"],
  };
  // aynı satır art arda sorgulanır (önbellek devreye girer)
  for (let i = 0; i < 3; i++) {
    assert.equal(searchMatchesIncomingProduct(row, "çikolata"), true);
    assert.equal(searchMatchesIncomingProduct(row, "cikolata"), true);
    assert.equal(searchMatchesIncomingProduct(row, "SÜT"), true);
    assert.equal(searchMatchesIncomingProduct(row, "sut"), true);
    assert.equal(searchMatchesIncomingProduct(row, "109219"), true);
    assert.equal(searchMatchesIncomingProduct(row, "k0011526041"), true);
    assert.equal(searchMatchesIncomingProduct(row, "ayran"), false);
    assert.equal(searchMatchesIncomingProduct(row, "   "), true);
  }
  // alanlar arası birleşik eşleşme olmamalı (ad sonu + barkod başı)
  assert.equal(searchMatchesIncomingProduct(row, "l 8690"), false);
});

test("sıralama: Türkçe ad sırası ve palet kodu sayısal sırası", () => {
  const rows = [
    { name: "Zeytin", barcode: "1", quantity: 1, palletCodes: ["K10"] },
    { name: "Çay", barcode: "2", quantity: 1, palletCodes: ["K2"] },
    { name: "Ayran", barcode: "3", quantity: 1, palletCodes: [] },
  ];
  assert.deepEqual(
    sortIncomingProducts(rows).map((r) => r.name),
    ["Ayran", "Çay", "Zeytin"]
  );
  assert.deepEqual(
    sortIncomingProductsByPallet(rows).map((r) => r.name),
    ["Çay", "Zeytin", "Ayran"]
  );
});

test("palet adedi: palet başına adet, bilinmiyorsa tek palette toplam, çok paletteyse null", () => {
  const multi = {
    quantity: 30,
    palletCodes: ["K1", "K2", "K3"],
    palletQuantities: { K1: 10, K2: 20, K3: null },
  };
  assert.equal(palletQuantityFor(multi, "K1"), 10);
  assert.equal(palletQuantityFor(multi, "K2"), 20);
  assert.equal(palletQuantityFor(multi, "K3"), null);
  const single = { quantity: 7, palletCodes: ["K9"] };
  assert.equal(palletQuantityFor(single, "K9"), 7);
});

test("eşleşme: aynı ürünün paletleri birleşince palet adetleri korunur", () => {
  const rows = matchMissingWithTransferProducts(
    [{ name: "Ayran", barcode: "111", quantity: 1 }],
    [
      { name: "Ayran", barcode: "111", quantity: 12, palletCodes: ["K1"], palletQuantities: { K1: 12 } },
      { name: "Ayran", barcode: "111", quantity: 5, palletCodes: ["K2"], palletQuantities: { K2: 5 } },
      { name: "Ayran", barcode: "111", quantity: 3, palletCodes: ["K1"], palletQuantities: { K1: 3 } },
    ]
  );
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].palletCodes, ["K1", "K2"]);
  assert.deepEqual(rows[0].palletQuantities, { K1: 15, K2: 5 });
  assert.equal(rows[0].transferQty, 20);
});

test("eşleşme: elle eklenen ürün sevkiyat ürününün ek barkoduyla ve baştaki sıfır farkıyla bulunur", () => {
  const rows = matchMissingWithTransferProducts(
    [
      { name: "Torku Tahin 600 G", barcode: "8690120059945", quantity: 2 },
      { name: "Elle eklenen B", barcode: "8698529301443", quantity: 1 },
      { name: "Alakasız", barcode: "9999999999999", quantity: 1 },
    ],
    [
      // ana barkod farklı, panele girilen barkod ek barkodlardan biri
      {
        name: "Torku Tahin (600 g)",
        barcode: "8690120000001",
        barcodes: ["8690120000001", "8690120059945"],
        quantity: 6,
        palletCodes: ["K1"],
        palletQuantities: { K1: 6 },
      },
      // GTIN-14 biçimi (baştaki sıfır)
      {
        name: "Seyidoğlu Pekmez",
        barcode: "08698529301443",
        quantity: 4,
        palletCodes: ["K2"],
        palletQuantities: { K2: 4 },
      },
    ]
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.barcode), ["8690120059945", "8698529301443"]);
  assert.deepEqual(rows[0].palletCodes, ["K1"]);
  assert.equal(rows[1].transferQty, 4);
});

test("arama: ek barkodlarla da bulunur", () => {
  const row = {
    name: "Torku Tahin",
    barcode: "8690120000001",
    barcodes: ["8690120000001", "8690120059945"],
    quantity: 1,
    palletCodes: [],
  };
  assert.equal(searchMatchesIncomingProduct(row, "8690120059945"), true);
});

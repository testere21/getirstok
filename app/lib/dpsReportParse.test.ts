import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import {
  DEPO_ICI_SURE_SHEET,
  DpsReportParseError,
  colorOf,
  ordersFromRows,
  parseDepoIciSure,
  pickerKey,
} from "./dpsReportParse";

const HEADER = [
  "sipariş id",
  "sipariş tarihi",
  "toplayıcı adı",
  "toplayıcı atama tarihi",
  "toplayıcı atama süresi",
  "toplayıcı onay tarihi",
  "hazırlama başlangıç tarihi",
  "toplayıcı hazırlama süresi",
  "prepare_duration",
  "tahmini hazırlama süresi",
  "tahmin uyum performansı",
];

/** Excel'in yaptığı gibi İstanbul duvar saatini UTC alanlarına yazar. */
function wall(iso: string): Date {
  return new Date(`${iso}Z`);
}

function row(
  orderId: string,
  orderDate: Date | string,
  picker: string,
  prepare: number,
  estimated: number,
  ratio: number | null = prepare / estimated
): unknown[] {
  return [orderId, orderDate, picker, orderDate, 0, orderDate, orderDate, 0.2, prepare, estimated, ratio];
}

const ID_A = "6acff1262744fb2614b817a4";
const ID_B = "6ad069553b9feddcd0943685";
const ID_C = "6ad0ac813b9feddcd0950d73";

test("pickerKey: Türkçe karakter, büyük harf ve fazla boşluk aynı anahtara iner", () => {
  assert.equal(pickerKey("Hüseyin Sarikaya"), pickerKey("Hüseyin Sarıkaya"));
  assert.equal(pickerKey("BERKCAN  ÖZKAN"), pickerKey("Berkcan Özkan"));
  assert.equal(pickerKey("Çinar Ergin"), pickerKey("Çınar Ergin"));
  assert.equal(pickerKey("  Ferruh Melik Camgözoğlu "), "ferruh melik camgozoglu");
  assert.equal(pickerKey("İSMAİL IŞIK"), "ismail isik");
  assert.notEqual(pickerKey("Baran Özgün"), pickerKey("Baran Özgen"));
});

test("colorOf: 1 ve altı yeşil, 1'in üstü kırmızı", () => {
  assert.equal(colorOf(0.857142857), "green");
  assert.equal(colorOf(0.999999), "green");
  assert.equal(colorOf(1), "green");
  // Excel'in kayan nokta sapması tam 1 sayılır
  assert.equal(colorOf(1.0000000001), "green");
  assert.equal(colorOf(1.000001), "red");
  assert.equal(colorOf(2.18), "red");
});

test("ordersFromRows: kolonlar başlık adıyla bulunur, sıra önemli değil", () => {
  const reversed = [...HEADER].reverse();
  const r = row(ID_A, wall("2026-10-15T00:16:24.464"), "Baran Özgün", 25, 52);
  const result = ordersFromRows(reversed, [[...r].reverse()]);
  assert.equal(result.orders.length, 1);
  const o = result.orders[0];
  assert.equal(o.orderId, ID_A);
  assert.equal(o.pickerName, "Baran Özgün");
  assert.equal(o.prepareDuration, 25);
  assert.equal(o.estimatedDuration, 52);
  assert.ok(Math.abs(o.ratio - 0.480769230769231) < 1e-9);
  assert.equal(o.color, "green");
});

test("ordersFromRows: tarih İstanbul günü olarak alınır, gerçek an 3 saat geride", () => {
  const result = ordersFromRows(HEADER, [
    row(ID_A, wall("2026-10-15T00:16:24.464"), "Baran Özgün", 25, 52),
    row(ID_B, "2026-10-14 23:59:58", "Baran Özgün", 25, 52),
  ]);
  const [a, b] = result.orders;
  // Gece yarısından hemen sonraki sipariş 15'ine yazılır (UTC'de 14'ü olsa da)
  assert.equal(a.orderDate, "2026-10-15");
  assert.equal(a.orderedAt, "2026-10-14T21:16:24.464Z");
  // Metin olarak gelen tarih de okunur
  assert.equal(b.orderDate, "2026-10-14");
  assert.equal(b.orderedAt, "2026-10-14T20:59:58.000Z");
});

test("ordersFromRows: oran kolonu boşsa iki süreden hesaplanır; tam 1 yeşil", () => {
  const result = ordersFromRows(HEADER, [
    row(ID_A, wall("2026-10-15T10:00:00"), "Ferhat Kortak", 262, 120, null),
    row(ID_B, wall("2026-10-15T11:00:00"), "Ferhat Kortak", 40, 40),
  ]);
  assert.ok(Math.abs(result.orders[0].ratio - 262 / 120) < 1e-9);
  assert.equal(result.orders[0].color, "red");
  assert.equal(result.orders[1].ratio, 1);
  assert.equal(result.orders[1].color, "green");
});

test("ordersFromRows: bozuk satırlar atlanır ve sayılır", () => {
  const result = ordersFromRows(HEADER, [
    row("", wall("2026-10-15T10:00:00"), "Ferhat Kortak", 10, 20),
    row(ID_A, wall("2026-10-15T10:00:00"), "   ", 10, 20),
    row(ID_B, "dün", "Ferhat Kortak", 10, 20),
    row(ID_C, wall("2026-10-15T10:00:00"), "Ferhat Kortak", 10, 0),
    [],
  ]);
  assert.equal(result.orders.length, 0);
  assert.deepEqual(result.skipped, {
    missingOrderId: 2,
    missingPicker: 1,
    badDate: 1,
    badDuration: 1,
  });
});

test("ordersFromRows: aynı sipariş dosyada iki kez geçerse bir kez sayılır", () => {
  const result = ordersFromRows(HEADER, [
    row(ID_A, wall("2026-10-15T10:00:00"), "Ferhat Kortak", 10, 20),
    row(ID_A, wall("2026-10-15T10:00:00"), "Ferhat Kortak", 30, 20),
  ]);
  assert.equal(result.orders.length, 1);
  assert.equal(result.orders[0].prepareDuration, 30);
});

test("ordersFromRows: Getir'in 'kayıt yok' sayfası hata değil, boş rapor", () => {
  const result = ordersFromRows([0], [["There is no record for a given dates."]]);
  assert.equal(result.noRecords, true);
  assert.equal(result.orders.length, 0);
  // Gerçek dosyada da aynı biçim okunmalı
  const ok = ordersFromRows(HEADER, [row(ID_A, wall("2026-10-15T10:00:00"), "Ferhat Kortak", 10, 20)]);
  assert.equal(ok.noRecords, false);
});

test("ordersFromRows: zorunlu kolon eksikse açık hata", () => {
  const header = HEADER.filter((h) => h !== "toplayıcı adı");
  assert.throws(() => ordersFromRows(header, []), (e: unknown) => {
    assert.ok(e instanceof DpsReportParseError);
    assert.match((e as Error).message, /toplayıcı adı/);
    return true;
  });
});

async function workbookBuffer(sheets: Record<string, unknown[][]>): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name);
    for (const r of rows) ws.addRow(r);
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

test("parseDepoIciSure: gerçek .xlsx içinden doğru sayfayı okur", async () => {
  const buffer = await workbookBuffer({
    "Sorunsuz Teslimat": [["sipariş id", "sipariş tarihi", "toplayıcı adı"], [ID_C, wall("2026-10-15T09:00:00"), "Başka Biri"]],
    [DEPO_ICI_SURE_SHEET]: [
      HEADER,
      row(ID_A, wall("2026-10-15T00:16:24.464"), "Baran Özgün", 25, 52),
      row(ID_B, wall("2026-10-15T08:49:14.677"), "BERKCAN  ÖZKAN", 70, 39),
    ],
  });
  const result = await parseDepoIciSure(buffer);
  assert.equal(result.orders.length, 2);
  assert.deepEqual(
    result.orders.map((o) => [o.orderId, o.orderDate, o.pickerName, o.color]),
    [
      [ID_A, "2026-10-15", "Baran Özgün", "green"],
      [ID_B, "2026-10-15", "BERKCAN ÖZKAN", "red"],
    ]
  );
});

test("parseDepoIciSure: 'kayıt yok' yazan sayfa .xlsx içinden de boş okunur", async () => {
  const buffer = await workbookBuffer({
    [DEPO_ICI_SURE_SHEET]: [[0], ["There is no record for a given dates."]],
  });
  const result = await parseDepoIciSure(buffer);
  assert.equal(result.noRecords, true);
  assert.equal(result.orders.length, 0);
});

test("parseDepoIciSure: sayfa yoksa veya dosya bozuksa açık hata", async () => {
  const noSheet = await workbookBuffer({ CDI: [["sipariş id"]] });
  await assert.rejects(parseDepoIciSure(noSheet), (e: unknown) => {
    assert.ok(e instanceof DpsReportParseError);
    assert.match((e as Error).message, /Depo İçi Süre/);
    return true;
  });
  await assert.rejects(parseDepoIciSure(new Uint8Array([1, 2, 3])), DpsReportParseError);
});

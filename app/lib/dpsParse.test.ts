import assert from "node:assert/strict";
import { test } from "node:test";
import { DpsParseError, parseDpsCriteria, type DpsSection } from "./dpsParse";

const US = "6113e59fbb8549d0f20e65f5";

function sub(key: string, point: number, performance: number | null, weight: number) {
  return {
    subCriterionPoint_75: point,
    subCriterionPerformancePercentage_75: performance,
    subCriterionTranslationKey_75: key,
    subCriterionWeight_75: weight,
  };
}

function audit(key: string, point = 0, performance = 0) {
  return { criterionPoint: point, criterionPerformancePercentage: performance, criterionWeight: null, criterionTranslationKey: key };
}

/** 17.10 Getir cevabının yapısı; isimler uydurma */
function warehouse(id: string, name: string, rank: number | null, bayiPoint = 65.23165192523527) {
  const bayiSubs = [
    sub("RED_BASKET", 0, 3.79, 25),
    sub("PICKER_ASSIGN_DURATION", 91.3068181818182, 15.2159090909091, 3),
    sub("PROBLEMATIC_ORDER", 70.9090909090909, 1.14, 25),
    sub("COUNTING_PERFORMANCE", 100, null, 7.5),
    sub("BAKERY_PERFORMANCE", 96.79174652508, null, 10),
    sub("NEW_IN_WH_DURATION", 100, 0.981936801356167, 7.000000000000001),
    sub("COURIER_DISCIPLINE_INDEX", 87.24, null, 15),
    sub("ACCEPTANCE_OF_GOODS", 100, 100, 7.5),
  ];
  return {
    warehouseName: name,
    warehouseId: id,
    franchiseName: "Örnek Bayi",
    franchiseId: "000000000000000000000001",
    currentRank: rank,
    warehouseDpsPoints: {
      point: bayiPoint,
      letterGrade: id === US ? "C" : undefined,
      criterionPoints: [
        { criterionPoint: bayiPoint, criterionTranslationKey: "TOTAL_75", subCriterionPoints: bayiSubs },
        audit("FLEET_AUDITS"),
        audit("QA_AUDITS"),
      ],
    },
    courierDpsPoints: {
      point: 43.74884848484848,
      letterGrade: "F",
      criterionPoints: [
        {
          criterionPoint: 43.74884848484848,
          criterionTranslationKey: "COURIER_TOTAL",
          subCriterionPoints: [
            sub("RED_BASKET", 0, 3.79, 44.44),
            sub("PROBLEMATIC_ORDER", 70.9090909090909, 1.14, 28.89),
            sub("COURIER_DISCIPLINE_INDEX", 87.24, null, 26.67),
          ],
        },
        audit("FLEET_AUDITS"),
      ],
    },
    pickerDpsPoints: {
      point: 92.85239920573258,
      letterGrade: "A+",
      criterionPoints: [
        {
          criterionPoint: 92.85239920573258,
          criterionTranslationKey: "PICKER_TOTAL",
          subCriterionPoints: [
            sub("PICKER_ASSIGN_DURATION", 91.3068181818182, 15.2159090909091, 6.86),
            sub("PROBLEMATIC_ORDER", 70.9090909090909, 1.14, 20),
            sub("COUNTING_PERFORMANCE", 100, null, 17.14),
            sub("BAKERY_PERFORMANCE", 96.79174652508, null, 22.86),
            sub("NEW_IN_WH_DURATION", 100, 0.981936801356167, 16),
            sub("ACCEPTANCE_OF_GOODS", 100, 100, 17.14),
          ],
        },
        audit("QA_AUDITS"),
      ],
    },
    letterGrade_75: "C",
    totalWPSPoint_75: bayiPoint,
    criterionPoints_75: [],
  };
}

function weightedSum(section: DpsSection): number {
  return section.criteria.reduce((s, c) => s + (c.point ?? 0) * (c.weight ?? 0), 0) / 100;
}

test("tek depo cevabı: üç bölüm, puan, harf, kriterler ve denetimler", () => {
  const result = parseDpsCriteria([warehouse(US, "Depo A", null)], US);
  assert.equal(result.empty, false);
  if (result.empty) return;
  const { bayi, kurye, depocu, rank, neighbors } = result.snapshot;

  assert.deepEqual([bayi.point, bayi.letterGrade], [65.2317, "C"]);
  assert.deepEqual([kurye.point, kurye.letterGrade], [43.7488, "F"]);
  assert.deepEqual([depocu.point, depocu.letterGrade], [92.8524, "A+"]);

  assert.equal(bayi.criteria.length, 8);
  assert.deepEqual(bayi.criteria[0], {
    key: "RED_BASKET",
    label: "Kırmızı Sepet",
    point: 0,
    performance: 3.79,
    weight: 25,
  });
  assert.equal(bayi.criteria.find((c) => c.key === "PROBLEMATIC_ORDER")?.label, "Sorunsuz Teslimat");
  assert.equal(bayi.criteria.find((c) => c.key === "COUNTING_PERFORMANCE")?.performance, null);
  assert.deepEqual(
    bayi.audits.map((a) => a.label),
    ["Filo Denetimi", "Kalite Denetimi"]
  );
  assert.deepEqual(kurye.audits.map((a) => a.key), ["FLEET_AUDITS"]);
  assert.deepEqual(depocu.audits.map((a) => a.key), ["QA_AUDITS"]);

  assert.equal(rank, null);
  assert.deepEqual(neighbors, []);
});

test("bölüm puanı, kriter puanlarının ağırlıklı toplamı (Getir'in hesabıyla aynı)", () => {
  const result = parseDpsCriteria([warehouse(US, "Depo A", null)], US);
  if (result.empty) throw new Error("boş");
  const { bayi, kurye, depocu } = result.snapshot;
  assert.ok(Math.abs(weightedSum(bayi) - (bayi.point ?? 0)) < 0.01);
  assert.ok(Math.abs(weightedSum(kurye) - (kurye.point ?? 0)) < 0.01);
  assert.ok(Math.abs(weightedSum(depocu) - (depocu.point ?? 0)) < 0.01);
});

test("sıralamalı cevap: bizim sıramız ve etraftaki depolar sıraya göre", () => {
  const result = parseDpsCriteria(
    [
      warehouse("aaaaaaaaaaaaaaaaaaaaaaaa", "Depo 299", 299, 65.3),
      warehouse(US, "Depo A", 300),
      warehouse("bbbbbbbbbbbbbbbbbbbbbbbb", "Depo 298", 298, 65.31),
      warehouse("cccccccccccccccccccccccc", "Depo 301", 301, 65.17),
      warehouse("dddddddddddddddddddddddd", "Depo 302", 302, 65.03),
    ],
    US
  );
  if (result.empty) throw new Error("boş");
  const { rank, neighbors, bayi } = result.snapshot;
  assert.equal(rank, 300);
  assert.equal(bayi.letterGrade, "C");
  assert.deepEqual(
    neighbors.map((n) => [n.rank, n.name, n.isUs]),
    [
      [298, "Depo 298", false],
      [299, "Depo 299", false],
      [300, "Depo A", true],
      [301, "Depo 301", false],
      [302, "Depo 302", false],
    ]
  );
});

test("boş cevap (Getir günü henüz hesaplamamış) hata değil", () => {
  assert.deepEqual(parseDpsCriteria([], US), { empty: true });
});

test("bilinmeyen kriter anahtarı kendi adıyla gösterilir", () => {
  const w = warehouse(US, "Depo A", null);
  const total = w.pickerDpsPoints.criterionPoints[0];
  if ("subCriterionPoints" in total) total.subCriterionPoints.push(sub("NEW_THING", 50, 10, 0));
  const result = parseDpsCriteria([w], US);
  if (result.empty) throw new Error("boş");
  const last = result.snapshot.depocu.criteria.at(-1);
  assert.deepEqual([last?.key, last?.label], ["NEW_THING", "NEW_THING"]);
});

test("denetim puanları bölüm puanına eklenir (17.09–17.10 cevabının yapısı)", () => {
  // Getir: Bayi 81,15 (kriterler) + Filo 4 + Kalite 3 = 88,15
  const w = warehouse(US, "Depo A", null, 88.15);
  const [total] = w.warehouseDpsPoints.criterionPoints;
  total.criterionPoint = 81.15;
  w.warehouseDpsPoints.criterionPoints = [total, audit("FLEET_AUDITS", 4, 100), audit("QA_AUDITS", 3, 95.8762886597938)];
  const result = parseDpsCriteria([w], US);
  if (result.empty) throw new Error("boş");
  const { bayi } = result.snapshot;
  assert.equal(bayi.performancePoint, 81.15);
  assert.deepEqual(
    bayi.audits.map((a) => [a.label, a.point, a.performance]),
    [
      ["Filo Denetimi", 4, 100],
      ["Kalite Denetimi", 3, 95.8763],
    ]
  );
  const auditSum = bayi.audits.reduce((s, a) => s + (a.point ?? 0), 0);
  assert.ok(Math.abs((bayi.performancePoint ?? 0) + auditSum - (bayi.point ?? 0)) < 0.01);
});

test("beklenmeyen cevaplar açık hata verir", () => {
  assert.throws(() => parseDpsCriteria({ data: [] }, US), DpsParseError);
  assert.throws(() => parseDpsCriteria([warehouse("eeeeeeeeeeeeeeeeeeeeeeee", "Başka", 1)], US), /Soğukkuyu/);
  assert.throws(() => parseDpsCriteria([{ warehouseId: US }], US), /puan alanları/);
});

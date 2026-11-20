/**
 * stock_items kayıtlarına depo kimliği ekler (yol haritası Adım 3).
 *
 * Kullanım:
 *   node --env-file=.env.local scripts/migrate-stock-items-warehouse.mjs           # kuru çalıştırma: yedek alır, sayar, YAZMAZ
 *   node --env-file=.env.local scripts/migrate-stock-items-warehouse.mjs --apply   # yedek alır, eksik kayıtlara Soğukkuyu yazar
 *
 * - Sadece `warehouseId` alanı olmayan kayıtlara dokunur; alanı olanları değiştirmez (tekrar çalıştırmak güvenli).
 * - Başka hiçbir alanı (updatedAt dahil) değiştirmez.
 * - Her çalıştırmada önce `scripts/stock-items-backup-*.json` yedeği yazılır (git'te yok sayılır).
 */
import { initializeApp } from "firebase/app";
import { collection, doc, getDocs, getFirestore, writeBatch } from "firebase/firestore";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOGUKKUYU_WAREHOUSE_ID = "6113e59fbb8549d0f20e65f5";
const COLLECTION = "stock_items";
const BATCH_SIZE = 400;
const apply = process.argv.includes("--apply");

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
});
const db = getFirestore(app);

/** Firestore Timestamp'leri yedekte okunur kalsın diye ISO'ya çevirir */
function serialize(value) {
  if (value && typeof value.toDate === "function") return { __timestamp: value.toDate().toISOString() };
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]));
  }
  return value;
}

function summarize(docs) {
  const byWarehouse = {};
  const byType = {};
  let missing = 0;
  for (const d of docs) {
    const data = d.data();
    const w = typeof data.warehouseId === "string" && data.warehouseId ? data.warehouseId : "(yok)";
    byWarehouse[w] = (byWarehouse[w] || 0) + 1;
    byType[data.type ?? "(yok)"] = (byType[data.type ?? "(yok)"] || 0) + 1;
    if (w === "(yok)") missing++;
  }
  return { total: docs.length, missing, byWarehouse, byType };
}

const snap = await getDocs(collection(db, COLLECTION));
const before = summarize(snap.docs);
console.log("Önce:", JSON.stringify(before));

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = join(dirname(fileURLToPath(import.meta.url)), `stock-items-backup-${stamp}.json`);
writeFileSync(
  backupPath,
  JSON.stringify(
    { collection: COLLECTION, takenAt: new Date().toISOString(), docs: snap.docs.map((d) => ({ id: d.id, data: serialize(d.data()) })) },
    null,
    2
  )
);
console.log(`Yedek yazıldı: ${backupPath} (${snap.size} kayıt)`);

const targets = snap.docs.filter((d) => !(typeof d.data().warehouseId === "string" && d.data().warehouseId));
if (!apply) {
  console.log(`KURU ÇALIŞTIRMA: ${targets.length} kayda warehouseId=${SOGUKKUYU_WAREHOUSE_ID} yazılacaktı. Hiçbir şey yazılmadı.`);
  process.exit(0);
}

let written = 0;
for (let i = 0; i < targets.length; i += BATCH_SIZE) {
  const batch = writeBatch(db);
  for (const d of targets.slice(i, i + BATCH_SIZE)) {
    batch.update(doc(db, COLLECTION, d.id), { warehouseId: SOGUKKUYU_WAREHOUSE_ID });
  }
  await batch.commit();
  written += Math.min(BATCH_SIZE, targets.length - i);
  console.log(`  yazıldı: ${written}/${targets.length}`);
}

const after = summarize((await getDocs(collection(db, COLLECTION))).docs);
console.log("Sonra:", JSON.stringify(after));
console.log(after.missing === 0 ? "DOĞRULAMA TAMAM: warehouseId olmayan kayıt kalmadı." : `UYARI: ${after.missing} kayıtta hâlâ warehouseId yok (araya yeni kayıt girmiş olabilir; betiği tekrar çalıştırın).`);
process.exit(0);

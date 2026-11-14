/**
 * Pişirme istatistikleri Firestore katmanı.
 * `bakery_stats_days/{depoId}_{YYYY-MM-DD}`: o deponun o günkü kaydı (bkz. bakeryStats.ts)
 */
import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDocs,
  limit,
  query,
  runTransaction,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  bakeryStatsDocId,
  mergeBakeryStatsDay,
  sanitizeBakeryStatsDay,
  type BakeryStatsDay,
} from "./bakeryStats";

export const BAKERY_STATS_DAYS_COLLECTION = "bakery_stats_days";

export async function mergeBakeryStatsDays(
  warehouseId: string,
  days: Record<string, BakeryStatsDay>
): Promise<void> {
  for (const [ymd, day] of Object.entries(days)) {
    const ref = doc(db, BAKERY_STATS_DAYS_COLLECTION, bakeryStatsDocId(warehouseId, ymd));
    // Aynı depoda birden çok bilgisayar aynı anda yazabilir: oku-birleştir-yaz tek işlemde
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const base = snap.exists() ? sanitizeBakeryStatsDay(snap.data()) : null;
      const merged = mergeBakeryStatsDay(base, day);
      tx.set(ref, { ...merged, warehouseId, day: ymd, updatedAt: new Date().toISOString() });
    });
  }
}

export async function loadBakeryStatsDays(
  warehouseId: string,
  from: string,
  to: string
): Promise<Record<string, BakeryStatsDay>> {
  const snap = await getDocs(
    query(
      collection(db, BAKERY_STATS_DAYS_COLLECTION),
      where(documentId(), ">=", bakeryStatsDocId(warehouseId, from)),
      where(documentId(), "<=", bakeryStatsDocId(warehouseId, to))
    )
  );
  const out: Record<string, BakeryStatsDay> = {};
  for (const d of snap.docs) {
    const ymd = d.id.slice(warehouseId.length + 1);
    const day = sanitizeBakeryStatsDay(d.data());
    if (day) out[ymd] = day;
  }
  return out;
}

/** Saklama süresinden eski günleri siler (her çağrıda en fazla birkaç doküman) */
export async function pruneBakeryStatsDays(warehouseId: string, cutoffYmd: string): Promise<number> {
  const snap = await getDocs(
    query(
      collection(db, BAKERY_STATS_DAYS_COLLECTION),
      where(documentId(), ">=", `${warehouseId}_`),
      where(documentId(), "<", bakeryStatsDocId(warehouseId, cutoffYmd)),
      limit(20)
    )
  );
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  return snap.size;
}

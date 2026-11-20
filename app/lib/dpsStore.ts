/**
 * DPS puanları Firestore önbelleği: `dps_scores/{from}_{to}`.
 * Veri sabit kabul edilir; kaydedilen aralık bir daha Getir'den çekilmez.
 */
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { db } from "./firebase";
import type { DpsRankEntry, DpsSection, DpsSnapshot } from "./dpsParse";
import { dpsDocId } from "./dpsRange";
import { DEFAULT_PANEL_WAREHOUSE_ID } from "./franchiseWarehouses";

export const DPS_SCORES_COLLECTION = "dps_scores";

export interface StoredDpsScore extends DpsSnapshot {
  from: string;
  to: string;
  /** Hangi depoya ait; eski Soğukkuyu kayıtlarında yok */
  warehouseId?: string;
  /** Sıralamalı istekle çekildi mi (rank / neighbors dolu) */
  ranked: boolean;
  fetchedAt: string;
}

function scoreRef(from: string, to: string, warehouseId?: string) {
  return doc(db, DPS_SCORES_COLLECTION, dpsDocId(from, to, warehouseId));
}

function isSection(v: unknown): v is DpsSection {
  return !!v && typeof v === "object" && Array.isArray((v as DpsSection).criteria);
}

function parseStored(data: unknown): StoredDpsScore | null {
  const o = data as Partial<StoredDpsScore> | null;
  if (!o || typeof o.from !== "string" || typeof o.to !== "string") return null;
  if (!isSection(o.bayi) || !isSection(o.kurye) || !isSection(o.depocu)) return null;
  return {
    from: o.from,
    to: o.to,
    warehouseId: typeof o.warehouseId === "string" ? o.warehouseId : undefined,
    bayi: o.bayi,
    kurye: o.kurye,
    depocu: o.depocu,
    rank: typeof o.rank === "number" ? o.rank : null,
    neighbors: Array.isArray(o.neighbors) ? (o.neighbors as DpsRankEntry[]) : [],
    ranked: o.ranked === true,
    fetchedAt: typeof o.fetchedAt === "string" ? o.fetchedAt : "",
  };
}

export async function readDpsScore(
  from: string,
  to: string,
  warehouseId?: string
): Promise<StoredDpsScore | null> {
  const snap = await getDoc(scoreRef(from, to, warehouseId));
  return snap.exists() ? parseStored(snap.data()) : null;
}

/** Kayıt `score.warehouseId` deposunun kimliğine yazılır (yoksa Soğukkuyu) */
export async function writeDpsScore(score: StoredDpsScore): Promise<void> {
  await setDoc(scoreRef(score.from, score.to, score.warehouseId), score);
}

/** Bitiş tarihi `cutoffYmd`'den önce olan kayıtları siler. @returns silinen kayıt sayısı */
export async function deleteDpsScoresBefore(cutoffYmd: string): Promise<number> {
  const snap = await getDocs(query(collection(db, DPS_SCORES_COLLECTION), where("to", "<", cutoffYmd)));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  return snap.size;
}

export interface DpsScoreResult {
  /** Getir o aralığı henüz hesaplamadı (kaydedilmez) */
  empty: boolean;
  score: StoredDpsScore | null;
  source: "cache" | "getir" | null;
}

/**
 * Panel tarafı: önce Firestore'a bakar (kayıtlı aralıkta sunucu hiç çalışmaz),
 * yoksa `/api/dps` ucu Getir'den çekip kaydeder.
 * @param ranked Tek günlük aralıkta sıralama da gereksin
 * @throws Error Uç hata dönerse (mesaj kullanıcıya gösterilecek biçimde)
 */
export async function getDpsScore(
  from: string,
  to: string,
  options: { ranked?: boolean; warehouseId?: string } = {}
): Promise<DpsScoreResult> {
  const wantRank = options.ranked === true && from === to;
  const warehouseId = options.warehouseId ?? DEFAULT_PANEL_WAREHOUSE_ID;
  const cached = await readDpsScore(from, to, warehouseId).catch(() => null);
  if (cached && (!wantRank || cached.ranked)) {
    return { empty: false, score: cached, source: "cache" };
  }
  const params = new URLSearchParams({ from, to, warehouseId });
  if (wantRank) params.set("rank", "1");
  const res = await fetch(`/api/dps?${params}`);
  const data = (await res.json().catch(() => null)) as
    | { success: boolean; error?: string; empty?: boolean; score?: StoredDpsScore; source?: "cache" | "getir" }
    | null;
  if (!res.ok || !data?.success) {
    throw new Error(data?.error ?? "DPS puanları alınamadı.");
  }
  return { empty: data.empty === true, score: data.score ?? null, source: data.source ?? null };
}

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  GETIR_TOKEN_COLLECTION,
  ACTIVE_FRANCHISE_TOKEN_DOC_ID,
  ACTIVE_WAREHOUSE_TOKEN_DOC_ID,
  ACTIVE_TOKEN_DOC_ID,
  ACTIVE_WAREHOUSE_ID_DOC_ID,
  warehouseTokenDocId,
  type GetirToken,
  type GetirTokenType,
} from "./types";
import {
  DEFAULT_PANEL_WAREHOUSE_ID,
  SOGUKKUYU_WAREHOUSE_ID,
  isFranchiseWarehouseId,
} from "./franchiseWarehouses";

/** Depo kimliği panelde tanımlı değilse hata fırlatır (yanlış depoya token yazmayı/okumayı önler) */
function assertPanelWarehouseId(warehouseId: string): void {
  if (!isFranchiseWarehouseId(warehouseId)) {
    throw new Error(`Geçersiz depo ID: ${warehouseId}`);
  }
}

/** Token dokümanını yazar; varsa günceller (createdAt korunur), yoksa oluşturur */
async function upsertTokenDoc(
  docId: string,
  token: string,
  type: GetirTokenType,
  now: string
): Promise<void> {
  const tokenDocRef = doc(db, GETIR_TOKEN_COLLECTION, docId);
  const existingDoc = await getDoc(tokenDocRef);
  if (existingDoc.exists()) {
    await setDoc(tokenDocRef, { token, type, updatedAt: now }, { merge: true });
  } else {
    await setDoc(tokenDocRef, { token, type, createdAt: now, updatedAt: now });
  }
}

/**
 * Timestamp'i ISO string'e çevir
 */
function timestampToString(timestamp: Timestamp | null | undefined): string | undefined {
  if (!timestamp) return undefined;
  return timestamp.toDate().toISOString();
}

/**
 * Getir token'ı Firestore'a kaydeder (singleton pattern - her tip için ayrı doküman)
 * @param token Bearer token (eyJ...)
 * @param type Token tipi: "franchise" (bayi paneli) veya "warehouse" (depo paneli). Varsayılan: "franchise"
 * @param warehouseId Depo paneli token'ı hangi depoya ait (yalnızca type "warehouse"). Verilmezse
 *   Soğukkuyu: depo kimliği göndermeyen eski eklenti Soğukkuyu'dur.
 * @returns Promise<void>
 */
export async function saveGetirToken(
  token: string,
  type: GetirTokenType = "franchise",
  warehouseId?: string
): Promise<void> {
  try {
    const now = new Date().toISOString();

    if (type === "warehouse") {
      const targetId = warehouseId ?? SOGUKKUYU_WAREHOUSE_ID;
      assertPanelWarehouseId(targetId);
      await upsertTokenDoc(warehouseTokenDocId(targetId), token, type, now);
      // Eski tek kayıt yalnızca Soğukkuyu'ya aittir: eski okuyucular ve geri dönüş için hâlâ yazılır
      if (targetId === SOGUKKUYU_WAREHOUSE_ID) {
        await upsertTokenDoc(ACTIVE_WAREHOUSE_TOKEN_DOC_ID, token, type, now);
      }
      return;
    }

    await upsertTokenDoc(ACTIVE_FRANCHISE_TOKEN_DOC_ID, token, type, now);

    // Geriye dönük uyumluluk: Eski "active" dokümanını da güncelle (sadece franchise için)
    if (type === "franchise") {
      const legacyDocRef = doc(db, GETIR_TOKEN_COLLECTION, ACTIVE_TOKEN_DOC_ID);
      await setDoc(
        legacyDocRef,
        {
          token,
          type,
          updatedAt: now,
        },
        { merge: true }
      );
    }
  } catch (error) {
    console.error("Getir token kaydedilemedi:", error);
    throw error;
  }
}

/**
 * Firestore'dan aktif Getir token'ı okur (bayi paneli için - geriye dönük uyumluluk)
 * @returns Promise<string | null> Token varsa token string'i, yoksa null
 */
export async function getGetirToken(): Promise<string | null> {
  return getGetirFranchiseToken();
}

/**
 * Firestore'dan aktif Getir bayi paneli token'ı okur
 * @returns Promise<string | null> Token varsa token string'i, yoksa null
 */
export async function getGetirFranchiseToken(): Promise<string | null> {
  try {
    // Önce yeni dokümanı kontrol et
    const tokenDocRef = doc(db, GETIR_TOKEN_COLLECTION, ACTIVE_FRANCHISE_TOKEN_DOC_ID);
    const tokenDoc = await getDoc(tokenDocRef);
    
    if (tokenDoc.exists()) {
      const data = tokenDoc.data();
      return data?.token || null;
    }
    
    // Geriye dönük uyumluluk: Eski "active" dokümanını kontrol et
    const legacyDocRef = doc(db, GETIR_TOKEN_COLLECTION, ACTIVE_TOKEN_DOC_ID);
    const legacyDoc = await getDoc(legacyDocRef);
    
    if (legacyDoc.exists()) {
      const data = legacyDoc.data();
      return data?.token || null;
    }
    
    return null;
  } catch (error) {
    console.error("Getir bayi paneli token okunamadı:", error);
    throw error;
  }
}

/**
 * Firestore'dan bir deponun depo paneli token'ını okur.
 * Soğukkuyu için depo başına kayıt yoksa eski tek kayda düşer; diğer depolar (Bostanlı) asla
 * Soğukkuyu'nun token'ını kullanmaz — kendi kaydı yoksa `null` döner.
 * @param warehouseId Panelde tanımlı depo (varsayılan Soğukkuyu)
 * @returns Promise<string | null> Token varsa token string'i, yoksa null
 */
export async function getGetirWarehouseToken(
  warehouseId: string = DEFAULT_PANEL_WAREHOUSE_ID
): Promise<string | null> {
  assertPanelWarehouseId(warehouseId);
  try {
    const tokenDoc = await getDoc(doc(db, GETIR_TOKEN_COLLECTION, warehouseTokenDocId(warehouseId)));
    if (tokenDoc.exists() && tokenDoc.data()?.token) {
      return tokenDoc.data().token;
    }

    if (warehouseId !== SOGUKKUYU_WAREHOUSE_ID) return null;
    const legacyDoc = await getDoc(doc(db, GETIR_TOKEN_COLLECTION, ACTIVE_WAREHOUSE_TOKEN_DOC_ID));
    return legacyDoc.exists() ? legacyDoc.data()?.token || null : null;
  } catch (error) {
    console.error("Getir depo paneli token okunamadı:", error);
    throw error;
  }
}

/**
 * Getir token dokümanını tam olarak okur (metadata ile birlikte)
 * @returns Promise<GetirToken | null>
 */
export async function getGetirTokenDocument(): Promise<GetirToken | null> {
  try {
    const tokenDocRef = doc(db, GETIR_TOKEN_COLLECTION, ACTIVE_TOKEN_DOC_ID);
    const tokenDoc = await getDoc(tokenDocRef);
    
    if (!tokenDoc.exists()) {
      return null;
    }
    
    const data = tokenDoc.data();
    return {
      token: data.token || "",
      createdAt: timestampToString(data.createdAt) || new Date().toISOString(),
      updatedAt: timestampToString(data.updatedAt),
      isValid: data.isValid,
      lastUsedAt: timestampToString(data.lastUsedAt),
    };
  } catch (error) {
    console.error("Getir token dokümanı okunamadı:", error);
    throw error;
  }
}

/**
 * Token'ın geçerliliğini kontrol eder (Getir API'sine test isteği atar)
 * @param token Bearer token (opsiyonel, verilmezse Firestore'dan alınır)
 * @returns Promise<boolean> Token geçerliyse true, değilse false
 */
export async function checkTokenValidity(token?: string): Promise<boolean> {
  try {
    // Token verilmediyse Firestore'dan al
    const tokenToCheck = token || (await getGetirToken());
    
    if (!tokenToCheck) {
      return false;
    }
    
    // Getir API'sine test isteği at
    const response = await fetch(
      "https://franchise-api-gateway.getirapi.com/stocks",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${tokenToCheck}`,
        },
      }
    );
    
    // 200 OK veya 404 Not Found geçerli sayılır (token çalışıyor demektir)
    // 401 Unauthorized veya 403 Forbidden geçersiz demektir
    const isValid = response.status === 200 || response.status === 404;
    
    // Sonucu Firestore'da güncelle
    if (!token) {
      // Token Firestore'dan alındıysa, isValid field'ını güncelle
      const tokenDocRef = doc(db, GETIR_TOKEN_COLLECTION, ACTIVE_TOKEN_DOC_ID);
      await setDoc(
        tokenDocRef,
        {
          isValid,
          lastUsedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }
    
    return isValid;
  } catch (error) {
    console.error("Token geçerlilik kontrolü hatası:", error);
    return false;
  }
}

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

export function isValidWarehouseObjectId(id: string): boolean {
  return OBJECT_ID_RE.test(id.trim());
}

/**
 * Eski eklentinin yakaladığı depo ID'sini Firestore'a kaydeder (artık hiçbir okuyucusu yok;
 * depo kimliği token ile birlikte gelir). Yalnızca eski eklentilerin çağrısı bozulmasın diye durur.
 */
export async function saveGetirWarehouseId(warehouseId: string): Promise<void> {
  const trimmed = warehouseId.trim();
  if (!isValidWarehouseObjectId(trimmed)) {
    throw new Error("Geçersiz depo ID formatı");
  }

  const now = new Date().toISOString();
  const ref = doc(db, GETIR_TOKEN_COLLECTION, ACTIVE_WAREHOUSE_ID_DOC_ID);
  const existing = await getDoc(ref);

  if (existing.exists()) {
    await setDoc(
      ref,
      { warehouseId: trimmed, updatedAt: now },
      { merge: true }
    );
  } else {
    await setDoc(ref, {
      warehouseId: trimmed,
      createdAt: now,
      updatedAt: now,
    });
  }
}

/**
 * Depo paneli API çağrıları için depo ID'si: çağrının yapıldığı depo (varsayılan Soğukkuyu).
 * Eskiden eklentinin son yakaladığı kayıt okunurdu; iki depo birbirinin kaydını ezmesin diye
 * artık depo her çağrıda açıkça verilir ve Firestore okuması da gerekmez.
 */
export async function getActiveWarehouseId(
  warehouseId: string = DEFAULT_PANEL_WAREHOUSE_ID
): Promise<string> {
  assertPanelWarehouseId(warehouseId);
  return warehouseId;
}


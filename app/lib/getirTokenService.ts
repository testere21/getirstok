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
  DEFAULT_WAREHOUSE_ID,
  type GetirToken,
  type GetirTokenType,
} from "./types";

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
 * @returns Promise<void>
 */
export async function saveGetirToken(token: string, type: GetirTokenType = "franchise"): Promise<void> {
  try {
    // Token tipine göre doküman ID'sini belirle
    const docId = type === "warehouse" 
      ? ACTIVE_WAREHOUSE_TOKEN_DOC_ID 
      : ACTIVE_FRANCHISE_TOKEN_DOC_ID;
    
    const tokenDocRef = doc(db, GETIR_TOKEN_COLLECTION, docId);
    
    // Mevcut dokümanı kontrol et
    const existingDoc = await getDoc(tokenDocRef);
    const now = new Date().toISOString();
    
    if (existingDoc.exists()) {
      // Doküman varsa güncelle
      await setDoc(
        tokenDocRef,
        {
          token,
          type,
          updatedAt: now,
          // createdAt'i koru, sadece updatedAt'i güncelle
        },
        { merge: true }
      );
    } else {
      // Doküman yoksa oluştur
      await setDoc(tokenDocRef, {
        token,
        type,
        createdAt: now,
        updatedAt: now,
      });
    }
    
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
 * Firestore'dan aktif Getir depo paneli token'ı okur
 * @returns Promise<string | null> Token varsa token string'i, yoksa null
 */
export async function getGetirWarehouseToken(): Promise<string | null> {
  try {
    const tokenDocRef = doc(db, GETIR_TOKEN_COLLECTION, ACTIVE_WAREHOUSE_TOKEN_DOC_ID);
    const tokenDoc = await getDoc(tokenDocRef);
    
    if (!tokenDoc.exists()) {
      return null;
    }
    
    const data = tokenDoc.data();
    return data?.token || null;
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
 * Eklentinin yakaladığı aktif depo ID'sini Firestore'a kaydeder.
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
 * Firestore'daki yakalanmış depo ID'si. Yoksa null.
 */
export async function getSavedGetirWarehouseId(): Promise<string | null> {
  try {
    const ref = doc(db, GETIR_TOKEN_COLLECTION, ACTIVE_WAREHOUSE_ID_DOC_ID);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const id = String(snap.data()?.warehouseId || "").trim();
    return isValidWarehouseObjectId(id) ? id : null;
  } catch (error) {
    console.error("Getir depo ID okunamadı:", error);
    throw error;
  }
}

/**
 * Stok/depo API çağrıları için depo ID: önce eklentinin kaydı, yoksa yedek sabit.
 */
export async function getActiveWarehouseId(): Promise<string> {
  const saved = await getSavedGetirWarehouseId();
  return saved || DEFAULT_WAREHOUSE_ID;
}


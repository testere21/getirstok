import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import type { Timestamp } from "firebase/firestore";
import { db } from "./firebase";
import {
  EXPIRING_PRODUCTS_COLLECTION,
  type ExpiringProduct,
  type ExpiringProductWithId,
} from "./types";

/** Ekleme için parametreler */
export interface AddExpiringProductParams {
  barcode: string;
  productName: string;
  expiryDate: string; // ISO format: YYYY-MM-DD
  removalDate: string; // ISO format: YYYY-MM-DD
}

/** Güncelleme için kısmi alanlar */
export interface UpdateExpiringProductParams {
  productName?: string;
  expiryDate?: string; // ISO format: YYYY-MM-DD
  removalDate?: string; // ISO format: YYYY-MM-DD
  isNotified?: boolean;
}

/**
 * Yeni yaklaşan SKT kaydı ekler.
 * @returns Eklenen dokümanın ID'si
 */
export async function addExpiringProduct(
  params: AddExpiringProductParams
): Promise<string> {
  const { barcode, productName, expiryDate, removalDate } = params;
  try {
    const now = new Date().toISOString();
    const collectionRef = collection(db, EXPIRING_PRODUCTS_COLLECTION);
    const docRef = await addDoc(collectionRef, {
      barcode: barcode.trim(),
      productName: productName.trim(),
      expiryDate: expiryDate.trim(),
      removalDate: removalDate.trim(),
      createdAt: now,
      updatedAt: now,
    } as ExpiringProduct);

    console.log("✅ Yaklaşan SKT kaydı Firestore'a eklendi:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("❌ Yaklaşan SKT kaydı eklenirken hata:", error);
    throw new Error(
      `Yaklaşan SKT kaydı eklenirken bir hata oluştu: ${
        error instanceof Error ? error.message : "Bilinmeyen hata"
      }`
    );
  }
}

/**
 * Mevcut yaklaşan SKT kaydını günceller.
 */
export async function updateExpiringProduct(
  id: string,
  fields: UpdateExpiringProductParams
): Promise<void> {
  if (!id || typeof id !== "string" || id.trim().length === 0) {
    throw new Error("Geçersiz id");
  }
  const docRef = doc(db, EXPIRING_PRODUCTS_COLLECTION, id);
  try {
    const existingSnap = await getDoc(docRef);
    if (!existingSnap.exists()) {
      throw new Error("Yaklaşan SKT kaydı bulunamadı");
    }

    const updateData: Partial<ExpiringProduct> = {
      ...fields,
      updatedAt: new Date().toISOString(),
    };

    // Boş string'leri temizle
    if (updateData.productName !== undefined) {
      updateData.productName = updateData.productName.trim();
    }
    if (updateData.expiryDate !== undefined) {
      updateData.expiryDate = updateData.expiryDate.trim();
    }
    if (updateData.removalDate !== undefined) {
      updateData.removalDate = updateData.removalDate.trim();
    }

    await updateDoc(docRef, updateData as Record<string, unknown>);
    console.log("✏️ Yaklaşan SKT kaydı Firestore'da güncellendi:", id);
  } catch (error) {
    console.error("❌ Yaklaşan SKT kaydı güncellenirken hata:", error);
    throw new Error(
      `Yaklaşan SKT kaydı güncellenirken bir hata oluştu: ${
        error instanceof Error ? error.message : "Bilinmeyen hata"
      }`
    );
  }
}

function mapExpiringProductDoc(
  id: string,
  data: Record<string, unknown>
): ExpiringProductWithId {
  return {
    id,
    barcode: (data.barcode as string) ?? "",
    productName: (data.productName as string) ?? "",
    expiryDate: (data.expiryDate as string) ?? "",
    removalDate: (data.removalDate as string) ?? "",
    createdAt: (data.createdAt as string) ?? new Date().toISOString(),
    updatedAt: data.updatedAt as string | undefined,
    isNotified: (data.isNotified as boolean) ?? false,
  };
}

export async function getExpiringProductById(
  id: string
): Promise<ExpiringProductWithId | null> {
  if (!id || typeof id !== "string" || id.trim().length === 0) {
    throw new Error("Geçersiz id");
  }
  const docRef = doc(db, EXPIRING_PRODUCTS_COLLECTION, id.trim());
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return mapExpiringProductDoc(snap.id, snap.data() as Record<string, unknown>);
}

/**
 * Yaklaşan SKT kaydını siler.
 */
export async function deleteExpiringProduct(id: string): Promise<void> {
  const docRef = doc(db, EXPIRING_PRODUCTS_COLLECTION, id);
  try {
    await deleteDoc(docRef);
    console.log("🗑️ Yaklaşan SKT kaydı Firestore'dan silindi:", id);
  } catch (error) {
    console.error("❌ Yaklaşan SKT kaydı silinirken hata:", error);
    throw new Error(
      `Yaklaşan SKT kaydı silinirken bir hata oluştu: ${
        error instanceof Error ? error.message : "Bilinmeyen hata"
      }`
    );
  }
}

/**
 * Tüm yaklaşan SKT kayıtlarını getirir.
 */
export async function getExpiringProducts(): Promise<ExpiringProductWithId[]> {
  try {
    const collectionRef = collection(db, EXPIRING_PRODUCTS_COLLECTION);
    const snapshot = await getDocs(collectionRef);

    const products: ExpiringProductWithId[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      products.push({
        id: doc.id,
        barcode: data.barcode ?? "",
        productName: data.productName ?? "",
        expiryDate: data.expiryDate ?? "",
        removalDate: data.removalDate ?? "",
        createdAt: data.createdAt ?? new Date().toISOString(),
        updatedAt: data.updatedAt,
        isNotified: data.isNotified ?? false,
      });
    });

    return products;
  } catch (error) {
    console.error("❌ Yaklaşan SKT kayıtları getirilirken hata:", error);
    throw new Error(
      `Yaklaşan SKT kayıtları getirilirken bir hata oluştu: ${
        error instanceof Error ? error.message : "Bilinmeyen hata"
      }`
    );
  }
}

/**
 * Belirli bir tarihte çıkılması gereken ürünleri getirir.
 * @param date ISO format: YYYY-MM-DD
 */
export async function getExpiringProductsByRemovalDate(
  date: string
): Promise<ExpiringProductWithId[]> {
  try {
    const collectionRef = collection(db, EXPIRING_PRODUCTS_COLLECTION);
    const q = query(collectionRef, where("removalDate", "==", date.trim()));
    const snapshot = await getDocs(q);

    const products: ExpiringProductWithId[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      products.push({
        id: doc.id,
        barcode: data.barcode ?? "",
        productName: data.productName ?? "",
        expiryDate: data.expiryDate ?? "",
        removalDate: data.removalDate ?? "",
        createdAt: data.createdAt ?? new Date().toISOString(),
        updatedAt: data.updatedAt,
        isNotified: data.isNotified ?? false,
      });
    });

    return products;
  } catch (error) {
    console.error("❌ Yaklaşan SKT kayıtları tarihe göre getirilirken hata:", error);
    throw new Error(
      `Yaklaşan SKT kayıtları getirilirken bir hata oluştu: ${
        error instanceof Error ? error.message : "Bilinmeyen hata"
      }`
    );
  }
}

/**
 * Belirli bir barkod için yaklaşan SKT kaydı var mı kontrol eder.
 * @returns Kayıt varsa ExpiringProductWithId, yoksa null
 */
export async function getExpiringProductByBarcode(
  barcode: string
): Promise<ExpiringProductWithId | null> {
  try {
    const collectionRef = collection(db, EXPIRING_PRODUCTS_COLLECTION);
    const q = query(collectionRef, where("barcode", "==", barcode.trim()));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();
    return {
      id: doc.id,
      barcode: data.barcode ?? "",
      productName: data.productName ?? "",
      expiryDate: data.expiryDate ?? "",
      removalDate: data.removalDate ?? "",
      createdAt: data.createdAt ?? new Date().toISOString(),
      updatedAt: data.updatedAt,
      isNotified: data.isNotified ?? false,
    };
  } catch (error) {
    console.error("❌ Yaklaşan SKT kaydı barkod ile getirilirken hata:", error);
    throw new Error(
      `Yaklaşan SKT kaydı getirilirken bir hata oluştu: ${
        error instanceof Error ? error.message : "Bilinmeyen hata"
      }`
    );
  }
}


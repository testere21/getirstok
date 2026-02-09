/**
 * Barkod -> Ürün ID mapping servisi
 * Firestore'da barkod ve Getir ürün ID'si arasındaki eşleşmeyi saklar
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  Firestore,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  BARCODE_PRODUCT_MAPPING_COLLECTION,
  BarcodeProductMapping,
  BarcodeProductMappingWithId,
} from "./types";

/**
 * Barkod ile ürün ID'sini bulur
 * @param barcode Ürün barkodu
 * @returns Promise<string | null> Ürün ID'si (bulunamazsa null)
 */
export async function getProductIdByBarcode(
  barcode: string
): Promise<string | null> {
  try {
    const normalizedBarcode = barcode.trim();

    if (!normalizedBarcode) {
      return null;
    }

    const mappingRef = collection(db, BARCODE_PRODUCT_MAPPING_COLLECTION);
    const q = query(mappingRef, where("barcode", "==", normalizedBarcode));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.log(
        `[Barcode Mapping] Product ID not found for barcode: ${normalizedBarcode}`
      );
      return null;
    }

    const doc = querySnapshot.docs[0];
    const data = doc.data() as BarcodeProductMapping;

    console.log(
      `[Barcode Mapping] Product ID found: ${data.productId} for barcode: ${normalizedBarcode}`
    );
    return data.productId;
  } catch (error) {
    console.error("[Barcode Mapping] Error getting product ID:", error);
    return null;
  }
}

/**
 * Barkod -> Ürün ID mapping'i kaydeder veya günceller
 * @param barcode Ürün barkodu
 * @param productId Getir ürün ID'si
 * @param productName Ürün adı (opsiyonel)
 */
export async function saveBarcodeMapping(
  barcode: string,
  productId: string,
  productName?: string
): Promise<void> {
  try {
    const normalizedBarcode = barcode.trim();

    if (!normalizedBarcode || !productId) {
      throw new Error("Barcode and productId are required");
    }

    // Mevcut mapping'i kontrol et
    const existingId = await getProductIdByBarcode(normalizedBarcode);

    if (existingId) {
      // Güncelle
      const mappingRef = collection(db, BARCODE_PRODUCT_MAPPING_COLLECTION);
      const q = query(mappingRef, where("barcode", "==", normalizedBarcode));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const docRef = doc(db, BARCODE_PRODUCT_MAPPING_COLLECTION, querySnapshot.docs[0].id);
        await setDoc(
          docRef,
          {
            barcode: normalizedBarcode,
            productId: productId,
            productName: productName,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
        console.log(
          `[Barcode Mapping] Updated mapping: ${normalizedBarcode} -> ${productId}`
        );
        return;
      }
    }

    // Yeni mapping oluştur
    const mappingRef = collection(db, BARCODE_PRODUCT_MAPPING_COLLECTION);
    const newDocRef = doc(mappingRef);

    await setDoc(newDocRef, {
      barcode: normalizedBarcode,
      productId: productId,
      productName: productName,
      createdAt: new Date().toISOString(),
    });

    console.log(
      `[Barcode Mapping] Created mapping: ${normalizedBarcode} -> ${productId}`
    );
  } catch (error) {
    console.error("[Barcode Mapping] Error saving mapping:", error);
    throw error;
  }
}

/**
 * Tüm mapping'leri getirir
 * @returns Promise<BarcodeProductMappingWithId[]>
 */
export async function getAllBarcodeMappings(): Promise<
  BarcodeProductMappingWithId[]
> {
  try {
    const mappingRef = collection(db, BARCODE_PRODUCT_MAPPING_COLLECTION);
    const querySnapshot = await getDocs(mappingRef);

    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as BarcodeProductMapping),
    }));
  } catch (error) {
    console.error("[Barcode Mapping] Error getting all mappings:", error);
    return [];
  }
}

/**
 * Toplu mapping kaydetme (7800 ürün için)
 * @param mappings Barkod -> Ürün ID mapping'leri
 */
export async function saveBarcodeMappingsBatch(
  mappings: Array<{ barcode: string; productId: string; productName?: string }>
): Promise<void> {
  try {
    console.log(
      `[Barcode Mapping] Saving ${mappings.length} mappings in batch...`
    );

    // Firestore batch write limit: 500
    const batchSize = 500;
    let processed = 0;

    for (let i = 0; i < mappings.length; i += batchSize) {
      const batch = mappings.slice(i, i + batchSize);

      await Promise.all(
        batch.map((mapping) =>
          saveBarcodeMapping(
            mapping.barcode,
            mapping.productId,
            mapping.productName
          )
        )
      );

      processed += batch.length;
      console.log(
        `[Barcode Mapping] Processed ${processed}/${mappings.length} mappings...`
      );
    }

    console.log(`[Barcode Mapping] All ${mappings.length} mappings saved!`);
  } catch (error) {
    console.error("[Barcode Mapping] Error saving batch mappings:", error);
    throw error;
  }
}


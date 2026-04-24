/**
 * Firestore `supplemental_catalog_products` ↔ panel `CatalogProduct` birleştirmesi.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  SUPPLEMENTAL_CATALOG_PRODUCTS_COLLECTION,
  type CatalogProduct,
  type SupplementalCatalogProduct,
} from "./types";

export function normalizeCatalogBarcodeKey(barcode: string): string {
  return barcode.trim().replace(/\s/g, "");
}

function supplementalDocToCatalogProduct(
  data: SupplementalCatalogProduct
): CatalogProduct {
  return {
    name: data.name,
    barcode: data.barcode,
    imageUrl: data.imageUrl,
    productId: data.productId,
  };
}

export async function fetchAllSupplementalCatalogAsCatalogProducts(): Promise<
  CatalogProduct[]
> {
  const ref = collection(db, SUPPLEMENTAL_CATALOG_PRODUCTS_COLLECTION);
  const snap = await getDocs(ref);
  const out: CatalogProduct[] = [];
  snap.forEach((d) => {
    const data = d.data() as SupplementalCatalogProduct;
    if (data?.barcode && data?.name) {
      out.push(supplementalDocToCatalogProduct(data));
    }
  });
  return out;
}

/**
 * Aynı barkotta Firestore ek kaydı `products.json` satırının üzerine yazar.
 */
export function mergeProductsJsonWithSupplemental(
  jsonProducts: CatalogProduct[],
  supplemental: CatalogProduct[]
): CatalogProduct[] {
  const map = new Map<string, CatalogProduct>();

  for (const p of jsonProducts) {
    const k = normalizeCatalogBarcodeKey(p.barcode);
    if (!k) continue;
    map.set(k, { ...p });
  }

  for (const s of supplemental) {
    const k = normalizeCatalogBarcodeKey(s.barcode);
    if (!k) continue;
    const prev = map.get(k);
    map.set(k, prev ? { ...prev, ...s } : { ...s });
  }

  return Array.from(map.values());
}

export async function upsertSupplementalCatalogProduct(
  product: CatalogProduct
): Promise<void> {
  const key = normalizeCatalogBarcodeKey(product.barcode);
  if (!key || key.length < 6) {
    throw new Error("upsertSupplementalCatalogProduct: geçersiz barkod");
  }

  const ref = doc(db, SUPPLEMENTAL_CATALOG_PRODUCTS_COLLECTION, key);
  const existing = await getDoc(ref);
  const now = new Date().toISOString();
  const prev = existing.exists()
    ? (existing.data() as SupplementalCatalogProduct)
    : null;

  const payload: SupplementalCatalogProduct = {
    name: product.name.trim(),
    barcode: product.barcode.trim(),
    imageUrl: product.imageUrl,
    productId: product.productId,
    source: "warehouse_shelf_label",
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };

  await setDoc(ref, payload, { merge: true });
}

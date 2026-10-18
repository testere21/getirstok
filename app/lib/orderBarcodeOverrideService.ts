/**
 * Sipariş detayında (eklenti) elle düzeltilen barkodlar: ürün adı → barkod.
 * Katalogda olmayan ya da yanlış eşleşen ürünler için; eklenti otomatik bulduğu barkodun yerine bunu kullanır.
 * Tek doküman: `order_barcode_overrides/all` → `{ items: { [nameKey]: { name, barcode, updatedAt } } }`
 */
import { deleteField, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

const OVERRIDES_COLLECTION = "order_barcode_overrides";
const OVERRIDES_DOC_ID = "all";

export interface OrderBarcodeOverride {
  name: string;
  barcode: string;
  updatedAt: string;
}

/** Eklentideki anahtarla aynı olmalı: tek boşluk + Türkçe küçük harf */
export function orderBarcodeNameKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR");
}

const BARCODE_RE = /^\d{4,20}$/;

export function isValidOverrideBarcode(barcode: string): boolean {
  return BARCODE_RE.test(barcode);
}

function overridesRef() {
  return doc(db, OVERRIDES_COLLECTION, OVERRIDES_DOC_ID);
}

export async function readOrderBarcodeOverrides(): Promise<Record<string, OrderBarcodeOverride>> {
  const snap = await getDoc(overridesRef());
  const items = snap.exists() ? (snap.data()?.items as unknown) : null;
  if (!items || typeof items !== "object") return {};
  const out: Record<string, OrderBarcodeOverride> = {};
  for (const [key, value] of Object.entries(items as Record<string, unknown>)) {
    const v = value as Partial<OrderBarcodeOverride> | null;
    if (v && typeof v.name === "string" && typeof v.barcode === "string") {
      out[key] = { name: v.name, barcode: v.barcode, updatedAt: typeof v.updatedAt === "string" ? v.updatedAt : "" };
    }
  }
  return out;
}

/** `barcode` null ise düzeltme silinir (eklenti tekrar otomatik bulduğunu kullanır). */
export async function setOrderBarcodeOverride(name: string, barcode: string | null): Promise<string> {
  const key = orderBarcodeNameKey(name);
  await setDoc(
    overridesRef(),
    {
      items: {
        [key]:
          barcode == null
            ? deleteField()
            : { name: name.replace(/\s+/g, " ").trim(), barcode, updatedAt: new Date().toISOString() },
      },
    },
    { merge: true }
  );
  return key;
}

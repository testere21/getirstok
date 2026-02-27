import {
  addDoc,
  collection,
  type CollectionReference,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  PRODUCT_ISSUE_REPORTS_COLLECTION,
  type ProductIssueReport,
  type ProductIssueType,
} from "./types";

export interface CreateProductIssueParams {
  barcode: string;
  productName?: string;
  type: ProductIssueType;
  note?: string;
  source?: string;
  telegramSent: boolean;
  telegramError?: string;
}

const productIssueCollection = collection(
  db,
  PRODUCT_ISSUE_REPORTS_COLLECTION
) as CollectionReference<ProductIssueReport>;

export async function createProductIssueReport(
  params: CreateProductIssueParams
): Promise<string> {
  const now = new Date().toISOString();

  // Firestore undefined kabul etmez; sadece tanımlı alanları ekliyoruz (tip ProductIssueReport ile uyumlu)
  const data: ProductIssueReport = {
    barcode: params.barcode.trim(),
    type: params.type,
    createdAt: now,
    telegramSent: params.telegramSent,
  };
  const optProductName =
    params.productName != null && params.productName.trim() !== ""
      ? params.productName.trim()
      : null;
  const optNote =
    params.note != null && params.note.trim() !== "" ? params.note.trim() : null;
  const optSource =
    params.source != null && params.source.trim() !== ""
      ? params.source.trim()
      : null;
  const optTelegramError =
    params.telegramError != null && params.telegramError !== ""
      ? params.telegramError
      : null;
  if (optProductName != null) data.productName = optProductName;
  if (optNote != null) data.note = optNote;
  if (optSource != null) data.source = optSource;
  if (optTelegramError != null) data.telegramError = optTelegramError;

  const docRef = await addDoc(productIssueCollection, data);

  return docRef.id;
}



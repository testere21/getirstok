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

  const docRef = await addDoc(productIssueCollection, {
    barcode: params.barcode.trim(),
    productName: params.productName?.trim() || undefined,
    type: params.type,
    note: params.note?.trim() || undefined,
    source: params.source?.trim() || undefined,
    createdAt: now,
    telegramSent: params.telegramSent,
    telegramError: params.telegramError,
  });

  return docRef.id;
}



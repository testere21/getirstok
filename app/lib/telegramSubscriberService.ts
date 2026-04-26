import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/app/lib/firebase";

export const TELEGRAM_SUBSCRIBERS_COLLECTION = "telegram_subscribers";

export type TelegramChatType = "private" | "group" | "supergroup" | "channel" | "unknown";

export interface TelegramSubscriber {
  chatId: string;
  chatType: TelegramChatType;
  title?: string;
  username?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  isActive: boolean;
}

export async function upsertTelegramSubscriber(params: {
  chatId: string;
  chatType?: string;
  title?: string;
  username?: string;
}): Promise<void> {
  const chatId = String(params.chatId).trim();
  if (!chatId) return;

  const now = new Date().toISOString();
  const chatType: TelegramChatType =
    params.chatType === "private" ||
    params.chatType === "group" ||
    params.chatType === "supergroup" ||
    params.chatType === "channel"
      ? params.chatType
      : "unknown";

  const ref = doc(db, TELEGRAM_SUBSCRIBERS_COLLECTION, chatId);
  // setDoc merge ile upsert
  await setDoc(
    ref,
    {
      chatId,
      chatType,
      title: params.title,
      username: params.username,
      lastSeenAt: now,
      // ilk kez ise set edilir
      firstSeenAt: now,
      isActive: true,
    } satisfies TelegramSubscriber,
    { merge: true }
  );
}

export async function markTelegramSubscriberInactive(chatId: string): Promise<void> {
  const id = String(chatId).trim();
  if (!id) return;
  const ref = doc(db, TELEGRAM_SUBSCRIBERS_COLLECTION, id);
  await updateDoc(ref, {
    isActive: false,
    lastSeenAt: new Date().toISOString(),
  } as Partial<TelegramSubscriber> as DocumentData);
}

export async function listActiveTelegramChatIds(): Promise<string[]> {
  const ref = collection(db, TELEGRAM_SUBSCRIBERS_COLLECTION);
  const snap = await getDocs(ref);
  const out: string[] = [];
  snap.forEach((d) => {
    const data = d.data() as Partial<TelegramSubscriber>;
    const id = String(data.chatId ?? d.id).trim();
    if (!id) return;
    if (data.isActive === false) return;
    out.push(id);
  });
  return out;
}


import type {
  StockItemWithId,
  StockItemType,
  ProductIssueType,
} from "./types";
import {
  listActiveTelegramChatIds,
  markTelegramSubscriberInactive,
} from "./telegramSubscriberService";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_BROADCAST = process.env.TELEGRAM_BROADCAST === "1";

interface TelegramAddStockItemParams {
  name: string;
  barcode: string;
  quantity: number;
  notes?: string;
  type: StockItemType;
}

/**
 * Telegram Bot API'ye mesaj gönderen temel fonksiyon.
 * Env değişkenleri tanımlı değilse sessizce çıkar (panel çalışmaya devam eder).
 */
export async function sendTelegramMessage(message: string): Promise<void> {
  try {
    if (!TELEGRAM_BOT_TOKEN) {
      console.warn(
        "[telegramService] TELEGRAM_BOT_TOKEN tanımlı değil; mesaj gönderilmeyecek."
      );
      return;
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    const chatIds = new Set<string>();
    if (TELEGRAM_CHAT_ID) chatIds.add(String(TELEGRAM_CHAT_ID).trim());
    if (TELEGRAM_BROADCAST) {
      const subs = await listActiveTelegramChatIds();
      subs.forEach((id) => chatIds.add(String(id).trim()));
    }

    if (chatIds.size === 0) {
      console.warn(
        "[telegramService] Chat hedefi yok (TELEGRAM_CHAT_ID boş ve broadcast aboneleri yok)."
      );
      return;
    }

    // Basit rate-limit: sırayla gönder (Telegram 429 riskini azaltır)
    for (const chatId of chatIds) {
      if (!chatId) continue;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          disable_web_page_preview: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error(
          `[telegramService] Telegram API hatası chat_id=${chatId}: ${response.status} ${response.statusText}`,
          errorText
        );
        // Chat kapandıysa / bot engellendiyse aboneyi pasif yap
        if (TELEGRAM_BROADCAST && (response.status === 403 || response.status === 400)) {
          await markTelegramSubscriberInactive(chatId).catch(() => null);
        }
      }
    }
  } catch (error) {
    console.error("[telegramService] Telegram mesajı gönderilemedi:", error);
    // Burada hata fırlatmıyoruz ki stok işlemi panelde devam edebilsin
  }
}

/**
 * Ürün ekleme işlemi için mesaj metni oluşturur.
 * Parametre tipi, stok ekleme sırasında kullanılan temel alanlarla uyumludur.
 */
export function buildAddItemMessage(item: TelegramAddStockItemParams): string {
  const notes = item.notes?.trim() ? item.notes.trim() : "-";
  const typeLabel = item.type === "missing" ? "Eksik" : "Fazla";

  return [
    "🟢 ÜRÜN EKLENDİ",
    `Ad: ${item.name}`,
    `Barkod: ${item.barcode}`,
    `Miktar: ${item.quantity}`,
    `Tip: ${typeLabel}`,
    `Not: ${notes}`,
  ].join("\n");
}

/**
 * Ürün silme işlemi için mesaj metni oluşturur.
 */
export function buildDeleteItemMessage(item: StockItemWithId): string {
  const notes = item.notes?.trim() ? item.notes.trim() : "-";
  const typeLabel = item.type === "missing" ? "Eksik" : "Fazla";

  return [
    "🔴 ÜRÜN SİLİNDİ",
    `Ad: ${item.name}`,
    `Barkod: ${item.barcode}`,
    `Miktar: ${item.quantity}`,
    `Tip: ${typeLabel}`,
    `Not: ${notes}`,
  ].join("\n");
}

/**
 * Ürün güncelleme işlemi için mesaj metni oluşturur.
 * Sadece miktar değişimini zorunlu olarak gösterir; isim/barkod değişimi opsiyoneldir.
 */
export function buildUpdateItemMessage(
  before: StockItemWithId,
  after: StockItemWithId
): string {
  const typeLabel = after.type === "missing" ? "Eksik" : "Fazla";

  const lines: string[] = [
    "🟡 ÜRÜN GÜNCELLENDİ",
    `Ad: ${after.name}`,
    `Barkod: ${after.barcode}`,
    `Tip: ${typeLabel}`,
    `Eski miktar: ${before.quantity}`,
    `Yeni miktar: ${after.quantity}`,
  ];

  if (before.name !== after.name) {
    lines.push(`Eski ad: ${before.name}`);
    lines.push(`Yeni ad: ${after.name}`);
  }

  if (before.barcode !== after.barcode) {
    lines.push(`Eski barkod: ${before.barcode}`);
    lines.push(`Yeni barkod: ${after.barcode}`);
  }

  return lines.join("\n");
}

export interface ProductIssueTelegramPayload {
  barcode: string;
  productName?: string;
  type: ProductIssueType;
  note?: string;
  source?: string;
}

export function buildProductIssueMessage(
  payload: ProductIssueTelegramPayload
): string {
  const lines: string[] = [];

  const note = payload.note?.trim();
  const source = payload.source?.trim();

  if (payload.type === "product_missing") {
    lines.push("🚫 ÜRÜN YOK BİLDİRİMİ");
  } else {
    lines.push("⚠️ STOK YOK BİLDİRİMİ");
  }

  lines.push(`Barkod: ${payload.barcode}`);

  if (payload.productName?.trim()) {
    lines.push(`Ürün Adı: ${payload.productName.trim()}`);
  }

  if (source) {
    lines.push(`Kaynak: ${source}`);
  }

  if (note) {
    lines.push(`Not: ${note}`);
  }

  return lines.join("\n");
}



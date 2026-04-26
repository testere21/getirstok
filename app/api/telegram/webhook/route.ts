import { NextResponse } from "next/server";
import { upsertTelegramSubscriber } from "@/app/lib/telegramSubscriberService";

/**
 * Telegram webhook: Bot'a mesaj atan herkes abone olur (chat_id kaydedilir).
 *
 * Kurulum:
 * - Telegram'da bot ile konuş (veya gruba ekle) ve en az 1 mesaj at.
 * - Webhook'u set et:
 *   https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=<PUBLIC_BASE_URL>/api/telegram/webhook
 *
 * Broadcast:
 * - Env: TELEGRAM_BROADCAST=1
 * - sendTelegramMessage artık abonelerin tamamına gönderir.
 */
export async function POST(req: Request) {
  try {
    const update = (await req.json()) as any;

    const chat =
      update?.message?.chat ??
      update?.edited_message?.chat ??
      update?.channel_post?.chat ??
      update?.edited_channel_post?.chat ??
      null;

    if (chat?.id != null) {
      await upsertTelegramSubscriber({
        chatId: String(chat.id),
        chatType: String(chat.type ?? ""),
        title: chat.title ? String(chat.title) : undefined,
        username: chat.username ? String(chat.username) : undefined,
      });
    }

    // Bot'a cevap yazmak zorunlu değil; webhook 200 ok dönmeli
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[telegram webhook] error:", e);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}


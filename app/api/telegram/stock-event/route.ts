import { NextResponse } from "next/server";
import {
  sendTelegramMessage,
  buildAddItemMessage,
  buildDeleteItemMessage,
  buildUpdateItemMessage,
} from "@/app/lib/telegramService";

type StockItemType = "missing" | "extra";

interface BasicItemPayload {
  name: string;
  barcode: string;
  quantity: number;
  notes?: string;
  type: StockItemType;
}

type EventType = "add" | "delete" | "update";

interface StockEventBody {
  eventType: EventType;
  item: BasicItemPayload;
  beforeItem?: BasicItemPayload;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as StockEventBody;
    const { eventType, item, beforeItem } = body;

    if (!eventType || !item) {
      return NextResponse.json(
        { error: "eventType ve item alanları zorunludur." },
        { status: 400 }
      );
    }

    let message: string | null = null;

    switch (eventType) {
      case "add":
        message = buildAddItemMessage(item);
        break;
      case "delete":
        message = buildDeleteItemMessage({
          id: "",
          name: item.name,
          barcode: item.barcode,
          quantity: item.quantity,
          notes: item.notes ?? "",
          type: item.type,
          createdAt: "",
        });
        break;
      case "update":
        if (!beforeItem) {
          return NextResponse.json(
            { error: "update eventi için beforeItem zorunludur." },
            { status: 400 }
          );
        }
        message = buildUpdateItemMessage(
          {
            id: "",
            name: beforeItem.name,
            barcode: beforeItem.barcode,
            quantity: beforeItem.quantity,
            notes: beforeItem.notes ?? "",
            type: beforeItem.type,
            createdAt: "",
          },
          {
            id: "",
            name: item.name,
            barcode: item.barcode,
            quantity: item.quantity,
            notes: item.notes ?? "",
            type: item.type,
            createdAt: "",
          }
        );
        break;
      default:
        return NextResponse.json(
          { error: "Geçersiz eventType." },
          { status: 400 }
        );
    }

    if (message) {
      await sendTelegramMessage(message);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[telegram stock-event] Hata:", error);
    return NextResponse.json(
      { error: "Telegram bildirimi gönderilemedi." },
      { status: 500 }
    );
  }
}



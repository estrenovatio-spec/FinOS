import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { handleTelegramUpdate } from "@/lib/telegram/handle-update";
import type { TelegramUpdate } from "@/lib/telegram/bot-types";
import { isTelegramBotConfigured } from "@/lib/telegram/bot-token";

export const runtime = "nodejs";
export const maxDuration = 120;

function webhookSecretOk(request: NextRequest): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expected) return true;
  const header = request.headers.get("x-telegram-bot-api-secret-token");
  return header === expected;
}

async function runUpdate(update: TelegramUpdate): Promise<void> {
  try {
    await handleTelegramUpdate(update);
  } catch (err) {
    const detail = err instanceof Error ? err.message.slice(0, 120) : "error";
    console.error("[telegram/webhook]", detail, err);
    const chatId = update.message?.chat.id;
    if (chatId) {
      try {
        const { sendMessage } = await import("@/lib/telegram/bot-api");
        await sendMessage(
          chatId,
          `⚠️ Ошибка обработки (${detail}). Попробуйте текстом: «500 на обед» или откройте Mini App.`,
        );
      } catch {
        /* ignore reply failure */
      }
    }
  }
}

export async function POST(request: NextRequest) {
  if (!isTelegramBotConfigured()) {
    return NextResponse.json({ error: "bot_not_configured" }, { status: 503 });
  }

  if (!webhookSecretOk(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Сразу отвечаем Telegram — иначе повторяет запрос и шлёт «Слушаю…» несколько раз
  waitUntil(runUpdate(update));

  return NextResponse.json({ ok: true });
}

import type { TelegramFile, TelegramMessage } from "@/lib/telegram/bot-types";
import { getTelegramBotToken } from "@/lib/telegram/bot-token";

type TgResponse<T> = { ok: true; result: T } | { ok: false; description?: string };

export function getBotToken(): string {
  const token = getTelegramBotToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN missing");
  return token;
}

function apiUrl(method: string): string {
  return `https://api.telegram.org/bot${getBotToken()}/${method}`;
}

async function tgCall<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(apiUrl(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json()) as TgResponse<T>;
  if (!json.ok) {
    throw new Error("description" in json ? json.description ?? "telegram_api_error" : "telegram_api_error");
  }
  return json.result;
}

export async function sendMessage(
  chatId: number,
  text: string,
  extra?: {
    parse_mode?: "HTML" | "MarkdownV2";
    reply_markup?: Record<string, unknown>;
  },
): Promise<TelegramMessage> {
  return tgCall<TelegramMessage>("sendMessage", {
    chat_id: chatId,
    text,
    ...extra,
  });
}

export async function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
  extra?: {
    parse_mode?: "HTML" | "MarkdownV2";
    reply_markup?: Record<string, unknown>;
  },
): Promise<TelegramMessage | boolean> {
  return tgCall<TelegramMessage | boolean>("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    ...extra,
  });
}

export async function sendChatAction(
  chatId: number,
  action: "typing" | "upload_voice" = "typing",
): Promise<boolean> {
  return tgCall<boolean>("sendChatAction", { chat_id: chatId, action });
}

export async function getTelegramFile(fileId: string): Promise<TelegramFile> {
  return tgCall<TelegramFile>("getFile", { file_id: fileId });
}

export async function downloadTelegramFile(filePath: string): Promise<ArrayBuffer> {
  const url = `https://api.telegram.org/file/bot${getBotToken()}/${filePath}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new Error(`telegram_file_download_${res.status}`);
    return res.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }
}

export async function setWebhook(
  webhookUrl: string,
  secretToken?: string,
): Promise<boolean> {
  return tgCall<boolean>("setWebhook", {
    url: webhookUrl,
    allowed_updates: ["message"],
    drop_pending_updates: true,
    ...(secretToken ? { secret_token: secretToken } : {}),
  });
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function miniAppKeyboard(label: string, webAppUrl: string) {
  return {
    inline_keyboard: [[{ text: label, web_app: { url: webAppUrl } }]],
  };
}

export function urlKeyboard(label: string, url: string) {
  return {
    inline_keyboard: [[{ text: label, url }]],
  };
}

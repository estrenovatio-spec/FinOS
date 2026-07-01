import type { TelegramLoginPayload } from "@/lib/telegram/login-widget";

const KEY = "voicebudget-tg-web-login";

export function saveWebTelegramLogin(payload: TelegramLoginPayload): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function getWebTelegramLogin(): TelegramLoginPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TelegramLoginPayload;
  } catch {
    return null;
  }
}

export function clearWebTelegramLogin(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

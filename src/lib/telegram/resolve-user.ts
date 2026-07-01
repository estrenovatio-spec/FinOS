import type { TelegramWebAppUser } from "@/lib/telegram/init-data";
import { parseTelegramInitData } from "@/lib/telegram/init-data";
import { parseTelegramLoginWidget, type TelegramLoginPayload } from "@/lib/telegram/login-widget";

export function resolveTelegramUser(input: {
  initData?: string;
  telegramLogin?: TelegramLoginPayload;
}): TelegramWebAppUser | null {
  if (input.initData?.trim()) {
    const parsed = parseTelegramInitData(input.initData.trim());
    if (parsed) return parsed.user;
  }
  if (input.telegramLogin && Object.keys(input.telegramLogin).length > 0) {
    const parsed = parseTelegramLoginWidget(input.telegramLogin);
    if (parsed) return parsed.user;
  }
  return null;
}

import { getTelegramInitData } from "@/lib/cloud/telegram";
import { getWebTelegramLogin } from "@/lib/cloud/web-login-storage";
import type { TelegramLoginPayload } from "@/lib/telegram/login-widget";

export function getCloudAuthBody(): {
  initData?: string;
  telegramLogin?: TelegramLoginPayload;
} {
  const initData = getTelegramInitData();
  if (initData) return { initData };
  const telegramLogin = getWebTelegramLogin();
  if (telegramLogin) return { telegramLogin };
  return {};
}

export function hasCloudAuth(): boolean {
  const body = getCloudAuthBody();
  return Boolean(body.initData || body.telegramLogin);
}

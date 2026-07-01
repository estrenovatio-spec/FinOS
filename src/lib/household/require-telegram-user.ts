import type { HouseholdAuthInput } from "@/lib/household/auth-body";
import { resolveTelegramUser } from "@/lib/telegram/resolve-user";
import type { TelegramLoginPayload } from "@/lib/telegram/login-widget";

export function requireTelegramUser(auth: HouseholdAuthInput) {
  return resolveTelegramUser({
    initData: auth.initData,
    telegramLogin: auth.telegramLogin as TelegramLoginPayload | undefined,
  });
}

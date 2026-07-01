import type { HouseholdPublic } from "@/lib/household/types";
import { getPublicSiteUrl } from "@/lib/site-url";
import type { TelegramWebAppUser } from "@/lib/telegram/init-data";

export type HouseholdMemberLogAction = "create" | "join" | "open";

function formatTelegramHandle(user: TelegramWebAppUser): string {
  if (!user.username?.trim()) return "";
  const u = user.username.trim().replace(/^@/, "");
  return `@${u}`;
}

import { postToGoogleAppsScript } from "@/lib/google-sheets-apps-script";

/** Запись в Google Таблицу: первый вход, создание или присоединение к облаку (см. docs/GOOGLE-SHEETS.md) */
export async function logHouseholdMemberToGoogleSheet(opts: {
  action: HouseholdMemberLogAction;
  tgUser: TelegramWebAppUser;
  household?: HouseholdPublic | null;
}): Promise<void> {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    console.warn(
      "Google Sheets: GOOGLE_SHEETS_WEBHOOK_URL не задан — участник в таблицу не записан",
      { action: opts.action, telegramUserId: opts.tgUser.id },
    );
    return;
  }

  const siteUrl = getPublicSiteUrl();
  const actionLabel =
    opts.action === "create"
      ? "Создал семью"
      : opts.action === "join"
        ? "Присоединился"
        : "Открыл приложение";
  const household = opts.household ?? null;

  console.info("[google-sheets] logging", {
    action: opts.action,
    telegramUserId: opts.tgUser.id,
    householdId: household?.id ?? null,
  });

  await postToGoogleAppsScript(webhookUrl, {
    type: "voicebudget_member",
    createdAt: new Date().toISOString(),
    action: opts.action,
    actionLabel,
    firstName: opts.tgUser.first_name?.trim() ?? "",
    lastName: opts.tgUser.last_name?.trim() ?? "",
    telegram: formatTelegramHandle(opts.tgUser),
    telegramUserId: opts.tgUser.id,
    mode: household?.mode === "shared" ? "Вдвоём" : household ? "Веду один" : "",
    memberCount: household?.memberCount ?? "",
    inviteCode: household?.inviteCode ?? "",
    householdId: household?.id ?? "",
    siteUrl,
  });
}

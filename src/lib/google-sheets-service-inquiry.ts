import { postToGoogleAppsScript } from "@/lib/google-sheets-apps-script";
import type { ServiceInquiryId } from "@/lib/services/inquiry-types";
import { serviceInquiryTopicLabel } from "@/lib/services/inquiry-types";
import { getPublicSiteUrl } from "@/lib/site-url";
import type { TelegramWebAppUser } from "@/lib/telegram/init-data";

function formatTelegramHandle(user: TelegramWebAppUser): string {
  if (!user.username?.trim()) return "";
  const u = user.username.trim().replace(/^@/, "");
  return `@${u}`;
}

/** Заявка из «Страхование и услуги» → лист (см. docs/GOOGLE-SHEETS.md, type voicebudget_service) */
export async function logServiceInquiryToGoogleSheet(opts: {
  serviceId: ServiceInquiryId;
  fullName: string;
  phone: string;
  tgUser: TelegramWebAppUser;
}): Promise<void> {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    console.warn(
      "Google Sheets: GOOGLE_SHEETS_WEBHOOK_URL не задан — заявка в таблицу не записана",
      { serviceId: opts.serviceId },
    );
    return;
  }

  const topic = serviceInquiryTopicLabel(opts.serviceId, "ru");

  console.info("[google-sheets] service inquiry", {
    serviceId: opts.serviceId,
    telegramUserId: opts.tgUser.id,
  });

  await postToGoogleAppsScript(webhookUrl, {
    type: "voicebudget_service",
    highlightNew: true,
    createdAt: new Date().toISOString(),
    serviceId: opts.serviceId,
    serviceTopic: topic,
    fullName: opts.fullName,
    phone: opts.phone,
    firstName: opts.tgUser.first_name?.trim() ?? "",
    lastName: opts.tgUser.last_name?.trim() ?? "",
    telegram: formatTelegramHandle(opts.tgUser),
    telegramUserId: opts.tgUser.id,
    siteUrl: getPublicSiteUrl(),
  });
}

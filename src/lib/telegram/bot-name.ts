import { isPreviewDeploy } from "@/lib/telegram/bot-token";

/** Имя бота без @. На Preview — NEXT_PUBLIC_TG_BOT_NAME_PREVIEW (fintest). */
export function getTelegramBotName(): string {
  const preview = process.env.NEXT_PUBLIC_TG_BOT_NAME_PREVIEW?.trim().replace(/^@/, "");
  const prod = process.env.NEXT_PUBLIC_TG_BOT_NAME?.trim().replace(/^@/, "");
  if (isPreviewDeploy()) return preview || prod || "fintest_BU_bot";
  return prod || preview || "Fin_BU_bot";
}

export function getTelegramBotMention(): string {
  return `@${getTelegramBotName()}`;
}

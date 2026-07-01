import { getTelegramBotName } from "@/lib/telegram/bot-name";

export function buildReferralLinkFromCode(code: string): string {
  const bot = getTelegramBotName();
  return `https://t.me/${bot}?startapp=ref_${code}`;
}

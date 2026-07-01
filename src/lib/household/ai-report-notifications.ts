import { prisma } from "@/lib/db";
import { getPublicSiteUrl } from "@/lib/site-url";
import { miniAppKeyboard, sendMessage } from "@/lib/telegram/bot-api";

function reportReadyText(kind: "weekly" | "monthly", locale: "ru" | "en"): string {
  if (locale === "en") {
    return kind === "monthly"
      ? "<b>Your 30-day financial review is ready</b>\n\nThe advisor has prepared the key conclusions for the month. Open the app when you have a quiet minute."
      : "<b>Your 7-day financial review is ready</b>\n\nThe advisor has prepared fresh weekly conclusions. Open the app when convenient.";
  }

  return kind === "monthly"
    ? "<b>Готов разбор 30 дней</b>\n\nФинсоветник собрал главные выводы за месяц. Откройте приложение, когда будет спокойная минута."
    : "<b>Готов разбор 7 дней</b>\n\nФинсоветник собрал свежие выводы за неделю. Откройте приложение, когда удобно.";
}

export async function notifyAiReportReady(opts: {
  userId: string;
  kind: "weekly" | "monthly";
  locale: "ru" | "en";
}): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: { telegramId: true },
  });
  const chatId = Number(user?.telegramId);
  if (!Number.isFinite(chatId)) return;

  const url = `${getPublicSiteUrl()}/?tab=more&aiReport=${opts.kind}`;
  await sendMessage(chatId, reportReadyText(opts.kind, opts.locale), {
    parse_mode: "HTML",
    reply_markup: miniAppKeyboard(
      opts.locale === "en" ? "Open report" : "Открыть разбор",
      url,
    ),
  });
}

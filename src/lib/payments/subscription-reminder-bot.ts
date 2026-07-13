import { prisma } from "@/lib/db";
import {
  subscriptionAmountRub,
  subscriptionEnforced,
  subscriptionPeriodDays,
} from "@/lib/payments/config";
import { getSubscriptionForUser } from "@/lib/payments/subscription";
import { getPublicSiteUrl } from "@/lib/site-url";
import { miniAppKeyboard, sendMessage } from "@/lib/telegram/bot-api";

export function isSameUtcDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

export function subscriptionReminderAlreadySentToday(sentAt: Date | null | undefined): boolean {
  if (!sentAt) return false;
  return isSameUtcDay(sentAt, new Date());
}

function reminderText(locale: "ru" | "en", priceRub: number, periodDays: number): string {
  if (locale === "en") {
    return (
      `<b>Free trial ended</b>\n\n` +
      `Cloud sync and the voice bot are paused. Local data on your phone is kept.\n\n` +
      `Subscribe: ${priceRub} ₽ / ${periodDays} days.\n\n` +
      `Open the app to pay:`
    );
  }
  return (
    `<b>Пробный доступ закончился</b>\n\n` +
    `Облако и голосовой бот отключены. Записи на телефоне сохраняются.\n\n` +
    `Подписка: ${priceRub} ₽ / ${periodDays} дн.\n\n` +
    `Откройте приложение, чтобы оплатить:`
  );
}

export type ReminderSendResult =
  | { ok: true }
  | { skipped: "not_enforced" | "still_active" | "already_sent_today" | "no_telegram" };

/** Send at most one reminder per UTC day per user. */
export async function sendSubscriptionExpiryReminder(opts: {
  userId: string;
  telegramId: bigint;
  locale?: "ru" | "en";
  force?: boolean;
}): Promise<ReminderSendResult> {
  if (!subscriptionEnforced()) return { skipped: "not_enforced" };

  const sub = await getSubscriptionForUser(opts.userId);
  if (sub.active) return { skipped: "still_active" };

  const user = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: { subscriptionReminderSentAt: true },
  });
  if (
    !opts.force &&
    subscriptionReminderAlreadySentToday(user?.subscriptionReminderSentAt ?? null)
  ) {
    return { skipped: "already_sent_today" };
  }

  const chatId = Number(opts.telegramId);
  if (!Number.isFinite(chatId)) return { skipped: "no_telegram" };

  const locale = opts.locale ?? "ru";
  const priceRub = subscriptionAmountRub();
  const periodDays = subscriptionPeriodDays();
  const payUrl = `${getPublicSiteUrl()}/?paywall=1`;

  await sendMessage(chatId, reminderText(locale, priceRub, periodDays), {
    parse_mode: "HTML",
    reply_markup: miniAppKeyboard(
      locale === "en" ? "Subscribe" : "Оформить подписку",
      payUrl,
    ),
  });

  await prisma.user.update({
    where: { id: opts.userId },
    data: { subscriptionReminderSentAt: new Date() },
  });

  return { ok: true };
}

export async function runSubscriptionReminderCron(): Promise<{
  scanned: number;
  sent: number;
  skipped: number;
  errors: number;
}> {
  if (!subscriptionEnforced()) {
    return { scanned: 0, sent: 0, skipped: 0, errors: 0 };
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      telegramId: true,
      subscriptionReminderSentAt: true,
    },
  });

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of users) {
    if (!user.telegramId) {
      skipped += 1;
      continue;
    }
    const sub = await getSubscriptionForUser(user.id);
    if (sub.active) {
      skipped += 1;
      continue;
    }
    if (subscriptionReminderAlreadySentToday(user.subscriptionReminderSentAt)) {
      skipped += 1;
      continue;
    }

    try {
      const result = await sendSubscriptionExpiryReminder({
        userId: user.id,
        telegramId: user.telegramId,
        force: true,
      });
      if ("ok" in result && result.ok) sent += 1;
      else skipped += 1;
    } catch (e) {
      console.error("[subscription-reminder]", user.id, e);
      errors += 1;
    }
  }

  return { scanned: users.length, sent, skipped, errors };
}

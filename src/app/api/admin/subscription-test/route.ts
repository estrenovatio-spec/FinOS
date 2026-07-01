import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized, requireAdminSecrets } from "@/lib/admin-auth";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import {
  extendSubscriptionDays,
  getSubscriptionForUser,
} from "@/lib/payments/subscription";
import { subscriptionTrialDays } from "@/lib/payments/config";
import { sendSubscriptionExpiryReminder } from "@/lib/payments/subscription-reminder-bot";
import { recordReferralActivityDay } from "@/lib/referrals/activity";
import { tryQualifyPendingReferral } from "@/lib/referrals/qualify";

export const dynamic = "force-dynamic";

type Action =
  | "expire"
  | "send_reminder"
  | "grant_trial"
  | "status"
  | "referral_log_days"
  | "referral_try_qualify";

async function findUser(telegramId?: string, username?: string) {
  const select = {
    id: true,
    telegramId: true,
    username: true,
    subscriptionReminderSentAt: true,
  };
  if (telegramId?.trim()) {
    return prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId.trim()) },
      select,
    });
  }
  if (username?.trim()) {
    const u = username.trim().replace(/^@/, "");
    return prisma.user.findFirst({
      where: { username: { equals: u, mode: "insensitive" } },
      select,
    });
  }
  return null;
}

/**
 * POST Bearer HOUSEHOLD_SESSION_SECRET
 * { "action": "expire" | "send_reminder" | "grant_trial" | "status", "telegramId": "...", "username": "..." }
 */
export async function POST(req: NextRequest) {
  if (!requireAdminSecrets()) {
    return NextResponse.json({ error: "admin_secret_not_configured" }, { status: 503 });
  }
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }

  let body: {
    action?: Action;
    telegramId?: string;
    username?: string;
    force?: boolean;
    dates?: string[];
    count?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const action = body.action ?? "status";
  const user = await findUser(body.telegramId, body.username);
  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  if (action === "status") {
    const subscription = await getSubscriptionForUser(user.id);
    return NextResponse.json({
      ok: true,
      userId: user.id,
      telegramId: user.telegramId.toString(),
      username: user.username,
      subscription,
      subscriptionReminderSentAt: user.subscriptionReminderSentAt,
    });
  }

  if (action === "expire") {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.subscription.upsert({
      where: { userId: user.id },
      create: { userId: user.id, status: "active", currentPeriodEnd: yesterday },
      update: { status: "active", currentPeriodEnd: yesterday },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { subscriptionReminderSentAt: null },
    });
    const subscription = await getSubscriptionForUser(user.id);
    return NextResponse.json({
      ok: true,
      message: "subscription_expired_for_test",
      subscription,
    });
  }

  if (action === "grant_trial") {
    const days = subscriptionTrialDays() || 31;
    await extendSubscriptionDays(user.id, days);
    await prisma.user.update({
      where: { id: user.id },
      data: { subscriptionReminderSentAt: null },
    });
    const subscription = await getSubscriptionForUser(user.id);
    return NextResponse.json({ ok: true, message: "trial_granted", days, subscription });
  }

  if (action === "send_reminder") {
    const result = await sendSubscriptionExpiryReminder({
      userId: user.id,
      telegramId: user.telegramId,
      force: body.force ?? true,
    });
    return NextResponse.json({ ok: true, result });
  }

  if (action === "referral_log_days") {
    const dates =
      body.dates?.length && body.dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        ? body.dates
        : Array.from({ length: Math.max(1, body.count ?? 3) }, (_, i) => {
            const d = new Date();
            d.setUTCDate(d.getUTCDate() - i);
            return d.toISOString().slice(0, 10);
          });
    let daysRecorded = 0;
    for (const date of dates) {
      daysRecorded = await recordReferralActivityDay(user.id, date);
    }
    const qualify = await tryQualifyPendingReferral(user.id);
    const subscription = await getSubscriptionForUser(user.id);
    return NextResponse.json({
      ok: true,
      message: "referral_activity_logged",
      dates,
      daysRecorded,
      qualify,
      subscription,
    });
  }

  if (action === "referral_try_qualify") {
    const qualify = await tryQualifyPendingReferral(user.id);
    const subscription = await getSubscriptionForUser(user.id);
    return NextResponse.json({ ok: true, qualify, subscription });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}

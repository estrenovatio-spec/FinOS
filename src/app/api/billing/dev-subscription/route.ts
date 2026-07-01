import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import { subscriptionBillingTestMode } from "@/lib/payments/config";
import { getAccessSummaryForUser } from "@/lib/billing/access-summary";
import { getSubscriptionForUser } from "@/lib/payments/subscription";
import { getBillingDevTelegramId } from "@/lib/billing/dev-telegram-id";
import { isPreviewDeploy } from "@/lib/telegram/bot-token";

export const dynamic = "force-dynamic";

/**
 * Preview + billing test only: load subscription by fixed test Telegram ID (no initData).
 * Set BILLING_DEV_TELEGRAM_ID on Vercel Preview (= your id for ./scripts/test-trial-expire.sh).
 */
export async function GET(req: NextRequest) {
  if (!isPreviewDeploy() || !subscriptionBillingTestMode()) {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }

  const allowed = getBillingDevTelegramId();
  if (!allowed) {
    return NextResponse.json(
      {
        error: "forbidden",
        hint: "На Vercel Preview: BILLING_DEV_TELEGRAM_ID и Redeploy.",
        configured: false,
      },
      { status: 403 },
    );
  }

  const requested = req.nextUrl.searchParams.get("telegramId")?.trim();
  if (requested && requested !== allowed) {
    return NextResponse.json({ error: "forbidden", configured: true }, { status: 403 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(allowed) },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    const subscription = await getSubscriptionForUser(user.id);
    const accessSummary = await getAccessSummaryForUser(user.id);
    return NextResponse.json({
      ok: true,
      userId: user.id,
      subscription,
      accessSummary,
      devFallback: true,
    });
  } catch (e) {
    console.error("[billing/dev-subscription]", e);
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error: "server_error",
        hint: "Ошибка БД на Preview. Проверьте DATABASE_URL (pooler :6543 ?pgbouncer=true).",
        detail: detail.slice(0, 200),
      },
      { status: 500 },
    );
  }
}

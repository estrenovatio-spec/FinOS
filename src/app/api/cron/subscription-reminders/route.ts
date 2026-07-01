import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { runSubscriptionReminderCron } from "@/lib/payments/subscription-reminder-bot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cronAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth === `Bearer ${cronSecret}`) return true;
  }
  return isAdminAuthorized(req);
}

/** Daily push: expired subscription → Telegram reminder (max 1× per UTC day per user). */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runSubscriptionReminderCron();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron/subscription-reminders]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "cron_failed" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}

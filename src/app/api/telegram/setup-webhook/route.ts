import { NextRequest, NextResponse } from "next/server";
import { getPublicSiteUrl } from "@/lib/site-url";
import { setWebhook } from "@/lib/telegram/bot-api";
import { isTelegramBotConfigured } from "@/lib/telegram/bot-token";

export const runtime = "nodejs";

function setupSecretOk(request: NextRequest): boolean {
  const secret = request.nextUrl.searchParams.get("secret")?.trim();
  const expected =
    process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ||
    process.env.CLOUD_WIPE_SECRET?.trim() ||
    process.env.HOUSEHOLD_SESSION_SECRET?.trim();
  return Boolean(expected && secret === expected);
}

export async function GET(request: NextRequest) {
  if (!setupSecretOk(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isTelegramBotConfigured()) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN missing" }, { status: 503 });
  }

  const configured = getPublicSiteUrl();
  const base = configured || `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  const webhookUrl = `${base}/api/telegram/webhook`;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

  try {
    const ok = await setWebhook(webhookUrl, secret || undefined);
    return NextResponse.json({
      ok,
      webhookUrl,
      secretConfigured: Boolean(secret),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "setWebhook failed",
        webhookUrl,
      },
      { status: 500 },
    );
  }
}

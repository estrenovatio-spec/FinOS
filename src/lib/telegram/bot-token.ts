import { envTruthy } from "@/lib/payments/env-flags";

/** Vercel: production | preview | development */
function vercelEnv(): string | undefined {
  return process.env.VERCEL_ENV?.trim() || undefined;
}

export function isPreviewDeploy(): boolean {
  return vercelEnv() === "preview";
}

/** Preview + billing test: initData must match TELEGRAM_BOT_TOKEN_PREVIEW (fintest), not prod bot. */
export function requirePreviewBotTokenOnInitData(): boolean {
  return (
    isPreviewDeploy() &&
    envTruthy("SUBSCRIPTION_BILLING_TEST", "SUBSCRIPTION_BILLING_TEST_PREVIEW") &&
    Boolean(process.env.TELEGRAM_BOT_TOKEN_PREVIEW?.trim())
  );
}

/**
 * Production: TELEGRAM_BOT_TOKEN
 * Preview: TELEGRAM_BOT_TOKEN_PREVIEW (если задан), иначе fallback на TELEGRAM_BOT_TOKEN
 *
 * На Vercel можно завести две переменные без конфликта:
 * - TELEGRAM_BOT_TOKEN → только Production
 * - TELEGRAM_BOT_TOKEN_PREVIEW → только Preview
 */
/** Tokens to try when validating Mini App initData (preview: test bot + prod fallback). */
export function getTelegramBotTokens(): string[] {
  const prod = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const preview = process.env.TELEGRAM_BOT_TOKEN_PREVIEW?.trim();
  if (isPreviewDeploy()) {
    return [...new Set([preview, prod].filter(Boolean) as string[])];
  }
  return prod ? [prod] : preview ? [preview] : [];
}

export function getTelegramBotTokenForEnv(): string | undefined {
  const prod = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const preview = process.env.TELEGRAM_BOT_TOKEN_PREVIEW?.trim();
  if (isPreviewDeploy()) return preview || prod;
  return prod || preview;
}

export function getTelegramBotToken(): string | undefined {
  const tokens = getTelegramBotTokens();
  return tokens[0];
}

export function isTelegramPreviewTokenConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN_PREVIEW?.trim());
}

export function isTelegramBotConfigured(): boolean {
  return getTelegramBotTokens().length > 0;
}

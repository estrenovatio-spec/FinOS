import { envString } from "@/lib/payments/env-flags";

/** Allowed test Telegram user id for preview billing (no initData). */
export function getBillingDevTelegramId(): string | undefined {
  return envString(
    "BILLING_DEV_TELEGRAM_ID",
    "BILLING_DEV_TELEGRAM_ID_PREVIEW",
    "NEXT_PUBLIC_BILLING_DEV_TELEGRAM_ID",
  );
}

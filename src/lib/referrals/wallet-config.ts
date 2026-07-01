import { envInt, envTruthy } from "@/lib/payments/env-flags";

export function referralWalletEnabled(): boolean {
  if (envTruthy("REFERRAL_WALLET_DISABLED")) return false;
  return envTruthy("REFERRAL_WALLET_ENABLED", "REFERRAL_WALLET_ENABLED_PREVIEW") || true;
}

/** Доля от оплаты подписки приглашённым другом (по умолчанию 10%). */
export function referralWalletCommissionPercent(): number {
  const n = envInt(
    "REFERRAL_WALLET_COMMISSION_PERCENT",
    "REFERRAL_WALLET_COMMISSION_PERCENT_PREVIEW",
  );
  if (n !== undefined && n >= 0 && n <= 100) return n;
  return 10;
}

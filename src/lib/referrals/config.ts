import { envInt, envTruthy } from "@/lib/payments/env-flags";

/** On by default. Kill switch: REFERRAL_DISABLED=true on Vercel. */
export function referralsEnabled(): boolean {
  if (envTruthy("REFERRAL_DISABLED")) return false;
  return envTruthy("REFERRAL_ENABLED", "REFERRAL_ENABLED_PREVIEW") || true;
}

export function referralBonusDaysReferrer(): number {
  const n = envInt("REFERRAL_BONUS_DAYS_REFERRER", "REFERRAL_BONUS_DAYS_REFERRER_PREVIEW");
  return n !== undefined && n >= 0 ? n : 14;
}

export function referralBonusDaysReferred(): number {
  const n = envInt("REFERRAL_BONUS_DAYS_REFERRED", "REFERRAL_BONUS_DAYS_REFERRED_PREVIEW");
  return n !== undefined && n >= 0 ? n : 14;
}

/** Extra subscription days on qualify — off by default when wallet commission is on. */
export function referralDaysBonusEnabled(): boolean {
  return envTruthy("REFERRAL_DAYS_BONUS_ENABLED", "REFERRAL_DAYS_BONUS_ENABLED_PREVIEW");
}

/** Days with entries before qualify — off by default (bonus on friend’s subscription payment). */
export function referralActivityDaysRequired(): number {
  const n = envInt(
    "REFERRAL_ACTIVITY_DAYS_REQUIRED",
    "REFERRAL_ACTIVITY_DAYS_REQUIRED_PREVIEW",
  );
  return n !== undefined && n >= 0 ? n : 0;
}

import { ReferralStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  countReferralActivityDays,
  recordReferralActivityDay,
  referralActivityDaysRequiredCount,
} from "@/lib/referrals/activity";
import { referralDaysBonusEnabled, referralsEnabled } from "@/lib/referrals/config";
import { extendSubscriptionDays } from "@/lib/payments/subscription";
import { subscriptionAmountRub } from "@/lib/payments/config";
import {
  commissionRubFromSubscription,
  settleReferralWalletOnQualify,
} from "@/lib/referrals/wallet";

export type ReferralQualifyResult =
  | { qualified: true; referralId: string }
  | { qualified: false; daysRecorded: number; daysRequired: number }
  | { none: true };

async function rewardReferral(referralId: string): Promise<void> {
  const row = await prisma.referral.findUnique({ where: { id: referralId } });
  if (!row || row.status !== ReferralStatus.pending) return;

  await prisma.referral.update({
    where: { id: referralId },
    data: { status: ReferralStatus.rewarded, rewardedAt: new Date() },
  });

  if (referralDaysBonusEnabled()) {
    await Promise.all([
      extendSubscriptionDays(row.referrerUserId, row.referrerBonusDays),
      extendSubscriptionDays(row.referredUserId, row.referredBonusDays),
    ]);
  }

  const commission = commissionRubFromSubscription(subscriptionAmountRub());
  await settleReferralWalletOnQualify(row.referrerUserId, commission);
}

/** When activity gate is off — qualify after referred user pays subscription. */
export async function qualifyReferralOnReferredSubscriptionPayment(
  referredUserId: string,
): Promise<ReferralQualifyResult> {
  if (!referralsEnabled()) return { none: true };
  if (referralActivityDaysRequiredCount() > 0) return { none: true };

  const pending = await prisma.referral.findUnique({
    where: { referredUserId },
  });
  if (!pending || pending.status !== ReferralStatus.pending) {
    return { none: true };
  }

  await rewardReferral(pending.id);
  return { qualified: true, referralId: pending.id };
}

/** If referred user logged enough days — grant bonus (legacy gate when REFERRAL_ACTIVITY_DAYS_REQUIRED > 0). */
export async function tryQualifyPendingReferral(
  referredUserId: string,
): Promise<ReferralQualifyResult> {
  const required = referralActivityDaysRequiredCount();
  if (required <= 0) return { none: true };

  const pending = await prisma.referral.findUnique({
    where: { referredUserId },
  });

  if (!pending || pending.status !== ReferralStatus.pending) {
    return { none: true };
  }

  const daysRecorded = await countReferralActivityDays(referredUserId, pending.createdAt);
  if (daysRecorded < required) {
    return { qualified: false, daysRecorded, daysRequired: required };
  }

  await rewardReferral(pending.id);
  return { qualified: true, referralId: pending.id };
}

export async function recordActivityAndTryQualify(
  userId: string,
  rawDate: string,
): Promise<ReferralQualifyResult & { daysRecorded?: number; daysRequired?: number }> {
  const daysRecorded = await recordReferralActivityDay(userId, rawDate);
  const result = await tryQualifyPendingReferral(userId);
  if ("qualified" in result && result.qualified) {
    return { ...result, daysRecorded, daysRequired: referralActivityDaysRequiredCount() };
  }
  if ("qualified" in result && !result.qualified) {
    return result;
  }
  return {
    qualified: false,
    daysRecorded,
    daysRequired: referralActivityDaysRequiredCount(),
  };
}

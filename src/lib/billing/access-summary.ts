import { ReferralStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  referralBonusDaysReferred,
  referralBonusDaysReferrer,
  referralsEnabled,
} from "@/lib/referrals/config";
import { getReferralPendingProgress } from "@/lib/referrals/service";
import { subscriptionTrialDays } from "@/lib/payments/config";
import { getSubscriptionForUser } from "@/lib/payments/subscription";
import type { AccessSummaryPublic } from "@/lib/payments/types";

export async function getAccessSummaryForUser(
  userId: string,
): Promise<AccessSummaryPublic | null> {
  const [sub, user, asReferrer, asReferredRewarded, pending] = await Promise.all([
    getSubscriptionForUser(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { trialGrantedAt: true, referredByUserId: true },
    }),
    prisma.referral.aggregate({
      where: { referrerUserId: userId, status: ReferralStatus.rewarded },
      _sum: { referrerBonusDays: true },
      _count: true,
    }),
    prisma.referral.findFirst({
      where: { referredUserId: userId, status: ReferralStatus.rewarded },
      select: { referredBonusDays: true },
    }),
    getReferralPendingProgress(userId),
  ]);

  if (!sub.enforced || !sub.active || !sub.onFreeAccess || sub.daysRemaining === null) {
    return null;
  }

  const referralsOn = referralsEnabled();
  const referralDaysForFriends = referralsOn ? (asReferrer._sum.referrerBonusDays ?? 0) : 0;
  const referralDaysFromInvite = referralsOn
    ? (asReferredRewarded?.referredBonusDays ?? 0)
    : 0;
  const trialDays = user?.trialGrantedAt ? subscriptionTrialDays() : 0;

  return {
    daysRemaining: sub.daysRemaining,
    expiresAt: sub.expiresAt,
    trialDays,
    referralDaysForFriends,
    referralDaysFromInvite,
    referralDaysTotal: referralDaysForFriends + referralDaysFromInvite,
    friendsInvited: referralsOn ? asReferrer._count : 0,
    wasInvited: referralsOn && Boolean(user?.referredByUserId),
    referrerBonusPerFriend: referralsOn ? referralBonusDaysReferrer() : 0,
    referredBonusDays: referralsOn ? referralBonusDaysReferred() : 0,
    referralPending: referralsOn ? pending : null,
    testMode: sub.testMode,
  };
}

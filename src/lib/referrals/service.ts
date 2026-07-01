import { ReferralStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { referralActivityDaysRequiredCount } from "@/lib/referrals/activity";
import { generateReferralCode, normalizeReferralCode } from "@/lib/referrals/code";
import {
  referralBonusDaysReferred,
  referralBonusDaysReferrer,
  referralsEnabled,
} from "@/lib/referrals/config";
import { subscriptionAmountRub } from "@/lib/payments/config";
import {
  addReferralWalletPending,
  commissionRubFromSubscription,
  getReferralWalletSummary,
} from "@/lib/referrals/wallet";
import { getTelegramBotMention } from "@/lib/telegram/bot-name";

export type ReferralProfilePublic = Awaited<ReturnType<typeof getReferralProfile>>;

export type ReferralApplyResult =
  | { ok: true }
  | { skipped: "disabled" | "invalid_code" | "self" | "already_referred" | "referrer_not_found" };

export async function ensureUserReferralCode(userId: string): Promise<string> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (row?.referralCode) return row.referralCode;

  for (let i = 0; i < 8; i += 1) {
    const code = generateReferralCode(8);
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
      });
      return code;
    } catch {
      /* collision */
    }
  }
  throw new Error("referral_code_collision");
}

export function buildReferralMiniAppLink(code: string): string {
  const bot = getTelegramBotMention().replace(/^@/, "");
  return `https://t.me/${bot}?startapp=ref_${code}`;
}

/** Link friend — wallet bonus after their subscription payment (or N activity days if configured). */
export async function applyReferralFromCode(
  referredUserId: string,
  rawCode: string,
): Promise<ReferralApplyResult> {
  if (!referralsEnabled()) return { skipped: "disabled" };

  const code = normalizeReferralCode(rawCode);
  if (!code) return { skipped: "invalid_code" };

  const referrer = await prisma.user.findUnique({
    where: { referralCode: code },
    select: { id: true },
  });
  if (!referrer) return { skipped: "referrer_not_found" };
  if (referrer.id === referredUserId) return { skipped: "self" };

  const referred = await prisma.user.findUnique({
    where: { id: referredUserId },
    select: { referredByUserId: true },
  });
  if (referred?.referredByUserId) return { skipped: "already_referred" };

  const existing = await prisma.referral.findUnique({
    where: { referredUserId },
  });
  if (existing) return { skipped: "already_referred" };

  const referrerBonusDays = referralBonusDaysReferrer();
  const referredBonusDays = referralBonusDaysReferred();

  await prisma.$transaction(async (tx) => {
    await tx.referral.create({
      data: {
        referrerUserId: referrer.id,
        referredUserId,
        referrerBonusDays,
        referredBonusDays,
        status: ReferralStatus.pending,
      },
    });
    await tx.user.update({
      where: { id: referredUserId },
      data: { referredByUserId: referrer.id },
    });
  });

  await addReferralWalletPending(
    referrer.id,
    commissionRubFromSubscription(subscriptionAmountRub()),
  );

  return { ok: true };
}

export async function getReferralPendingProgress(userId: string) {
  const daysRequired = referralActivityDaysRequiredCount();
  const useActivityGate = daysRequired > 0;

  const asReferred = await prisma.referral.findUnique({
    where: { referredUserId: userId },
    select: { status: true, createdAt: true, referrerBonusDays: true },
  });
  if (asReferred?.status === ReferralStatus.pending) {
    if (!useActivityGate) {
      return {
        role: "referred" as const,
        waitsForSubscriptionPayment: true as const,
        bonusDays: asReferred.referrerBonusDays,
      };
    }
    const { countReferralActivityDays } = await import("@/lib/referrals/activity");
    const daysRecorded = await countReferralActivityDays(userId, asReferred.createdAt);
    return {
      role: "referred" as const,
      daysRecorded,
      daysRequired,
      bonusDays: asReferred.referrerBonusDays,
    };
  }

  const pendingAsReferrer = await prisma.referral.findFirst({
    where: { referrerUserId: userId, status: ReferralStatus.pending },
    orderBy: { createdAt: "desc" },
    select: { referredUserId: true, referredBonusDays: true, createdAt: true },
  });
  if (pendingAsReferrer) {
    if (!useActivityGate) {
      return {
        role: "referrer" as const,
        waitsForFriendSubscriptionPayment: true as const,
        bonusDays: pendingAsReferrer.referredBonusDays,
      };
    }
    const { countReferralActivityDays } = await import("@/lib/referrals/activity");
    const daysRecorded = await countReferralActivityDays(
      pendingAsReferrer.referredUserId,
      pendingAsReferrer.createdAt,
    );
    return {
      role: "referrer" as const,
      daysRecorded,
      daysRequired,
      bonusDays: pendingAsReferrer.referredBonusDays,
    };
  }

  return null;
}

export async function getReferralProfile(userId: string) {
  const enabled = referralsEnabled();
  const code = await ensureUserReferralCode(userId);
  const link = buildReferralMiniAppLink(code);
  const daysRequired = referralActivityDaysRequiredCount();

  const [rewardedAsReferrer, referredBy, pending] = await Promise.all([
    prisma.referral.findMany({
      where: { referrerUserId: userId, status: ReferralStatus.rewarded },
      select: { referrerBonusDays: true, rewardedAt: true },
      orderBy: { rewardedAt: "desc" },
      take: 5,
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        referredBy: { select: { referralCode: true, firstName: true } },
      },
    }),
    getReferralPendingProgress(userId),
  ]);

  const referralsRewarded = await prisma.referral.count({
    where: { referrerUserId: userId, status: ReferralStatus.rewarded },
  });

  const pendingAsReferrer = await prisma.referral.count({
    where: { referrerUserId: userId, status: ReferralStatus.pending },
  });

  let wallet: Awaited<ReturnType<typeof getReferralWalletSummary>> = null;
  try {
    wallet = await getReferralWalletSummary(userId);
  } catch (e) {
    console.error("[referral wallet]", e);
  }

  return {
    enabled,
    code,
    link,
    referralsCount: referralsRewarded,
    referralsPending: pendingAsReferrer,
    referrerBonusDays: referralBonusDaysReferrer(),
    referredBonusDays: referralBonusDaysReferred(),
    activityDaysRequired: daysRequired,
    invitedByCode: referredBy?.referredBy?.referralCode ?? null,
    invitedByName: referredBy?.referredBy?.firstName ?? null,
    pending,
    recentReferrals: rewardedAsReferrer.map((r) => ({
      bonusDays: r.referrerBonusDays,
      at: (r.rewardedAt ?? new Date()).toISOString(),
    })),
    wallet,
  };
}

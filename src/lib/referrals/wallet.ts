import { ReferralStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { subscriptionAmountRub } from "@/lib/payments/config";
import { referralPendingCanDismiss } from "@/lib/referrals/dismiss-pending";
import {
  referralWalletCommissionPercent,
  referralWalletEnabled,
} from "@/lib/referrals/wallet-config";

export type ReferralWalletPublic = {
  enabled: boolean;
  previewMode: boolean;
  commissionPercent: number;
  subscriptionRub: number;
  commissionPerPaymentRub: number;
  availableRub: number;
  pendingRub: number;
  totalEarnedRub: number;
  recentEarnings: {
    referralId?: string;
    label: string;
    amountRub: number;
    at: string;
    status: "paid" | "pending";
    canDismiss?: boolean;
  }[];
};

function roundRub(n: number): number {
  return Math.max(0, Math.ceil(n));
}

/** Комиссия за оплату друга — целые рубли, округление вверх. */
export function commissionRubFromSubscription(subscriptionRub: number): number {
  const pct = referralWalletCommissionPercent();
  return roundRub((subscriptionRub * pct) / 100);
}

async function userWalletColumnsExist(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'User'
        AND column_name IN ('referralWalletBalanceRub', 'referralWalletPendingRub')
    `;
    return (rows[0]?.n ?? 0) >= 2;
  } catch {
    return false;
  }
}

async function readUserWallet(userId: string): Promise<{ availableRub: number; pendingRub: number } | null> {
  if (!(await userWalletColumnsExist())) return null;
  const rows = await prisma.$queryRaw<{ referralWalletBalanceRub: number; referralWalletPendingRub: number }[]>`
    SELECT "referralWalletBalanceRub", "referralWalletPendingRub"
    FROM "User"
    WHERE id = ${userId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    availableRub: Number(row.referralWalletBalanceRub) || 0,
    pendingRub: Number(row.referralWalletPendingRub) || 0,
  };
}

/** +pending when friend linked, not yet qualified. */
export async function addReferralWalletPending(
  referrerUserId: string,
  amountRub: number,
): Promise<void> {
  if (!referralWalletEnabled() || amountRub <= 0) return;
  if (!(await userWalletColumnsExist())) return;
  await prisma.$executeRaw`
    UPDATE "User"
    SET "referralWalletPendingRub" = COALESCE("referralWalletPendingRub", 0) + ${amountRub}
    WHERE id = ${referrerUserId}
  `;
}

/** Снять ожидание с кошелька (друг убран из списка после месяца без оплаты). */
export async function removeReferralWalletPending(
  referrerUserId: string,
  amountRub: number,
): Promise<void> {
  if (!referralWalletEnabled() || amountRub <= 0) return;
  if (!(await userWalletColumnsExist())) return;
  await prisma.$executeRaw`
    UPDATE "User"
    SET "referralWalletPendingRub" = GREATEST(0, COALESCE("referralWalletPendingRub", 0) - ${amountRub})
    WHERE id = ${referrerUserId}
  `;
}

/** pending → available when referral qualified (friend paid activity). */
export async function settleReferralWalletOnQualify(
  referrerUserId: string,
  amountRub: number,
): Promise<void> {
  if (!referralWalletEnabled() || amountRub <= 0) return;
  if (!(await userWalletColumnsExist())) return;
  await prisma.$executeRaw`
    UPDATE "User"
    SET
      "referralWalletPendingRub" = GREATEST(0, COALESCE("referralWalletPendingRub", 0) - ${amountRub}),
      "referralWalletBalanceRub" = COALESCE("referralWalletBalanceRub", 0) + ${amountRub}
    WHERE id = ${referrerUserId}
  `;
}

/** Computed fallback when DB wallet columns missing. */
async function computedWalletFromReferrals(userId: string): Promise<{
  availableRub: number;
  pendingRub: number;
  recentEarnings: ReferralWalletPublic["recentEarnings"];
}> {
  const perPay = commissionRubFromSubscription(subscriptionAmountRub());

  const [rewarded, pendingList] = await Promise.all([
    prisma.referral.findMany({
      where: { referrerUserId: userId, status: ReferralStatus.rewarded },
      select: { rewardedAt: true, referred: { select: { firstName: true } } },
      orderBy: { rewardedAt: "desc" },
      take: 8,
    }),
    prisma.referral.findMany({
      where: { referrerUserId: userId, status: ReferralStatus.pending },
      select: { id: true, createdAt: true, referred: { select: { firstName: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const recentEarnings: ReferralWalletPublic["recentEarnings"] = [
    ...rewarded.map((r) => ({
      label: r.referred.firstName?.trim() || "Друг",
      amountRub: perPay,
      at: (r.rewardedAt ?? new Date()).toISOString(),
      status: "paid" as const,
    })),
    ...pendingList.map((r) => ({
      referralId: r.id,
      label: r.referred.firstName?.trim() || "Друг",
      amountRub: perPay,
      at: r.createdAt.toISOString(),
      status: "pending" as const,
      canDismiss: referralPendingCanDismiss(r.createdAt),
    })),
  ].slice(0, 8);

  return {
    availableRub: roundRub(rewarded.length * perPay),
    pendingRub: roundRub(pendingList.length * perPay),
    recentEarnings,
  };
}

/** Списание доступного баланса (при оплате подписки). */
export async function debitReferralWalletBalance(
  userId: string,
  amountRub: number,
): Promise<number> {
  if (!referralWalletEnabled() || amountRub <= 0) return 0;
  if (!(await userWalletColumnsExist())) return 0;

  const rows = await prisma.$queryRaw<{ referralWalletBalanceRub: number }[]>`
    SELECT "referralWalletBalanceRub"
    FROM "User"
    WHERE id = ${userId}
    LIMIT 1
  `;
  const available = Number(rows[0]?.referralWalletBalanceRub) || 0;
  const debit = roundRub(Math.min(available, amountRub));
  if (debit <= 0) return 0;

  await prisma.$executeRaw`
    UPDATE "User"
    SET "referralWalletBalanceRub" = GREATEST(0, COALESCE("referralWalletBalanceRub", 0) - ${debit})
    WHERE id = ${userId}
  `;
  return debit;
}

export async function getReferralWalletAvailableRub(userId: string): Promise<number> {
  const stored = await readUserWallet(userId);
  if (stored) return roundRub(Math.max(0, stored.availableRub));
  const summary = await getReferralWalletSummary(userId);
  return roundRub(summary?.availableRub ?? 0);
}

export async function getReferralWalletSummary(userId: string): Promise<ReferralWalletPublic | null> {
  if (!referralWalletEnabled()) return null;

  const subscriptionRub = subscriptionAmountRub();
  const commissionPerPaymentRub = commissionRubFromSubscription(subscriptionRub);
  const stored = await readUserWallet(userId);
  const previewMode = !stored;

  let availableRub: number;
  let pendingRub: number;
  let recentEarnings: ReferralWalletPublic["recentEarnings"];

  if (stored) {
    availableRub = roundRub(Math.max(0, stored.availableRub));
    pendingRub = roundRub(Math.max(0, stored.pendingRub));
    const computed = await computedWalletFromReferrals(userId);
    recentEarnings = computed.recentEarnings;
  } else {
    const computed = await computedWalletFromReferrals(userId);
    availableRub = computed.availableRub;
    pendingRub = computed.pendingRub;
    recentEarnings = computed.recentEarnings;
  }

  return {
    enabled: true,
    previewMode,
    commissionPercent: referralWalletCommissionPercent(),
    subscriptionRub,
    commissionPerPaymentRub,
    availableRub,
    pendingRub,
    totalEarnedRub: roundRub(availableRub + pendingRub),
    recentEarnings,
  };
}

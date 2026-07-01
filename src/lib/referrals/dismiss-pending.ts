import { ReferralStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { subscriptionAmountRub } from "@/lib/payments/config";
import {
  commissionRubFromSubscription,
  removeReferralWalletPending,
} from "@/lib/referrals/wallet";
import { referralWalletEnabled } from "@/lib/referrals/wallet-config";

/** Месяц без оплаты — можно убрать из списка ожидания. */
export const REFERRAL_DISMISS_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export function referralPendingCanDismiss(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() >= REFERRAL_DISMISS_AFTER_MS;
}

export async function dismissPendingReferral(
  referrerUserId: string,
  referralId: string,
): Promise<{ ok: true } | { error: "not_found" | "not_pending" | "too_early" }> {
  const row = await prisma.referral.findFirst({
    where: { id: referralId, referrerUserId },
    select: { id: true, status: true, createdAt: true, referredUserId: true },
  });
  if (!row) return { error: "not_found" };
  if (row.status !== ReferralStatus.pending) return { error: "not_pending" };
  if (!referralPendingCanDismiss(row.createdAt)) return { error: "too_early" };

  const pendingRub = referralWalletEnabled()
    ? commissionRubFromSubscription(subscriptionAmountRub())
    : 0;

  await prisma.$transaction(async (tx) => {
    await tx.referral.delete({ where: { id: row.id } });
    await tx.user.update({
      where: { id: row.referredUserId },
      data: { referredByUserId: null },
    });
  });

  if (pendingRub > 0) {
    await removeReferralWalletPending(referrerUserId, pendingRub);
  }

  return { ok: true };
}

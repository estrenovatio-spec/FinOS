import type { SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  isPaymentsConfigured,
  subscriptionAmountRub,
  subscriptionBillingTestMode,
  subscriptionEnforced,
  subscriptionPeriodDays,
  subscriptionTrialDays,
} from "@/lib/payments/config";
import type { SubscriptionPublic } from "@/lib/payments/types";

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) return null;
  const ms = end.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function toPublic(
  status: SubscriptionStatus | null,
  currentPeriodEnd: Date | null,
  onFreeAccess: boolean,
): SubscriptionPublic {
  const enforced = subscriptionEnforced();
  const now = new Date();
  const expiresIso = currentPeriodEnd?.toISOString() ?? null;
  const active =
    enforced &&
    status === "active" &&
    currentPeriodEnd !== null &&
    currentPeriodEnd > now;

  const daysRemaining = daysUntil(expiresIso);
  const activeForEnforced = enforced ? Boolean(active) : true;

  return {
    active: activeForEnforced,
    status: status ?? "none",
    expiresAt: expiresIso,
    enforced,
    priceRub: subscriptionAmountRub(),
    periodDays: subscriptionPeriodDays(),
    trialDays: subscriptionTrialDays(),
    onFreeAccess,
    showTrialBanner:
      enforced && activeForEnforced && onFreeAccess && daysRemaining !== null,
    daysRemaining,
    testMode: subscriptionBillingTestMode(),
    paymentsConfigured: isPaymentsConfigured(),
  };
}

async function userHasPaidSubscription(userId: string): Promise<boolean> {
  try {
    const paid = await prisma.payment.count({
      where: { userId, status: "succeeded" },
    });
    return paid > 0;
  } catch {
    return false;
  }
}

async function householdHasActiveSubscription(householdId: string): Promise<boolean> {
  const now = new Date();
  const members = await prisma.householdMember.findMany({
    where: { householdId },
    select: {
      user: {
        select: {
          subscription: {
            select: { status: true, currentPeriodEnd: true },
          },
        },
      },
    },
  });
  return members.some((member) => {
    const sub = member.user.subscription;
    return sub?.status === "active" && Boolean(sub.currentPeriodEnd && sub.currentPeriodEnd > now);
  });
}

export async function assertHouseholdSubscription(householdId: string): Promise<void> {
  if (!subscriptionEnforced()) return;
  if (await householdHasActiveSubscription(householdId)) return;
  throw new Error("subscription_required");
}

export async function getSubscriptionForUser(userId: string): Promise<SubscriptionPublic> {
  try {
    const [row, hasPaid, membership] = await Promise.all([
      prisma.subscription.findUnique({ where: { userId } }),
      userHasPaidSubscription(userId),
      prisma.householdMember.findFirst({
        where: { userId },
        select: { householdId: true },
      }),
    ]);
    const ownActive =
      row?.status === "active" && row.currentPeriodEnd !== null && row.currentPeriodEnd > new Date();
    const householdActive = membership?.householdId
      ? await householdHasActiveSubscription(membership.householdId)
      : false;
    const active = subscriptionEnforced() ? ownActive || householdActive : true;
    const base = toPublic(row?.status ?? null, row?.currentPeriodEnd ?? null, !hasPaid && ownActive);
    return {
      ...base,
      active,
      onFreeAccess: !hasPaid && ownActive,
      showTrialBanner: active && !hasPaid && ownActive && base.daysRemaining !== null,
    };
  } catch {
    return toPublic(null, null, true);
  }
}

export async function assertActiveSubscription(userId: string): Promise<void> {
  if (!subscriptionEnforced()) return;

  const row = await prisma.subscription.findUnique({ where: { userId } });
  const now = new Date();
  if (
    !row ||
    row.status !== "active" ||
    !row.currentPeriodEnd ||
    row.currentPeriodEnd <= now
  ) {
    throw new Error("subscription_required");
  }
}

/** Add days to subscription (stacks on current end date if still active). */
export async function extendSubscriptionDays(userId: string, days: number): Promise<Date> {
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error("invalid_subscription_days");
  }

  const now = new Date();
  const existing = await prisma.subscription.findUnique({ where: { userId } });
  const base =
    existing?.currentPeriodEnd && existing.currentPeriodEnd > now
      ? existing.currentPeriodEnd
      : now;
  const newEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

  await prisma.subscription.upsert({
    where: { userId },
    create: { userId, status: "active", currentPeriodEnd: newEnd },
    update: { status: "active", currentPeriodEnd: newEnd },
  });

  return newEnd;
}

export async function activateSubscription(userId: string): Promise<void> {
  await extendSubscriptionDays(userId, subscriptionPeriodDays());
  try {
    const { qualifyReferralOnReferredSubscriptionPayment } = await import(
      "@/lib/referrals/qualify"
    );
    await qualifyReferralOnReferredSubscriptionPayment(userId);
  } catch (e) {
    console.error("[subscription/referral-qualify]", e);
  }
}

/** Grant trial once per user (first bootstrap). Re-open after expiry does not re-grant. */
export async function ensureTrialForUser(userId: string): Promise<boolean> {
  if (!subscriptionEnforced()) return false;

  const trialDays = subscriptionTrialDays();
  if (trialDays <= 0) return false;

  if (await userHasPaidSubscription(userId)) return false;

  const [row, user] = await Promise.all([
    prisma.subscription.findUnique({ where: { userId } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { trialGrantedAt: true },
    }),
  ]);

  if (user?.trialGrantedAt) return false;

  const now = new Date();
  const hasActive =
    row?.status === "active" &&
    row.currentPeriodEnd !== null &&
    row.currentPeriodEnd > now;

  if (hasActive) {
    if (!user?.trialGrantedAt) {
      await prisma.user.update({
        where: { id: userId },
        data: { trialGrantedAt: new Date() },
      });
    }
    return false;
  }

  await extendSubscriptionDays(userId, trialDays);
  await prisma.user.update({
    where: { id: userId },
    data: { trialGrantedAt: new Date() },
  });
  return true;
}

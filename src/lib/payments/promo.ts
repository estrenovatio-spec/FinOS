import { prisma } from "@/lib/db";
import { subscriptionEnforced } from "@/lib/payments/config";
import { normalizePromoCode, PromoRedeemFailed } from "@/lib/payments/promo-code";
import { extendSubscriptionDays } from "@/lib/payments/subscription";

export interface PromoRedeemResult {
  bonusDays: number;
  expiresAt: string;
  label: string | null;
}

export async function redeemPromoCode(
  userId: string,
  rawCode: string,
): Promise<PromoRedeemResult> {
  if (!subscriptionEnforced()) {
    throw new PromoRedeemFailed("payments_not_enforced");
  }

  const code = normalizePromoCode(rawCode);
  if (code.length < 2) {
    throw new PromoRedeemFailed("invalid_promo_code");
  }

  const promo = await prisma.promoCode.findUnique({ where: { code } });
  if (!promo?.active) {
    throw new PromoRedeemFailed("promo_not_found");
  }

  const now = new Date();
  if (promo.validFrom && promo.validFrom > now) {
    throw new PromoRedeemFailed("promo_not_yet_valid");
  }
  if (promo.validUntil && promo.validUntil <= now) {
    throw new PromoRedeemFailed("promo_expired");
  }
  if (promo.maxUses !== null && promo.usesCount >= promo.maxUses) {
    throw new PromoRedeemFailed("promo_exhausted");
  }

  const already = await prisma.promoRedemption.findUnique({
    where: { promoCodeId_userId: { promoCodeId: promo.id, userId } },
  });
  if (already) {
    throw new PromoRedeemFailed("promo_already_used");
  }

  await prisma.$transaction([
    prisma.promoRedemption.create({
      data: { promoCodeId: promo.id, userId },
    }),
    prisma.promoCode.update({
      where: { id: promo.id },
      data: { usesCount: { increment: 1 } },
    }),
  ]);

  const expiresAt = await extendSubscriptionDays(userId, promo.bonusDays);
  return {
    bonusDays: promo.bonusDays,
    expiresAt: expiresAt.toISOString(),
    label: promo.label,
  };
}

export async function upsertPromoCode(opts: {
  code: string;
  bonusDays: number;
  label?: string | null;
  maxUses?: number | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
  active?: boolean;
}) {
  const code = normalizePromoCode(opts.code);
  if (code.length < 2) throw new Error("invalid_promo_code");
  if (!Number.isFinite(opts.bonusDays) || opts.bonusDays <= 0) {
    throw new Error("invalid_bonus_days");
  }

  return prisma.promoCode.upsert({
    where: { code },
    create: {
      code,
      label: opts.label?.trim() || null,
      bonusDays: opts.bonusDays,
      maxUses: opts.maxUses ?? null,
      validFrom: opts.validFrom ?? null,
      validUntil: opts.validUntil ?? null,
      active: opts.active ?? true,
    },
    update: {
      label: opts.label?.trim() || null,
      bonusDays: opts.bonusDays,
      maxUses: opts.maxUses ?? null,
      validFrom: opts.validFrom ?? null,
      validUntil: opts.validUntil ?? null,
      active: opts.active ?? true,
    },
  });
}

export async function listPromoCodes() {
  return prisma.promoCode.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      label: true,
      bonusDays: true,
      maxUses: true,
      usesCount: true,
      validFrom: true,
      validUntil: true,
      active: true,
      createdAt: true,
    },
  });
}

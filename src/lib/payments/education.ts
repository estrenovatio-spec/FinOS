import { prisma } from "@/lib/db";
import { isMissingDbObject } from "@/lib/household/db-capabilities";
import { getPublicSiteUrl } from "@/lib/site-url";
import { envInt } from "@/lib/payments/env-flags";
import { isPaymentsConfigured } from "@/lib/payments/config";
import {
  createRedirectYookassaPayment,
  type YookassaCheckoutResult,
} from "@/lib/payments/yookassa";

export type EducationAccessPublic = {
  paid: boolean;
  paidAt: string | null;
  priceRub: number;
  listPriceRub: number;
  paymentsConfigured: boolean;
};

export function educationAmountRub(): number {
  const n = envInt("EDUCATION_PRICE_RUB", "EDUCATION_PRICE_RUB_PREVIEW");
  return n !== undefined && n > 0 ? n : 5000;
}

export function educationListPriceRub(): number {
  const n = envInt("EDUCATION_LIST_PRICE_RUB", "EDUCATION_LIST_PRICE_RUB_PREVIEW");
  return n !== undefined && n > 0 ? n : 40000;
}

export function educationReturnUrl(): string {
  return `${getPublicSiteUrl()}/?payment=education_done`;
}

export async function getEducationAccessForUser(userId: string): Promise<EducationAccessPublic> {
  let paidAt: Date | null = null;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { educationPaidAt: true },
    });
    paidAt = user?.educationPaidAt ?? null;
  } catch (err) {
    if (!isMissingDbObject(err)) throw err;
    console.warn("[payments/education] User.educationPaidAt missing — run prisma/migrate-education-paid.sql");
  }
  return {
    paid: Boolean(paidAt),
    paidAt: paidAt?.toISOString() ?? null,
    priceRub: educationAmountRub(),
    listPriceRub: educationListPriceRub(),
    paymentsConfigured: isPaymentsConfigured(),
  };
}

export async function grantEducationAccess(userId: string): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { educationPaidAt: new Date() },
    });
  } catch (err) {
    if (!isMissingDbObject(err)) throw err;
    throw new Error("education_db_not_migrated");
  }
}

export async function createEducationCheckout(userId: string): Promise<YookassaCheckoutResult> {
  const access = await getEducationAccessForUser(userId);
  if (access.paid) {
    throw new Error("education_already_paid");
  }

  const amount = educationAmountRub();
  return createRedirectYookassaPayment({
    userId,
    amountRub: amount,
    description: "Просто Бюджет — курс финансовой грамотности (18 уроков)",
    returnUrl: educationReturnUrl(),
    metadata: { userId, product: "education" },
  });
}

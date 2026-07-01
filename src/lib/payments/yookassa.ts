import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  subscriptionAmountRub,
  yookassaCredentials,
  yookassaReturnUrl,
} from "@/lib/payments/config";
import {
  debitReferralWalletBalance,
  getReferralWalletAvailableRub,
} from "@/lib/referrals/wallet";
import { referralWalletEnabled } from "@/lib/referrals/wallet-config";
import { grantEducationAccess } from "@/lib/payments/education";
import { activateSubscription } from "@/lib/payments/subscription";
import type { YookassaNotification, YookassaPaymentObject } from "@/lib/payments/types";

const API_BASE = "https://api.yookassa.ru/v3";

function basicAuth(): string {
  const creds = yookassaCredentials();
  if (!creds) throw new Error("yookassa_not_configured");
  return Buffer.from(`${creds.shopId}:${creds.secretKey}`).toString("base64");
}

async function yookassaFetch<T>(
  path: string,
  init?: RequestInit & { idempotenceKey?: string },
): Promise<T> {
  const { idempotenceKey, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    Authorization: `Basic ${basicAuth()}`,
    "Content-Type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (idempotenceKey) headers["Idempotence-Key"] = idempotenceKey;

  const res = await fetch(`${API_BASE}${path}`, { ...rest, headers });
  const data = (await res.json()) as T & { description?: string; code?: string };
  if (!res.ok) {
    const msg = (data as { description?: string }).description ?? `yookassa_http_${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export type YookassaCheckoutResult = {
  paymentId?: string;
  confirmationUrl?: string;
  paidFromWallet?: boolean;
  walletUsedRub?: number;
  amountDueRub?: number;
};

export async function createRedirectYookassaPayment(opts: {
  userId: string;
  amountRub: number;
  description: string;
  returnUrl: string;
  metadata: Record<string, string>;
}): Promise<YookassaCheckoutResult> {
  const chargeRub = Math.max(1, Math.round(opts.amountRub * 100) / 100);

  const payment = await yookassaFetch<YookassaPaymentObject>("/payments", {
    method: "POST",
    idempotenceKey: randomUUID(),
    body: JSON.stringify({
      amount: { value: chargeRub.toFixed(2), currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: opts.returnUrl },
      description: opts.description,
      metadata: opts.metadata,
    }),
  });

  await prisma.payment.create({
    data: {
      userId: opts.userId,
      yookassaPaymentId: payment.id,
      amount: chargeRub,
      currency: "RUB",
      status: payment.status,
    },
  });

  const confirmationUrl = payment.confirmation?.confirmation_url;
  if (!confirmationUrl) throw new Error("yookassa_no_confirmation_url");

  return {
    paymentId: payment.id,
    confirmationUrl,
    amountDueRub: chargeRub,
  };
}

export async function createYookassaCheckout(
  userId: string,
  opts?: { useReferralWallet?: boolean },
): Promise<YookassaCheckoutResult> {
  const amount = subscriptionAmountRub();
  const returnUrl = yookassaReturnUrl();

  let walletApply = 0;
  if (opts?.useReferralWallet && referralWalletEnabled()) {
    const available = await getReferralWalletAvailableRub(userId);
    walletApply = Math.round(Math.min(available, amount) * 100) / 100;
  }

  if (walletApply >= amount - 0.009) {
    const used = await debitReferralWalletBalance(userId, amount);
    if (used >= amount - 0.009) {
      await activateSubscription(userId);
      return { paidFromWallet: true, walletUsedRub: used, amountDueRub: 0 };
    }
  }

  const chargeRub = Math.max(1, Math.round((amount - walletApply) * 100) / 100);
  const metadata: Record<string, string> = { userId, product: "subscription" };
  if (walletApply > 0) metadata.referralWalletRub = walletApply.toFixed(2);

  const result = await createRedirectYookassaPayment({
    userId,
    amountRub: chargeRub,
    description: `Просто Бюджет — облако и бот, ${process.env.YOOKASSA_SUBSCRIPTION_DAYS ?? 30} дн.`,
    returnUrl,
    metadata,
  });

  return {
    ...result,
    walletUsedRub: walletApply > 0 ? walletApply : undefined,
  };
}

export async function fetchYookassaPayment(paymentId: string): Promise<YookassaPaymentObject> {
  return yookassaFetch<YookassaPaymentObject>(`/payments/${encodeURIComponent(paymentId)}`);
}

export async function handleYookassaNotification(body: YookassaNotification): Promise<void> {
  if (body.type !== "notification") return;

  const paymentId = body.object?.id;
  if (!paymentId) return;

  const verified = await fetchYookassaPayment(paymentId);
  const userId = verified.metadata?.userId;
  if (!userId) {
    console.warn("[yookassa/webhook] payment without userId metadata", paymentId);
    return;
  }

  const existing = await prisma.payment.findUnique({
    where: { yookassaPaymentId: paymentId },
  });

  if (verified.status === "succeeded" && verified.paid) {
    await prisma.payment.upsert({
      where: { yookassaPaymentId: paymentId },
      create: {
        userId,
        yookassaPaymentId: paymentId,
        amount: Number.parseFloat(verified.amount.value),
        currency: verified.amount.currency,
        status: "succeeded",
        paidAt: verified.captured_at ? new Date(verified.captured_at) : new Date(),
      },
      update: {
        status: "succeeded",
        paidAt: verified.captured_at ? new Date(verified.captured_at) : new Date(),
      },
    });

    if (!existing || existing.status !== "succeeded") {
      const product = verified.metadata?.product ?? "subscription";
      if (product === "education") {
        await grantEducationAccess(userId);
        return;
      }
      const walletMeta = verified.metadata?.referralWalletRub;
      const walletRub = walletMeta ? Number.parseFloat(String(walletMeta)) : 0;
      if (walletRub > 0) {
        await debitReferralWalletBalance(userId, walletRub);
      }
      await activateSubscription(userId);
    }
    return;
  }

  if (existing) {
    await prisma.payment.update({
      where: { yookassaPaymentId: paymentId },
      data: { status: verified.status },
    });
  }
}

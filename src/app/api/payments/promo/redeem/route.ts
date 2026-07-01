import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dbUnavailable, unauthorized } from "@/lib/api/household-response";
import { requireSession } from "@/lib/api/household-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { householdAuthSchema } from "@/lib/household/auth-body";
import { requireTelegramUser } from "@/lib/household/require-telegram-user";
import { upsertTelegramUser } from "@/lib/household/service";
import { isPaymentsConfigured } from "@/lib/payments/config";
import { isPromoRedeemError } from "@/lib/payments/promo-code";
import { redeemPromoCode } from "@/lib/payments/promo";
import { getSubscriptionForUser } from "@/lib/payments/subscription";

const bodySchema = z.object({
  code: z.string().min(2).max(64),
});

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) return dbUnavailable();
  if (!isPaymentsConfigured()) {
    return NextResponse.json({ error: "payments_not_configured" }, { status: 503 });
  }

  let body: z.infer<typeof bodySchema>;
  let userId: string | null = null;

  const session = requireSession(req);
  if (session) {
    userId = session.userId;
    try {
      body = bodySchema.parse(await req.json());
    } catch {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
  } else {
    try {
      const raw = await req.json();
      householdAuthSchema.parse(raw);
      body = bodySchema.parse(raw);
      const tgUser = requireTelegramUser(raw);
      if (!tgUser) return unauthorized();
      const user = await upsertTelegramUser(tgUser);
      userId = user.id;
    } catch {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
  }

  if (!userId) return unauthorized();

  try {
    const result = await redeemPromoCode(userId, body.code);
    const subscription = await getSubscriptionForUser(userId);
    return NextResponse.json({ ok: true, ...result, subscription });
  } catch (e) {
    if (isPromoRedeemError(e)) {
      return NextResponse.json({ error: e.code }, { status: 400 });
    }
    console.error("[payments/promo/redeem]", e);
    return NextResponse.json({ error: "promo_redeem_failed" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { dbUnavailable, unauthorized } from "@/lib/api/household-response";
import { requireSession } from "@/lib/api/household-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { householdAuthSchema } from "@/lib/household/auth-body";
import { requireTelegramUser } from "@/lib/household/require-telegram-user";
import { upsertTelegramUser } from "@/lib/household/service";
import { isPaymentsConfigured } from "@/lib/payments/config";
import {
  createEducationCheckout,
  getEducationAccessForUser,
} from "@/lib/payments/education";

export const dynamic = "force-dynamic";

async function resolveUserIdFromBody(
  req: NextRequest,
  body: unknown,
): Promise<string | null> {
  const session = requireSession(req);
  if (session) return session.userId;

  try {
    const auth = householdAuthSchema.parse(body);
    const tgUser = requireTelegramUser(auth);
    if (!tgUser) return null;
    const user = await upsertTelegramUser(tgUser);
    return user.id;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!isDatabaseConfigured()) return dbUnavailable();

  const session = requireSession(req);
  if (!session) return unauthorized();

  const access = await getEducationAccessForUser(session.userId);
  return NextResponse.json({ ok: true, access });
}

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) return dbUnavailable();
  if (!isPaymentsConfigured()) {
    return NextResponse.json({ error: "payments_not_configured" }, { status: 503 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const userId = await resolveUserIdFromBody(req, body);
  if (!userId) return unauthorized();

  const access = await getEducationAccessForUser(userId);
  if (access.paid) {
    return NextResponse.json({ error: "education_already_paid" }, { status: 409 });
  }

  try {
    const result = await createEducationCheckout(userId);
    return NextResponse.json({
      ok: true,
      confirmationUrl: result.confirmationUrl,
      paymentId: result.paymentId,
      amountDueRub: result.amountDueRub,
    });
  } catch (e) {
    console.error("[payments/education/create]", e);
    const msg = e instanceof Error ? e.message : "checkout_failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

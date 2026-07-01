import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dbUnavailable } from "@/lib/api/household-response";
import { isDatabaseConfigured } from "@/lib/db";
import { householdAuthSchema } from "@/lib/household/auth-body";
import { upsertTelegramUser } from "@/lib/household/service";
import { requireTelegramUser } from "@/lib/household/require-telegram-user";
import { parseReferralInviteInput } from "@/lib/referrals/code";
import { referralsEnabled } from "@/lib/referrals/config";
import { isReferralSchemaReady } from "@/lib/referrals/schema-ready";
import { applyReferralFromCode, getReferralProfile } from "@/lib/referrals/service";

export const dynamic = "force-dynamic";

const bodySchema = householdAuthSchema.and(
  z.object({
    code: z.string().min(1).max(500),
  }),
);

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) return dbUnavailable();
  if (!referralsEnabled()) {
    return NextResponse.json({ ok: false, error: "referrals_disabled" }, { status: 403 });
  }
  if (!(await isReferralSchemaReady())) {
    return NextResponse.json({ ok: false, error: "referral_db_not_migrated" }, { status: 503 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const tgUser = requireTelegramUser(body);
  if (!tgUser) return NextResponse.json({ error: "invalid_init_data" }, { status: 401 });

  const code = parseReferralInviteInput(body.code);
  if (!code) {
    return NextResponse.json({ ok: false, error: "invalid_code" }, { status: 400 });
  }

  try {
    const user = await upsertTelegramUser(tgUser);
    const apply = await applyReferralFromCode(user.id, code);
    const profile = await getReferralProfile(user.id);
    return NextResponse.json({ ok: true, apply, ...profile });
  } catch (e) {
    console.error("[referral/apply]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

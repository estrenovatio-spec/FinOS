import { NextRequest, NextResponse } from "next/server";
import { dbUnavailable } from "@/lib/api/household-response";
import { isDatabaseConfigured } from "@/lib/db";
import { householdAuthSchema } from "@/lib/household/auth-body";
import { upsertTelegramUser } from "@/lib/household/service";
import { requireTelegramUser } from "@/lib/household/require-telegram-user";
import { referralsEnabled } from "@/lib/referrals/config";
import { isReferralSchemaReady } from "@/lib/referrals/schema-ready";
import { getReferralProfile } from "@/lib/referrals/service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) return dbUnavailable();

  if (!referralsEnabled()) {
    return NextResponse.json({ ok: true, enabled: false });
  }

  if (!(await isReferralSchemaReady())) {
    return NextResponse.json(
      { ok: false, enabled: true, error: "referral_db_not_migrated" },
      { status: 503 },
    );
  }

  let auth;
  try {
    auth = householdAuthSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const tgUser = requireTelegramUser(auth);
  if (!tgUser) return NextResponse.json({ error: "invalid_init_data" }, { status: 401 });

  try {
    const user = await upsertTelegramUser(tgUser);
    const profile = await getReferralProfile(user.id);
    return NextResponse.json({ ok: true, ...profile });
  } catch (e) {
    console.error("[referral/me]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { dbUnavailable } from "@/lib/api/household-response";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import { householdAuthSchema } from "@/lib/household/auth-body";
import { mapHouseholdApiError } from "@/lib/household/api-errors";
import { requireTelegramUser } from "@/lib/household/require-telegram-user";
import { signHouseholdSession } from "@/lib/household/token";
import { scheduleHouseholdMemberGoogleSheetLog } from "@/lib/google-sheets-schedule";
import {
  buildSyncPayload,
  getHouseholdSessionForUser,
  getUserMembership,
  upsertTelegramUser,
} from "@/lib/household/service";
import { referralCodeFromStartParam } from "@/lib/referrals/code";
import { referralsEnabled } from "@/lib/referrals/config";
import { isReferralSchemaReady } from "@/lib/referrals/schema-ready";
import {
  applyReferralFromCode,
  ensureUserReferralCode,
  getReferralProfile,
} from "@/lib/referrals/service";
import { getAccessSummaryForUser } from "@/lib/billing/access-summary";
import { ensureTrialForUser, getSubscriptionForUser } from "@/lib/payments/subscription";
import { getStartParamFromInitData } from "@/lib/telegram/start-param";

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) return dbUnavailable();

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
    const referralsOn = referralsEnabled();
    let referralProfile = null;

    if (referralsOn && (await isReferralSchemaReady())) {
      await ensureUserReferralCode(user.id);
      const startParam = auth.initData ? getStartParamFromInitData(auth.initData) : null;
      const refCode = referralCodeFromStartParam(startParam);
      if (refCode) {
        await applyReferralFromCode(user.id, refCode);
      }
      try {
        referralProfile = await getReferralProfile(user.id);
      } catch (refErr) {
        console.error("[household/bootstrap referral]", refErr);
      }
    }

    await ensureTrialForUser(user.id);
    const subscription = await getSubscriptionForUser(user.id);
    const accessSummary = await getAccessSummaryForUser(user.id);
    const membership = await getUserMembership(user.id);

    if (!user.googleSheetsOpenLogged) {
      const householdForSheet = membership
        ? (await getHouseholdSessionForUser(user.id))?.household ?? null
        : null;
      scheduleHouseholdMemberGoogleSheetLog({
        action: "open",
        tgUser,
        household: householdForSheet,
        logTag: "household/bootstrap",
        // Без облака флаг не ставим — после create/join запишем строку с кодом приглашения
        onSuccess: householdForSheet
          ? async () => {
              await prisma.user.update({
                where: { id: user.id },
                data: { googleSheetsOpenLogged: true },
              });
            }
          : undefined,
      });
    }

    if (!membership) {
      return NextResponse.json({
        ok: true,
        user: { id: user.id, firstName: user.firstName },
        household: null,
        token: null,
        sync: null,
        subscription,
        accessSummary,
        referralsEnabled: referralsOn,
        referralProfile,
      });
    }

    const token = signHouseholdSession({
      userId: user.id,
      householdId: membership.householdId,
    });

    if (subscription.enforced && !subscription.active) {
      const householdRow = await buildSyncPayload(membership.householdId, user.id);
      return NextResponse.json({
        ok: true,
        user: { id: user.id, firstName: user.firstName },
        household: householdRow.household,
        token,
        sync: null,
        subscription,
        accessSummary,
        referralsEnabled: referralsOn,
        referralProfile,
      });
    }

    const sync = await buildSyncPayload(membership.householdId, user.id);

    return NextResponse.json({
      ok: true,
      user: { id: user.id, firstName: user.firstName },
      household: sync.household,
      token,
      sync,
      subscription,
      accessSummary,
      referralsEnabled: referralsOn,
      referralProfile,
    });
  } catch (e) {
    console.error("[household/bootstrap]", e);
    const { code, status } = mapHouseholdApiError(e);
    return NextResponse.json({ error: code }, { status });
  }
}

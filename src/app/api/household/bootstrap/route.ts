import { NextRequest, NextResponse } from "next/server";
import { setHouseholdSessionCookie } from "@/lib/auth/session-cookie";
import { requireSession } from "@/lib/api/household-auth";
import { dbUnavailable } from "@/lib/api/household-response";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import { householdAuthBaseSchema } from "@/lib/household/auth-body";
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

  const existingSession = requireSession(req);
  let auth;
  try {
    auth = householdAuthBaseSchema.parse(await req.json());
  } catch {
    auth = {};
  }

  try {
    let user:
      | {
          id: string;
          firstName: string | null;
          email?: string | null;
          googleSheetsOpenLogged?: boolean;
        }
      | null = null;

    const tgUser = requireTelegramUser(auth);
    if (tgUser) {
      user = await upsertTelegramUser(tgUser);
    } else if (existingSession?.userId) {
      user = await prisma.user.findUnique({
        where: { id: existingSession.userId },
        select: {
          id: true,
          firstName: true,
          email: true,
          googleSheetsOpenLogged: true,
        },
      });
    }
    if (!user) {
      return NextResponse.json({
        ok: true,
        user: null,
        household: null,
        token: null,
        sync: null,
      });
    }

    const referralsOn = referralsEnabled();
    let referralProfile = null;

    if (tgUser && referralsOn && (await isReferralSchemaReady())) {
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

    if (tgUser && !user.googleSheetsOpenLogged) {
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
        user: { id: user.id, firstName: user.firstName, email: user.email ?? null },
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
      const response = NextResponse.json({
        ok: true,
        user: { id: user.id, firstName: user.firstName, email: user.email ?? null },
        household: householdRow.household,
        token,
        sync: null,
        subscription,
        accessSummary,
        referralsEnabled: referralsOn,
        referralProfile,
      });
      setHouseholdSessionCookie(response, token);
      return response;
    }

    const sync = await buildSyncPayload(membership.householdId, user.id);

    const response = NextResponse.json({
      ok: true,
      user: { id: user.id, firstName: user.firstName, email: user.email ?? null },
      household: sync.household,
      token,
      sync,
      subscription,
      accessSummary,
      referralsEnabled: referralsOn,
      referralProfile,
    });
    setHouseholdSessionCookie(response, token);
    return response;
  } catch (e) {
    console.error("[household/bootstrap]", e);
    const { code, status } = mapHouseholdApiError(e);
    return NextResponse.json({ error: code }, { status });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { dbUnavailable } from "@/lib/api/household-response";
import { isDatabaseConfigured } from "@/lib/db";
import { mapHouseholdApiError } from "@/lib/household/api-errors";
import {
  buildSyncPayload,
  getUserMembership,
} from "@/lib/household/service";
import { signHouseholdSession } from "@/lib/household/token";
import { consumeWebLoginToken } from "@/lib/household/web-login-token";
import { getAccessSummaryForUser } from "@/lib/billing/access-summary";
import { ensureTrialForUser, getSubscriptionForUser } from "@/lib/payments/subscription";

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) return dbUnavailable();

  let token = "";
  try {
    const body = (await req.json()) as { token?: unknown };
    token = typeof body.token === "string" ? body.token.trim() : "";
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!token) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  try {
    const userId = await consumeWebLoginToken(token);
    if (!userId) {
      return NextResponse.json({ error: "web_login_expired" }, { status: 401 });
    }

    await ensureTrialForUser(userId);
    const subscription = await getSubscriptionForUser(userId);
    const accessSummary = await getAccessSummaryForUser(userId);
    const membership = await getUserMembership(userId);

    if (!membership) {
      return NextResponse.json({
        ok: true,
        user: { id: userId, firstName: null },
        household: null,
        token: null,
        sync: null,
        subscription,
        accessSummary,
      });
    }

    const sessionToken = signHouseholdSession({
      userId,
      householdId: membership.householdId,
    });

    if (subscription.enforced && !subscription.active) {
      const householdRow = await buildSyncPayload(membership.householdId, userId);
      return NextResponse.json({
        ok: true,
        user: { id: userId, firstName: null },
        household: householdRow.household,
        token: sessionToken,
        sync: null,
        subscription,
        accessSummary,
      });
    }

    const sync = await buildSyncPayload(membership.householdId, userId);
    return NextResponse.json({
      ok: true,
      user: { id: userId, firstName: null },
      household: sync.household,
      token: sessionToken,
      sync,
      subscription,
      accessSummary,
    });
  } catch (e) {
    console.error("[household/web-login]", e);
    const { code, status } = mapHouseholdApiError(e);
    return NextResponse.json({ error: code }, { status });
  }
}

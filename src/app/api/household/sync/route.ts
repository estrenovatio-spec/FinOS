import { NextRequest, NextResponse } from "next/server";
import { dbUnavailable, forbidden, mapCloudGuardError, unauthorized } from "@/lib/api/household-response";
import { requireSession } from "@/lib/api/household-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { assertMember, buildSyncPayload } from "@/lib/household/service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isDatabaseConfigured()) return dbUnavailable();

  const session = requireSession(req);
  if (!session) return unauthorized();

  try {
    await assertMember(session.userId, session.householdId);
    const sync = await buildSyncPayload(session.householdId, session.userId);
    return NextResponse.json({ ok: true, sync });
  } catch (e) {
    const guard = mapCloudGuardError(e);
    if (guard) return guard;
    throw e;
  }
}

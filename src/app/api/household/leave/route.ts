import { NextResponse } from "next/server";
import { unauthorized, dbUnavailable } from "@/lib/api/household-response";
import { isDatabaseConfigured } from "@/lib/db";
import { mapHouseholdApiError } from "@/lib/household/api-errors";
import { leaveHousehold } from "@/lib/household/service";
import { verifyHouseholdSession } from "@/lib/household/token";

export async function POST(req: Request) {
  if (!isDatabaseConfigured()) return dbUnavailable();

  const header = req.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const session = token ? verifyHouseholdSession(token) : null;
  if (!session) return unauthorized();

  try {
    await leaveHousehold(session.userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[household/leave]", e);
    const { code, status } = mapHouseholdApiError(e);
    return NextResponse.json({ error: code }, { status });
  }
}

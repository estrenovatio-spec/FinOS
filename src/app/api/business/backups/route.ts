import { NextRequest, NextResponse } from "next/server";
import {
  backupUserBusinessPayload,
  fetchUserBusinessPayload,
  listUserBusinessBackups,
  restoreUserBusinessBackup,
} from "@/lib/business/db";
import { requireSession } from "@/lib/api/household-auth";
import {
  dbUnavailable,
  forbidden,
  mapCloudGuardError,
  unauthorized,
} from "@/lib/api/household-response";
import { isDatabaseConfigured } from "@/lib/db";
import { assertActiveSubscription } from "@/lib/payments/subscription";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isDatabaseConfigured()) return dbUnavailable();
  const session = requireSession(req);
  if (!session) return unauthorized();

  try {
    await assertActiveSubscription(session.userId);
    const backups = await listUserBusinessBackups(session.userId, 30);
    return NextResponse.json({ ok: true, backups });
  } catch (e) {
    const guard = mapCloudGuardError(e);
    if (guard) return guard;
    console.error("[business/backups GET]", e);
    return forbidden();
  }
}

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) return dbUnavailable();
  const session = requireSession(req);
  if (!session) return unauthorized();

  let body: { backupId?: string; action?: "create" | "restore" };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    await assertActiveSubscription(session.userId);
    if (body.action === "create") {
      const current = await fetchUserBusinessPayload(session.userId);
      const ok = current
        ? await backupUserBusinessPayload(session.userId, current, "manual")
        : false;
      const backups = await listUserBusinessBackups(session.userId, 30);
      return NextResponse.json({ ok, backups });
    }

    const backupId = body.backupId?.trim();
    if (!backupId) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    const business = await restoreUserBusinessBackup(session.userId, backupId);
    if (!business) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, business });
  } catch (e) {
    const guard = mapCloudGuardError(e);
    if (guard) return guard;
    console.error("[business/backups POST]", e);
    return forbidden();
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api/household-auth";
import { dbUnavailable, mapCloudGuardError, unauthorized } from "@/lib/api/household-response";
import { isDatabaseConfigured } from "@/lib/db";
import {
  backupHouseholdSnapshot,
  listHouseholdBackups,
  restoreHouseholdBackup,
} from "@/lib/household/backups";
import { assertMember } from "@/lib/household/service";
import type { SyncPayload } from "@/lib/household/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isDatabaseConfigured()) return dbUnavailable();
  const session = requireSession(req);
  if (!session) return unauthorized();

  try {
    await assertMember(session.userId, session.householdId);
    const backups = await listHouseholdBackups(session.householdId, 30);
    return NextResponse.json({ ok: true, backups });
  } catch (e) {
    const guard = mapCloudGuardError(e);
    if (guard) return guard;
    console.error("[household/backups GET]", e);
    return NextResponse.json({ error: "backup_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) return dbUnavailable();
  const session = requireSession(req);
  if (!session) return unauthorized();

  let body: { backupId?: string; action?: "create" | "restore"; snapshot?: SyncPayload | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    await assertMember(session.userId, session.householdId);

    if (body.action === "create") {
      const ok = await backupHouseholdSnapshot(
        session.householdId,
        session.userId,
        "manual",
        body.snapshot ?? null,
      );
      const backups = await listHouseholdBackups(session.householdId, 30);
      return NextResponse.json({ ok, backups });
    }

    const backupId = body.backupId?.trim();
    if (!backupId) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    const sync = await restoreHouseholdBackup(session.householdId, session.userId, backupId);
    if (!sync) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, sync });
  } catch (e) {
    const guard = mapCloudGuardError(e);
    if (guard) return guard;
    console.error("[household/backups POST]", e);
    return NextResponse.json({ error: "backup_failed" }, { status: 500 });
  }
}

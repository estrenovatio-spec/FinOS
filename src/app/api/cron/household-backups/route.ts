import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import {
  backupHouseholdSnapshot,
  ensureHouseholdBackupTables,
} from "@/lib/household/backups";
import { isDatabaseConfigured, prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cronAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth === `Bearer ${cronSecret}`) return true;
  }
  return isAdminAuthorized(req);
}

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 });
  }

  try {
    const ready = await ensureHouseholdBackupTables();
    if (!ready) return NextResponse.json({ error: "backup_tables_unavailable" }, { status: 503 });

    const rows = await prisma.household.findMany({
      select: {
        id: true,
        members: {
          orderBy: { createdAt: "asc" },
          select: { userId: true },
          take: 1,
        },
      },
    });

    let created = 0;
    for (const household of rows) {
      const ok = await backupHouseholdSnapshot(
        household.id,
        household.members[0]?.userId ?? null,
        "daily_21_msk",
      );
      if (ok) created += 1;
    }

    return NextResponse.json({ ok: true, checked: rows.length, created });
  } catch (e) {
    console.error("[cron/household-backups]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "cron_failed" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}

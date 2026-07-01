import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import {
  backupUserBusinessPayload,
  ensureBusinessCloudTables,
  hasMeaningfulBusinessPayload,
} from "@/lib/business/db";
import type { BusinessCloudPayload } from "@/lib/business/types";
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
    const ready = await ensureBusinessCloudTables();
    if (!ready) return NextResponse.json({ error: "business_tables_unavailable" }, { status: 503 });

    const rows = await prisma.$queryRaw<{ userId: string; payload: unknown }[]>`
      SELECT "userId", "payload"
      FROM "UserBusinessLedger"
    `;
    let created = 0;
    for (const row of rows) {
      const payload = row.payload as BusinessCloudPayload;
      if (!hasMeaningfulBusinessPayload(payload)) continue;
      const ok = await backupUserBusinessPayload(row.userId, payload, "daily_21_msk");
      if (ok) created += 1;
    }

    return NextResponse.json({ ok: true, checked: rows.length, created });
  } catch (e) {
    console.error("[cron/business-backups]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "cron_failed" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}

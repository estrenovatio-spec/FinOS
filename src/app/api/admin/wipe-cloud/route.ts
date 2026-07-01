import { NextRequest, NextResponse } from "next/server";
import { isCloudWipeAuthorized } from "@/lib/admin-wipe-auth";
import { dbUnavailable } from "@/lib/api/household-response";
import { isDatabaseConfigured } from "@/lib/db";
import { mapHouseholdApiError } from "@/lib/household/api-errors";
import { wipeAllCloudData } from "@/lib/household/wipe-cloud";

export const dynamic = "force-dynamic";

/**
 * POST — full cloud wipe. Requires ALL of:
 * - CLOUD_WIPE_ENABLED=true on server
 * - CLOUD_WIPE_SECRET (dedicated, not session secret)
 * - Authorization: Bearer <CLOUD_WIPE_SECRET>
 * - Header x-cloud-wipe-confirm: DELETE_ALL_HOUSEHOLDS
 */
export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) return dbUnavailable();

  if (!isCloudWipeAuthorized(req)) {
    return NextResponse.json({ error: "cloud_wipe_forbidden" }, { status: 403 });
  }

  try {
    const wiped = await wipeAllCloudData();
    return NextResponse.json({ ok: true, wiped });
  } catch (e) {
    console.error("[admin/wipe-cloud]", e);
    const { code, status } = mapHouseholdApiError(e);
    return NextResponse.json({ error: code }, { status });
  }
}

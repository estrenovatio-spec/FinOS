import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api/household-auth";
import { dbUnavailable, mapCloudGuardError, unauthorized } from "@/lib/api/household-response";
import { isDatabaseConfigured } from "@/lib/db";
import { deleteCloudDebt } from "@/lib/household/service";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return dbUnavailable();
  const session = requireSession(_req);
  if (!session) return unauthorized();

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  try {
    await deleteCloudDebt(session.userId, session.householdId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const guard = mapCloudGuardError(e);
    if (guard) return guard;
    throw e;
  }
}

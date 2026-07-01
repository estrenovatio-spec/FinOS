import { NextRequest, NextResponse } from "next/server";
import { dbUnavailable, forbidden, mapCloudGuardError, notFound, unauthorized } from "@/lib/api/household-response";
import { requireSession } from "@/lib/api/household-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { deleteCloudRecurring } from "@/lib/household/service";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return dbUnavailable();
  const session = requireSession(_req);
  if (!session) return unauthorized();
  const { id } = await params;

  try {
    await deleteCloudRecurring(session.userId, session.householdId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (!(e instanceof Error)) throw e;
    const guard = mapCloudGuardError(e);
    if (guard) return guard;
    if (e.message === "not_found") return notFound();
    throw e;
  }
}

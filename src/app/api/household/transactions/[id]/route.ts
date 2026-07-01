import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dbUnavailable, forbidden, mapCloudGuardError, notFound, unauthorized } from "@/lib/api/household-response";
import { requireSession } from "@/lib/api/household-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { buildSyncPayload, deleteCloudTransaction, updateCloudTransaction } from "@/lib/household/service";

const patchSchema = z.object({
  amount: z.number().positive().optional(),
  categoryId: z.string().optional(),
  owner: z.enum(["me", "partner"]).optional(),
  createdBy: z.string().nullable().optional(),
  type: z.enum(["income", "expense"]).optional(),
  goalId: z.string().nullable().optional(),
  goalAmount: z.number().nullable().optional(),
  confirmed: z.boolean().optional(),
  recurringId: z.string().nullable().optional(),
  odometerKm: z.number().finite().min(0).nullable().optional(),
  fuelLiters: z.number().finite().min(0).nullable().optional(),
  vehicleId: z.string().min(1).nullable().optional(),
  note: z.string().max(120).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return dbUnavailable();

  const session = requireSession(req);
  if (!session) return unauthorized();
  const { id } = await params;

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    await updateCloudTransaction(session.userId, session.householdId, id, body);
    const sync = await buildSyncPayload(session.householdId, session.userId);
    return NextResponse.json({ ok: true, sync });
  } catch (e) {
    if (!(e instanceof Error)) throw e;
    const guard = mapCloudGuardError(e);
    if (guard) return guard;
    if (e.message === "not_found") return notFound();
    throw e;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) return dbUnavailable();

  const session = requireSession(req);
  if (!session) return unauthorized();
  const { id } = await params;

  try {
    await deleteCloudTransaction(session.userId, session.householdId, id);
    const sync = await buildSyncPayload(session.householdId, session.userId);
    return NextResponse.json({ ok: true, sync });
  } catch (e) {
    if (!(e instanceof Error)) throw e;
    const guard = mapCloudGuardError(e);
    if (guard) return guard;
    if (e.message === "not_found") return notFound();
    throw e;
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dbUnavailable, forbidden, mapCloudGuardError, unauthorized } from "@/lib/api/household-response";
import { requireSession } from "@/lib/api/household-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { buildSyncPayload, createCloudTransaction } from "@/lib/household/service";

const bodySchema = z.object({
  id: z.string(),
  amount: z.number().positive(),
  type: z.enum(["income", "expense"]),
  categoryId: z.string(),
  currency: z.enum(["RUB", "USD", "EUR"]),
  note: z.string(),
  date: z.string(),
  owner: z.enum(["me", "partner"]),
  createdBy: z.string().min(1).optional(),
  goalId: z.string().nullable().optional(),
  goalAmount: z.number().nullable().optional(),
  confirmed: z.boolean().optional(),
  recurringId: z.string().nullable().optional(),
  odometerKm: z.number().nullable().optional(),
  fuelLiters: z.number().nullable().optional(),
  vehicleId: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) return dbUnavailable();

  const session = requireSession(req);
  if (!session) return unauthorized();

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    await createCloudTransaction(session.userId, session.householdId, body);
    const sync = await buildSyncPayload(session.householdId, session.userId);
    return NextResponse.json({ ok: true, sync });
  } catch (e) {
    const guard = mapCloudGuardError(e);
    if (guard) return guard;
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      const sync = await buildSyncPayload(session.householdId, session.userId);
      return NextResponse.json({ ok: true, sync });
    }
    throw e;
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api/household-auth";
import { dbUnavailable, mapCloudGuardError, unauthorized } from "@/lib/api/household-response";
import { isDatabaseConfigured } from "@/lib/db";
import { upsertCloudDebt } from "@/lib/household/service";

const bodySchema = z.object({
  id: z.string(),
  name: z.string(),
  owner: z.enum(["me", "partner", "all"]),
  balance: z.number(),
  minPayment: z.number(),
  ratePct: z.number().nullable(),
  nextPaymentDate: z.string().nullable(),
  strategy: z.enum(["avalanche", "snowball"]),
  priority: z.enum(["normal", "high"]),
  updatedAt: z.string().optional(),
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
    await upsertCloudDebt(session.userId, session.householdId, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const guard = mapCloudGuardError(e);
    if (guard) return guard;
    throw e;
  }
}

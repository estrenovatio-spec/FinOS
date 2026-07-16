import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dbUnavailable, forbidden, mapCloudGuardError, unauthorized } from "@/lib/api/household-response";
import { requireSession } from "@/lib/api/household-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { upsertCloudRecurring } from "@/lib/household/service";

const bodySchema = z.object({
  id: z.string(),
  amount: z.number().positive(),
  type: z.enum(["income", "expense"]),
  categoryId: z.string(),
  note: z.string(),
  owner: z.enum(["me", "partner"]),
  frequency: z.enum(["weekly", "monthly", "yearly"]),
  intervalMonths: z.number().int().min(1).max(60).nullable().optional(),
  dayOfMonth: z.number().nullable(),
  nextRunDate: z.string(),
  endDate: z.string().nullable().optional(),
  enabled: z.boolean(),
  skippedDates: z.array(z.string()).optional(),
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
    await upsertCloudRecurring(session.userId, session.householdId, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const guard = mapCloudGuardError(e);
    if (guard) return guard;
    throw e;
  }
}

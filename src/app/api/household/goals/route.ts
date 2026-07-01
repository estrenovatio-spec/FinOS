import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dbUnavailable, forbidden, mapCloudGuardError, unauthorized } from "@/lib/api/household-response";
import { requireSession } from "@/lib/api/household-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { depositCloudGoal, upsertCloudGoal } from "@/lib/household/service";

const bodySchema = z.object({
  id: z.string(),
  name: z.string(),
  targetAmount: z.number(),
  savedAmount: z.number(),
  deadline: z.string().nullable(),
  monthlyContribution: z.number().nullable().optional(),
  kind: z.enum(["custom", "emergency"]),
  emergencyMonths: z.number().nullable(),
});

const depositSchema = z.object({ amount: z.number().positive() });

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
    await upsertCloudGoal(session.userId, session.householdId, {
      ...body,
      monthlyContribution: body.monthlyContribution ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const guard = mapCloudGuardError(e);
    if (guard) return guard;
    throw e;
  }
}

export async function PATCH(req: NextRequest) {
  if (!isDatabaseConfigured()) return dbUnavailable();
  const session = requireSession(req);
  if (!session) return unauthorized();

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  let body: z.infer<typeof depositSchema>;
  try {
    body = depositSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    await depositCloudGoal(session.userId, session.householdId, id, body.amount);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (!(e instanceof Error)) throw e;
    const guard = mapCloudGuardError(e);
    if (guard) return guard;
    if (e.message === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}

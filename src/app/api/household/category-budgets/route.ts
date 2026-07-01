import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dbUnavailable, forbidden, mapCloudGuardError, unauthorized } from "@/lib/api/household-response";
import { requireSession } from "@/lib/api/household-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { upsertCloudCategoryBudget } from "@/lib/household/service";

const bodySchema = z.object({
  categoryId: z.string(),
  monthlyLimit: z.number().positive(),
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
    await upsertCloudCategoryBudget(session.userId, session.householdId, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const guard = mapCloudGuardError(e);
    if (guard) return guard;
    throw e;
  }
}

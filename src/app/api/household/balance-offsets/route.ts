import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  dbUnavailable,
  forbidden,
  mapCloudGuardError,
  unauthorized,
} from "@/lib/api/household-response";
import { requireSession } from "@/lib/api/household-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { buildSyncPayload, patchHouseholdBalanceOffset } from "@/lib/household/service";

const bodySchema = z.object({
  targetUserId: z.string().min(1),
  offset: z.number().finite(),
});

export async function PATCH(req: NextRequest) {
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
    await patchHouseholdBalanceOffset(
      session.userId,
      session.householdId,
      body.targetUserId,
      body.offset,
    );
    const sync = await buildSyncPayload(session.householdId, session.userId);
    return NextResponse.json({ ok: true, sync });
  } catch (e) {
    const guard = mapCloudGuardError(e);
    if (guard) return guard;
    if (e instanceof Error && e.message === "forbidden") {
      return forbidden();
    }
    throw e;
  }
}

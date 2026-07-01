import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dbUnavailable, forbidden, mapCloudGuardError, unauthorized } from "@/lib/api/household-response";
import { requireSession } from "@/lib/api/household-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { buildSyncPayload, patchHouseholdMoneySetup } from "@/lib/household/service";
import { MONEY_SETUP_INCOME_SOURCE_KINDS } from "@/lib/money-setup";

const incomeSourceSchema = z.object({
  id: z.string(),
  label: z.string(),
  expectedDate: z.string().nullable(),
  expectedAmount: z.number().finite().nullable(),
  kind: z.enum(MONEY_SETUP_INCOME_SOURCE_KINDS),
  isPrimary: z.boolean().optional(),
});

const moneySetupSchema = z.object({
  nextIncomeDate: z.string().nullable(),
  expectedIncomeAmount: z.number().finite().nullable(),
  incomeSources: z.array(incomeSourceSchema).optional().default([]),
  useHouseholdBalance: z.boolean(),
  requiredRecurringIds: z.array(z.string()),
  hasNoRequiredFixedExpenses: z.boolean().optional().default(false),
  essentialCategoryIds: z.array(z.string()),
  updatedAt: z.string().nullable(),
});

const bodySchema = z.object({
  moneySetup: moneySetupSchema,
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
    await patchHouseholdMoneySetup(session.userId, session.householdId, body.moneySetup);
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

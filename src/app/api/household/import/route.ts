import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dbUnavailable, forbidden, mapCloudGuardError, unauthorized } from "@/lib/api/household-response";
import { requireSession } from "@/lib/api/household-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { importLocalSnapshot, assertMember } from "@/lib/household/service";
import { MONEY_SETUP_INCOME_SOURCE_KINDS } from "@/lib/money-setup";

const txSchema = z.object({
  id: z.string(),
  amount: z.number(),
  type: z.enum(["income", "expense"]),
  categoryId: z.string(),
  currency: z.enum(["RUB", "USD", "EUR"]),
  note: z.string(),
  date: z.string(),
  owner: z.enum(["me", "partner"]).optional(),
  goalId: z.string().nullable().optional(),
  goalAmount: z.number().nullable().optional(),
  confirmed: z.boolean().optional(),
  recurringId: z.string().nullable().optional(),
  createdBy: z.string().nullable().optional(),
  odometerKm: z.number().nullable().optional(),
  fuelLiters: z.number().nullable().optional(),
  vehicleId: z.string().nullable().optional(),
  transferPairId: z.string().nullable().optional(),
  businessTxId: z.string().nullable().optional(),
});

const goalSchema = z.object({
  id: z.string(),
  name: z.string(),
  targetAmount: z.number(),
  savedAmount: z.number(),
  deadline: z.string().nullable().optional(),
  monthlyContribution: z.number().nullable().optional(),
  kind: z.enum(["custom", "emergency"]).optional(),
  emergencyMonths: z.number().nullable().optional(),
});

const categoryBudgetSchema = z.object({
  categoryId: z.string(),
  monthlyLimit: z.number(),
});

const recurringSchema = z.object({
  id: z.string(),
  amount: z.number(),
  type: z.enum(["income", "expense"]),
  categoryId: z.string(),
  note: z.string(),
  owner: z.enum(["me", "partner"]).optional(),
  frequency: z.enum(["weekly", "monthly", "yearly"]),
  intervalMonths: z.number().int().min(1).max(60).nullable().optional(),
  dayOfMonth: z.number().nullable(),
  nextRunDate: z.string(),
  endDate: z.string().nullable().optional(),
  enabled: z.boolean(),
  skippedDates: z.array(z.string()).optional(),
});

const incomeSourceSchema = z.object({
  id: z.string(),
  label: z.string(),
  expectedDate: z.string().nullable(),
  expectedAmount: z.number().finite().nullable(),
  kind: z.enum(MONEY_SETUP_INCOME_SOURCE_KINDS),
  recurrence: z.enum(["once", "monthly"]).optional(),
  intervalMonths: z.number().int().min(1).max(60).nullable().optional(),
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  endDate: z.string().nullable().optional(),
  isPrimary: z.boolean().optional(),
});

const debtSchema = z.object({
  id: z.string(),
  name: z.string(),
  owner: z.enum(["me", "partner", "all"]),
  balance: z.number(),
  minPayment: z.number(),
  ratePct: z.number().nullable(),
  nextPaymentDate: z.string().nullable(),
  strategy: z.enum(["avalanche", "snowball"]),
  priority: z.enum(["normal", "high"]).optional(),
});

const moneySetupSchema = z.object({
  nextIncomeDate: z.string().nullable(),
  expectedIncomeAmount: z.number().finite().nullable(),
  incomeSources: z.array(incomeSourceSchema).optional().default([]),
  useHouseholdBalance: z.boolean(),
  requiredRecurringIds: z.array(z.string()),
  hasNoRequiredFixedExpenses: z.boolean().optional().default(false),
  essentialCategoryIds: z.array(z.string()),
  expectedEventReminderStates: z
    .array(
      z.object({
        eventKey: z.string(),
        remindOn: z.string(),
      }),
    )
    .optional()
    .default([]),
  updatedAt: z.string().nullable(),
});

const bodySchema = z.object({
  transactions: z.array(txSchema),
  replaceTransactions: z.boolean().optional(),
  replacePlanning: z.boolean().optional(),
  savingsGoals: z.array(goalSchema).optional(),
  categoryBudgets: z.array(categoryBudgetSchema).optional(),
  recurringTransactions: z.array(recurringSchema).optional(),
  debts: z.array(debtSchema).optional(),
  moneySetup: moneySetupSchema.optional(),
  categories: z
    .array(
      z.object({
        id: z.string(),
        type: z.enum(["income", "expense"]),
        labels: z.object({ ru: z.string(), en: z.string() }),
        keywords: z.array(z.string()),
        isSystem: z.boolean(),
      }),
    )
    .optional(),
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
    await assertMember(session.userId, session.householdId);
    const sync = await importLocalSnapshot(session.userId, session.householdId, {
      transactions: body.transactions.map((t) => ({
        ...t,
        owner: t.owner ?? "me",
      })),
      categories: body.categories?.map((c) => ({
        id: c.id,
        type: c.type,
        labels: c.labels,
        keywords: c.keywords,
        isSystem: c.isSystem,
      })),
      savingsGoals: body.savingsGoals?.map((g) => ({
        ...g,
        deadline: g.deadline ?? null,
        monthlyContribution: g.monthlyContribution ?? null,
        kind: g.kind ?? "custom",
        emergencyMonths: g.emergencyMonths ?? null,
      })),
      categoryBudgets: body.categoryBudgets,
      recurringTransactions: body.recurringTransactions?.map((r) => ({
        ...r,
        owner: r.owner ?? "me",
        intervalMonths: r.frequency === "monthly" ? r.intervalMonths ?? 1 : null,
        skippedDates: r.skippedDates ?? [],
      })),
      debts: body.debts?.map((d) => ({
        ...d,
        priority: d.priority ?? "normal",
      })),
      moneySetup: body.moneySetup
        ? {
            ...body.moneySetup,
            incomeSources: body.moneySetup.incomeSources ?? [],
            hasNoRequiredFixedExpenses:
              body.moneySetup.hasNoRequiredFixedExpenses ?? false,
            expectedEventReminderStates:
              body.moneySetup.expectedEventReminderStates ?? [],
          }
        : undefined,
      replaceTransactions: body.replaceTransactions === true,
      replacePlanning: body.replacePlanning === true,
    });
    return NextResponse.json({ ok: true, sync });
  } catch (e) {
    const guard = mapCloudGuardError(e);
    if (guard) return guard;
    throw e;
  }
}

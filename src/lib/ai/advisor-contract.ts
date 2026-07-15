import { z } from "zod";

export const advisorMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

export const advisorContextCardSchema = z.object({
  label: z.string().min(1).max(100),
  value: z.string().min(1).max(200),
  note: z.string().min(1).max(400),
});

const advisorFinancialIncomeStatusSchema = z.enum([
  "expected",
  "confirmed",
  "overdue",
  "snoozed",
]);

const advisorRecurringIncomeSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  amount: z.number(),
  nextDate: z.string(),
  status: advisorFinancialIncomeStatusSchema,
});

const advisorOneOffIncomeSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  amount: z.number(),
  date: z.string(),
  status: advisorFinancialIncomeStatusSchema,
});

const advisorBudgetSchema = z.object({
  category: z.string().min(1).max(120),
  limit: z.number(),
  spent: z.number(),
  remaining: z.number(),
});

const advisorRecurringExpenseSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  amount: z.number(),
  nextDate: z.string(),
  status: z.enum(["active", "paused", "ended"]),
});

const advisorGoalSchema = z.object({
  title: z.string().min(1).max(200),
  targetAmount: z.number(),
  currentAmount: z.number(),
  deadline: z.string().nullable(),
});

export const advisorFinancialContextSchema = z.object({
  asOfDate: z.string(),
  balances: z.object({
    currentBalance: z.number(),
    plannedFreeMoney: z.number(),
    periodEndDate: z.string(),
  }),
  incomes: z.object({
    currentPeriodTotal: z.number(),
    expectedTotal: z.number(),
    confirmedTotal: z.number(),
    recurring: z.array(advisorRecurringIncomeSchema).max(24),
    oneOff: z.array(advisorOneOffIncomeSchema).max(24),
  }),
  expenses: z.object({
    recurringTotal: z.number(),
    recurring: z.array(advisorRecurringExpenseSchema).max(24),
    plannedBudgetsTotal: z.number(),
    budgets: z.array(advisorBudgetSchema).max(24),
    debtPaymentsTotal: z.number(),
    otherMandatoryPaymentsTotal: z.number(),
  }),
  goals: z.array(advisorGoalSchema).max(24),
  forecast: z.object({
    minimumBalance: z.number(),
    firstDeficitDate: z.string().nullable(),
    nearestRiskExplanation: z.string().nullable(),
  }),
});

export const advisorQuestionContextSchema = z.object({
  cards: z.array(advisorContextCardSchema).max(8),
  periodNote: z.string().max(200).optional(),
  periodEndDate: z.string().optional(),
  questionGuide: z.string().max(4000).optional(),
  financialContext: advisorFinancialContextSchema.optional(),
});

export const advisorQuestionRequestSchema = z.object({
  locale: z.enum(["ru", "en"]),
  userPlan: z.enum(["free", "standard", "pro"]).default("free"),
  question: z.string().min(1).max(1000),
  messages: z.array(advisorMessageSchema).max(12).default([]),
  context: advisorQuestionContextSchema,
});

export type AdvisorQuestionRequest = z.infer<typeof advisorQuestionRequestSchema>;

export function normalizeAdvisorQuestionRequestBody(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const record = input as Record<string, unknown>;
  if (record.context != null || record.advisorContext == null) return input;
  return {
    ...record,
    context: record.advisorContext,
  };
}

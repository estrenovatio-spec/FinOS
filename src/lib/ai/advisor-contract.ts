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

const advisorRiskLevelSchema = z.enum(["low", "medium", "high"]);

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
  financialHealth: z.object({
    liquidityScore: z.number(),
    debtLoad: z.number(),
    incomeStability: advisorRiskLevelSchema,
    riskLevel: advisorRiskLevelSchema,
  }),
  monthly: z.object({
    income: z.number(),
    expenses: z.number(),
    savingsRate: z.number(),
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

const advisorBriefActionSchema = z.object({
  priority: z.number().int().min(1).max(6),
  action: z.string().min(1).max(80),
  reason: z.string().min(1).max(400),
});

const adviserBriefScenarioActionSchema = z.object({
  level: z.number().int().min(1).max(6),
  action: z.string().min(1).max(80),
  label: z.string().min(1).max(200),
  reason: z.string().min(1).max(400),
});

const adviserScenarioSchema = z.object({
  original: z.object({
    incomeDate: z.string(),
  }),
  scenario: z.object({
    incomeDate: z.string(),
  }),
  impact: z.object({
    worstBalance: z.number(),
    riskDate: z.string().nullable(),
    plannedFreeMoneyAfter: z.number(),
  }),
  severity: advisorRiskLevelSchema,
  actions: z.array(adviserBriefScenarioActionSchema).max(8),
});

export const financialAdviserBriefSchema = z.object({
  questionType: z.string().min(1).max(80),
  summary: z.object({
    headline: z.string().min(1).max(400),
    currentBalance: z.number(),
    plannedFreeMoney: z.number(),
    periodEndDate: z.string(),
    forecastRisk: advisorRiskLevelSchema,
  }),
  cashFlow: z.object({
    monthlyIncome: z.number(),
    monthlyExpenses: z.number(),
    freeCashFlow: z.number(),
    savingsRate: z.number(),
  }),
  financialHealth: z.object({
    liquidityScore: z.number(),
    debtLoad: z.number(),
    incomeStability: advisorRiskLevelSchema,
    riskLevel: advisorRiskLevelSchema,
  }),
  expectedIncome: z.array(
    z.object({
      id: z.string().min(1).max(120),
      name: z.string().min(1).max(200),
      amount: z.number(),
      date: z.string(),
      status: advisorFinancialIncomeStatusSchema,
    }),
  ).max(12),
  upcomingRisks: z.array(
    z.object({
      date: z.string(),
      type: z.string().min(1).max(80),
      amount: z.number(),
      reason: z.string().min(1).max(400),
    }),
  ).max(12),
  expensePressure: z.array(
    z.object({
      name: z.string().min(1).max(200),
      amount: z.number(),
      kind: z.string().min(1).max(80),
    }),
  ).max(12),
  debtFocus: z.array(
    z.object({
      id: z.string().min(1).max(120),
      name: z.string().min(1).max(200),
      balance: z.number(),
      minPayment: z.number(),
      priorityReason: z.string().min(1).max(400),
    }),
  ).max(12),
  goals: z.object({
    activeGoals: z.number(),
    requiredAmount: z.number(),
    timeline: z.array(z.string()).max(12),
  }),
  purchaseAnalysis: z.object({
    targetAmount: z.number(),
    safeNowAmount: z.number(),
    gap: z.number(),
    impactOnFreeMoney: z.number(),
    firstDeficitDate: z.string().nullable(),
  }).nullable().optional(),
  scenarioAnalysis: adviserScenarioSchema.nullable().optional(),
  missingInputs: z.array(z.string().min(1).max(200)).max(12),
  recommendedActions: z.array(advisorBriefActionSchema).max(12),
  evidence: z.array(z.string().min(1).max(400)).max(20),
});

export const advisorQuestionContextSchema = z.object({
  cards: z.array(advisorContextCardSchema).max(8),
  periodNote: z.string().max(200).optional(),
  periodEndDate: z.string().optional(),
  questionGuide: z.string().max(4000).optional(),
  financialContext: advisorFinancialContextSchema.optional(),
  financialBrief: financialAdviserBriefSchema.optional(),
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

import assert from "node:assert/strict";
import test from "node:test";
import { buildFinancialAdviserBrief } from "@/lib/adviser/financial-analysis-engine";
import { buildAdvisorContext } from "@/lib/advisor-context";
import { getDefaultCategories } from "@/lib/categories";
import { decisionCoreSnapshot, type DecisionCoreState } from "@/lib/decision-core";
import { calculatePlannedFreeMoneyUntilPeriodEnd } from "@/lib/free-money";
import { emptyMoneySetup } from "@/lib/money-setup";
import { classifyAdvisorQuestion } from "@/lib/ai/question-classifier";

function makeState(overrides: Partial<DecisionCoreState> = {}): DecisionCoreState {
  return {
    locale: "ru",
    today: "2026-07-18",
    forecastHorizonMonths: 3,
    categories: getDefaultCategories(),
    transactions: [],
    householdFilter: "me",
    recurringTransactions: [
      {
        id: "salary-main",
        amount: 43000,
        type: "income",
        categoryId: "salary",
        note: "Трудовая",
        skippedDates: [],
        owner: "me",
        frequency: "monthly",
        intervalMonths: 1,
        dayOfMonth: 20,
        nextRunDate: "2026-07-20",
        endDate: null,
        enabled: true,
      },
      {
        id: "rent-main",
        amount: 53000,
        type: "expense",
        categoryId: "rent",
        note: "Аренда",
        skippedDates: [],
        owner: "me",
        frequency: "monthly",
        intervalMonths: 1,
        dayOfMonth: 20,
        nextRunDate: "2026-07-20",
        endDate: null,
        enabled: true,
      },
    ],
    debts: [
      {
        id: "water-debt",
        name: "ЖКХ вода",
        balance: 21000,
        minPayment: 5000,
        nextPaymentDate: "2026-07-20",
        ratePct: 0,
        strategy: "avalanche",
        owner: "me",
        priority: "high",
      },
    ],
    moneySetup: {
      ...emptyMoneySetup(),
      incomeSources: [
        {
          id: "salary-main",
          label: "Трудовая",
          expectedDate: "2026-07-20",
          expectedAmount: 43000,
          kind: "salary",
          recurrence: "monthly",
          intervalMonths: 1,
          dayOfMonth: 20,
          endDate: null,
          isPrimary: true,
        },
      ],
      essentialCategoryIds: ["groceries"],
    },
    categoryBudgets: [{ categoryId: "groceries", monthlyLimit: 12000 }],
    budgetMonthStartDay: 1,
    balances: { all: 97494, me: 97494, partner: 0 },
    ...overrides,
  };
}

function makeFinancialContext(state: DecisionCoreState) {
  const snapshot = decisionCoreSnapshot(state);
  const plannedFreeMoney = calculatePlannedFreeMoneyUntilPeriodEnd(state, snapshot);
  const context = buildAdvisorContext({
    locale: state.locale,
    today: state.today,
    currentBalance: state.balances.me,
    decision: snapshot,
    recurringTransactions: state.recurringTransactions,
    goals: [],
    debts: state.debts,
    categoryBudgets: state.categoryBudgets,
    plannedFreeMoney,
    categories: state.categories,
    budgetMonthStartDay: state.budgetMonthStartDay,
    transactions: state.transactions,
    expectedEventReminderStates: state.moneySetup.expectedEventReminderStates,
  });
  return { snapshot, financialContext: context.financialContext };
}

test("financial adviser engine builds purchase gap analysis from real FIN OS data", () => {
  const state = makeState();
  const { financialContext } = makeFinancialContext(state);
  const classification = classifyAdvisorQuestion("Можно купить машину за 1 500 000 ₽?");

  const brief = buildFinancialAdviserBrief({
    question: "Можно купить машину за 1 500 000 ₽?",
    classification,
    state,
    financialContext,
  });

  assert.equal(brief.questionType, "purchase_decision");
  assert.equal(brief.purchaseAnalysis?.targetAmount, 1_500_000);
  assert.ok((brief.purchaseAnalysis?.gap ?? 0) > 0);
  assert.ok(brief.evidence.some((line) => line.includes("Финансовый разрыв")));
});

test("financial adviser engine builds debt priority from real debts", () => {
  const state = makeState();
  const { financialContext } = makeFinancialContext(state);
  const classification = classifyAdvisorQuestion("Как лучше закрыть долги?");

  const brief = buildFinancialAdviserBrief({
    question: "Как лучше закрыть долги?",
    classification,
    state,
    financialContext,
  });

  assert.equal(brief.questionType, "debt_strategy");
  assert.equal(brief.debtFocus[0]?.name, "ЖКХ вода");
  assert.ok(brief.debtFocus[0]?.priorityReason.includes("просроч") || brief.debtFocus[0]?.priorityReason.includes("Небольш"));
});

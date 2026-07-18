import assert from "node:assert/strict";
import test from "node:test";
import { evaluateScenario } from "@/lib/adviser/scenario-analysis";
import { buildAdvisorContext } from "@/lib/advisor-context";
import { getDefaultCategories } from "@/lib/categories";
import { decisionCoreSnapshot, type DecisionCoreState } from "@/lib/decision-core";
import { calculatePlannedFreeMoneyUntilPeriodEnd } from "@/lib/free-money";
import { emptyMoneySetup } from "@/lib/money-setup";

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
        amount: 50000,
        type: "income",
        categoryId: "salary",
        note: "Зарплата",
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
        amount: 40000,
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
    debts: [],
    moneySetup: {
      ...emptyMoneySetup(),
      incomeSources: [
        {
          id: "salary-main",
          label: "Зарплата",
          expectedDate: "2026-07-20",
          expectedAmount: 50000,
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
    categoryBudgets: [{ categoryId: "groceries", monthlyLimit: 30000 }],
    budgetMonthStartDay: 1,
    balances: { all: 80925, me: 80925, partner: 0 },
    ...overrides,
  };
}

test("scenario analysis delays income by 7 days without suggesting a loan first", () => {
  const state = makeState();
  const snapshot = decisionCoreSnapshot(state);
  const plannedFreeMoney = calculatePlannedFreeMoneyUntilPeriodEnd(state, snapshot);
  const adviserContext = buildAdvisorContext({
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

  const result = evaluateScenario({
    state,
    financialContext: adviserContext.financialContext,
    incomeSourceId: "salary-main",
    currentIncomeDate: "2026-07-20",
    incomeDelayDays: 7,
    expectedIncomeAmount: 50000,
  });

  assert.equal(result.original.incomeDate, "2026-07-20");
  assert.equal(result.scenario.incomeDate, "2026-07-27");
  assert.ok(result.actions.length > 0);
  assert.equal(result.actions.some((action) => action.action === "consider_borrowing"), false);
});

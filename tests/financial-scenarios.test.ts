import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultCategories } from "@/lib/categories";
import type { DecisionCoreState } from "@/lib/decision-core";
import { evaluateFinancialScenario } from "@/lib/scenarios";

function makeState(overrides: Partial<DecisionCoreState> = {}): DecisionCoreState {
  return {
    locale: "ru",
    today: "2026-07-13",
    forecastHorizonMonths: 3,
    categories: getDefaultCategories(),
    transactions: [],
    householdFilter: "me",
    recurringTransactions: [],
    debts: [],
    moneySetup: {
      nextIncomeDate: null,
      expectedIncomeAmount: null,
      useHouseholdBalance: false,
      requiredRecurringIds: [],
      hasNoRequiredFixedExpenses: false,
      essentialCategoryIds: ["groceries"],
      expectedEventReminderStates: [],
      updatedAt: null,
      incomeSources: [],
    },
    categoryBudgets: [],
    budgetMonthStartDay: 1,
    balances: { all: 50000, me: 50000, partner: 0 },
    ...overrides,
  };
}

test("one-off purchase reduces planned free money by the exact amount and does not mutate state", () => {
  const state = makeState({
    moneySetup: {
      ...makeState().moneySetup,
      incomeSources: [
        {
          id: "salary",
          label: "Зарплата",
          expectedDate: "2026-07-14",
          expectedAmount: 24000,
          kind: "salary",
          recurrence: "monthly",
          intervalMonths: 1,
          dayOfMonth: 14,
          endDate: null,
          isPrimary: true,
        },
      ],
    },
    categoryBudgets: [{ categoryId: "groceries", monthlyLimit: 10000 }],
    recurringTransactions: [
      {
        id: "rent",
        amount: 12000,
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
  });
  const originalBalance = state.balances.me;
  const originalTransactions = state.transactions.length;

  const result = evaluateFinancialScenario(state, {
    type: "one_off_expense",
    amount: 7500,
    date: "2026-07-14",
    title: "Палатка",
  });

  assert.equal(
    result.baseline.plannedFreeMoney - result.scenario.plannedFreeMoney,
    7500,
  );
  assert.equal(state.balances.me, originalBalance);
  assert.equal(state.transactions.length, originalTransactions);
});

test("delaying an income changes the first deficit date without mutating the real plan", () => {
  const state = makeState({
    balances: { all: 5000, me: 5000, partner: 0 },
    moneySetup: {
      ...makeState().moneySetup,
      nextIncomeDate: "2026-07-14",
      incomeSources: [
        {
          id: "salary",
          label: "Зарплата",
          expectedDate: "2026-07-14",
          expectedAmount: 20000,
          kind: "salary",
          recurrence: "monthly",
          intervalMonths: 1,
          dayOfMonth: 14,
          endDate: null,
          isPrimary: true,
        },
      ],
    },
    recurringTransactions: [
      {
        id: "rent",
        amount: 10000,
        type: "expense",
        categoryId: "rent",
        note: "Аренда",
        skippedDates: [],
        owner: "me",
        frequency: "monthly",
        intervalMonths: 1,
        dayOfMonth: 15,
        nextRunDate: "2026-07-15",
        endDate: null,
        enabled: true,
      },
    ],
  });

  const result = evaluateFinancialScenario(state, {
    type: "delay_income",
    incomeSourceId: "salary",
    newDate: "2026-07-20",
  });

  assert.equal(result.baseline.firstDeficitDate, null);
  assert.equal(result.scenario.firstDeficitDate, "2026-07-15");
  assert.equal(state.moneySetup.incomeSources[0]?.expectedDate, "2026-07-14");
});

test("changing a recurring amount applies the delta to planned free money", () => {
  const state = makeState({
    recurringTransactions: [
      {
        id: "rent",
        amount: 10000,
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
  });

  const result = evaluateFinancialScenario(state, {
    type: "change_recurring_amount",
    recurringId: "rent",
    amount: 12000,
  });

  assert.equal(result.baseline.plannedFreeMoney - result.scenario.plannedFreeMoney, 2000);
  assert.equal(state.recurringTransactions[0]?.amount, 10000);
});

test("changing an essential budget rebuilds the forecast and lowers planned free money", () => {
  const state = makeState({
    categoryBudgets: [{ categoryId: "groceries", monthlyLimit: 10000 }],
  });

  const result = evaluateFinancialScenario(state, {
    type: "change_budget",
    categoryId: "groceries",
    monthlyLimit: 16000,
  });

  assert.equal(result.baseline.plannedFreeMoney - result.scenario.plannedFreeMoney, 6000);
  assert.equal(state.categoryBudgets[0]?.monthlyLimit, 10000);
});

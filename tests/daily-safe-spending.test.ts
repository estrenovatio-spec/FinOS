import assert from "node:assert/strict";
import test from "node:test";
import { calculateFreeMoneyUntilPeriodEnd } from "@/lib/free-money";
import type { DecisionCoreSnapshot, DecisionCoreState } from "@/lib/decision-core";

function makeState(overrides: Partial<DecisionCoreState> = {}): DecisionCoreState {
  return {
    locale: "ru",
    today: "2026-07-13",
    forecastHorizonMonths: 3,
    categories: [],
    transactions: [],
    householdFilter: "me",
    recurringTransactions: [],
    debts: [],
    moneySetup: {
      nextIncomeDate: null,
      expectedIncomeAmount: null,
      useHouseholdBalance: false,
      requiredRecurringIds: ["rent"],
      hasNoRequiredFixedExpenses: false,
      essentialCategoryIds: ["groceries"],
      updatedAt: null,
      incomeSources: [],
    },
    categoryBudgets: [],
    budgetMonthStartDay: 1,
    balances: { all: 45754, me: 45754, partner: 0 },
    ...overrides,
  };
}

function makeSnapshot(events: DecisionCoreSnapshot["forecast"]["events"]): DecisionCoreSnapshot {
  return {
    status: {
      key: "calm",
      title: "ok",
      toneClassName: "",
    },
    safeUntil: {
      status: "no_risk_in_horizon",
      title: "",
      note: null,
      isReady: true,
      needsSetup: false,
      rawStatus: "ready",
      safeToday: 0,
      nextIncomeDate: null,
      nextIncomeTitle: null,
      nextIncomeAmount: null,
      horizonEndDate: "2026-10-13",
      horizonMonths: 3,
      confidence: "confirmed",
      confidenceNote: null,
    },
    todayPayments: [],
    nextRisk: null,
    mainAction: {
      type: "hold",
      title: "",
      text: "",
      dueDate: null,
      amount: null,
      relatedEntityId: null,
      priority: "low",
      command: { type: "none" },
    },
    avoid: {
      text: null,
      reason: null,
    },
    allowed: {
      text: "",
      hasRestPermission: true,
      status: "available",
      amount: 0,
      horizonDate: null,
      reason: "",
      confidence: "confirmed",
      confidenceNote: null,
    },
    constraintExplanation: null,
    peaceIndex: { value: 0, note: "" },
    hasHistory: true,
    resolvedIncomeSources: [],
    forecast: {
      startBalance: 45754,
      minBalance: 0,
      minBalanceDate: null,
      firstDeficitDate: null,
      nextIncomeDate: "2026-07-14",
      horizonEndDate: "2026-10-13",
      horizonMonths: 3,
      events,
    },
  };
}

test("free money uses current actual balance and excludes future planned income", () => {
  const state = makeState();
  const snapshot = makeSnapshot([
    {
      id: "income-1",
      title: "Зарплата",
      amount: 24000,
      date: "2026-07-14",
      balanceAfter: 69754,
      source: "income_source",
    },
    {
      id: "rent-1",
      title: "Аренда",
      amount: -21000,
      date: "2026-07-20",
      balanceAfter: 24754,
      source: "pending_transaction",
    },
    {
      id: "essential-budget-2026-07-18",
      title: "Плановые повседневные траты",
      amount: -20432,
      date: "2026-07-18",
      balanceAfter: 43122,
      source: "essential_budget",
    },
  ]);

  const result = calculateFreeMoneyUntilPeriodEnd(state, snapshot);
  assert.equal(result.amount, 4322);
  assert.equal(result.breakdown?.mandatoryPayments, 21000);
  assert.equal(result.breakdown?.essentialPlannedSpending, 20432);
});

test("free money becomes zero after spending the whole free amount", () => {
  const baseState = makeState();
  const snapshot = makeSnapshot([
    {
      id: "rent-1",
      title: "Аренда",
      amount: -21000,
      date: "2026-07-20",
      balanceAfter: 24754,
      source: "pending_transaction",
    },
    {
      id: "essential-budget-2026-07-18",
      title: "Плановые повседневные траты",
      amount: -20432,
      date: "2026-07-18",
      balanceAfter: 43122,
      source: "essential_budget",
    },
  ]);

  const before = calculateFreeMoneyUntilPeriodEnd(baseState, snapshot);
  const after = calculateFreeMoneyUntilPeriodEnd(
    makeState({
      balances: { all: 41432, me: 41432, partner: 0 },
    }),
    snapshot,
  );

  assert.equal(before.amount, 4322);
  assert.equal(after.amount, 0);
});

test("optional recurring expense does not reduce free money, required recurring does", () => {
  const state = makeState({
    recurringTransactions: [
      {
        id: "rent",
        amount: 15000,
        type: "expense",
        categoryId: "home",
        note: "Аренда",
        owner: "me",
        frequency: "monthly",
        nextRunDate: "2026-07-20",
        dayOfMonth: 20,
        intervalMonths: 1,
        enabled: true,
      },
      {
        id: "fun",
        amount: 5000,
        type: "expense",
        categoryId: "fun",
        note: "Развлечения",
        owner: "me",
        frequency: "monthly",
        nextRunDate: "2026-07-22",
        dayOfMonth: 22,
        intervalMonths: 1,
        enabled: true,
      },
    ],
    moneySetup: {
      ...makeState().moneySetup,
      requiredRecurringIds: ["rent"],
    },
  });
  const snapshot = makeSnapshot([
    {
      id: "recurring-rent-2026-07-20",
      title: "Аренда",
      amount: -15000,
      date: "2026-07-20",
      balanceAfter: 30754,
      source: "recurring",
      recurringId: "rent",
    },
    {
      id: "recurring-fun-2026-07-22",
      title: "Развлечения",
      amount: -5000,
      date: "2026-07-22",
      balanceAfter: 25754,
      source: "recurring",
      recurringId: "fun",
    },
  ]);

  const result = calculateFreeMoneyUntilPeriodEnd(state, snapshot);
  assert.equal(result.breakdown?.mandatoryPayments, 15000);
  assert.equal(result.amount, 30754);
});

test("last day of the budget period rolls free-money horizon to the next period", () => {
  const state = makeState({
    today: "2026-07-13",
    budgetMonthStartDay: 14,
  });
  const snapshot = makeSnapshot([]);

  const result = calculateFreeMoneyUntilPeriodEnd(state, snapshot);
  assert.equal(result.periodEndDate, "2026-08-13");
});

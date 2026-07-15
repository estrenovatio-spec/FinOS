import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateFreeMoneyUntilPeriodEnd,
  calculatePlannedFreeMoneyUntilPeriodEnd,
} from "@/lib/free-money";
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
      requiredRecurringIds: [],
      hasNoRequiredFixedExpenses: false,
      essentialCategoryIds: ["groceries"],
      expectedEventReminderStates: [],
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

test("free money treats active recurring expenses as planned by default", () => {
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
    ],
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
  ]);

  const result = calculateFreeMoneyUntilPeriodEnd(state, snapshot);
  assert.equal(result.breakdown?.mandatoryPayments, 15000);
  assert.equal(result.amount, 30754);
});

test("legacy required recurring selection does not double count recurring expenses", () => {
  const state = makeState({
    moneySetup: {
      ...makeState().moneySetup,
      requiredRecurringIds: ["rent-series"],
    },
  });
  const snapshot = makeSnapshot([
    {
      id: "recurring-rent-2026-07-20",
      title: "Аренда квартиры",
      amount: -10000,
      date: "2026-07-20",
      balanceAfter: 35754,
      source: "recurring",
      recurringId: "rent-series",
    },
  ]);

  const result = calculatePlannedFreeMoneyUntilPeriodEnd(state, snapshot);
  assert.equal(result.breakdown?.recurringPayments, 10000);
  assert.equal(result.breakdown?.mandatoryPayments, 10000);
  assert.equal(result.amount, 35754);
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

test("planned free money includes recurring income from the current period", () => {
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
        },
      ],
    },
  });
  const snapshot = makeSnapshot([
    {
      id: "salary-1",
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
  snapshot.resolvedIncomeSources = [
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
      occurrenceId: "income-salary-2026-07-14",
      occurrenceDate: "2026-07-14",
      status: "scheduled",
      matchedTransactionId: null,
      matchedTransactionDate: null,
    },
  ];

  const result = calculatePlannedFreeMoneyUntilPeriodEnd(state, snapshot);
  assert.equal(result.amount, 28322);
  assert.equal(result.breakdown?.expectedRecurringIncome, 24000);
  assert.equal(result.breakdown?.periodStartDate, "2026-07-13");
  assert.equal(result.includesUnconfirmedIncome, false);
});

test("planned free money includes one-off expected income inside the current period plan", () => {
  const state = makeState({
    moneySetup: {
      ...makeState().moneySetup,
      incomeSources: [
        {
          id: "sale",
          label: "Продажа",
          expectedDate: "2026-07-14",
          expectedAmount: 24000,
          kind: "other",
          recurrence: "once",
          intervalMonths: 1,
          dayOfMonth: 14,
          endDate: null,
        },
      ],
    },
  });
  const snapshot = makeSnapshot([]);
  snapshot.resolvedIncomeSources = [
    {
      id: "sale",
      label: "Продажа",
      expectedDate: "2026-07-14",
      expectedAmount: 24000,
      kind: "other",
      recurrence: "once",
      intervalMonths: 1,
      dayOfMonth: 14,
      endDate: null,
      occurrenceId: "income-sale-2026-07-14",
      occurrenceDate: "2026-07-14",
      status: "scheduled",
      matchedTransactionId: null,
      matchedTransactionDate: null,
    },
  ];

  const actual = calculateFreeMoneyUntilPeriodEnd(state, snapshot);
  const planned = calculatePlannedFreeMoneyUntilPeriodEnd(state, snapshot);
  assert.equal(actual.amount, 45754);
  assert.equal(planned.amount, 69754);
  assert.equal(planned.breakdown?.expectedRecurringIncome, 24000);
});

test("planned free money decreases one-to-one after optional spending", () => {
  const baseState = makeState({
    moneySetup: {
      ...makeState().moneySetup,
      incomeSources: [
        {
          id: "salary",
          label: "Зарплата",
          expectedDate: "2026-07-14",
          expectedAmount: 11592,
          kind: "salary",
          recurrence: "monthly",
          intervalMonths: 1,
          dayOfMonth: 14,
          endDate: null,
        },
      ],
    },
  });
  const snapshot = makeSnapshot([
    {
      id: "rent-1",
      title: "Аренда",
      amount: -25000,
      date: "2026-07-20",
      balanceAfter: 20754,
      source: "pending_transaction",
    },
    {
      id: "essential-budget-2026-07-18",
      title: "Плановые повседневные траты",
      amount: -20754,
      date: "2026-07-18",
      balanceAfter: 25000,
      source: "essential_budget",
    },
  ]);
  snapshot.resolvedIncomeSources = [
    {
      id: "salary",
      label: "Зарплата",
      expectedDate: "2026-07-14",
      expectedAmount: 11592,
      kind: "salary",
      recurrence: "monthly",
      intervalMonths: 1,
      dayOfMonth: 14,
      endDate: null,
      occurrenceId: "income-salary-2026-07-14",
      occurrenceDate: "2026-07-14",
      status: "due_today",
      matchedTransactionId: null,
      matchedTransactionDate: null,
    },
  ];

  const before = calculatePlannedFreeMoneyUntilPeriodEnd(baseState, snapshot);
  const after = calculatePlannedFreeMoneyUntilPeriodEnd(
    makeState({
      balances: { all: 40754, me: 40754, partner: 0 },
      moneySetup: baseState.moneySetup,
    }),
    snapshot,
  );

  assert.equal(before.amount, 11592);
  assert.equal(after.amount, 6592);
  assert.equal(after.includesUnconfirmedIncome, true);
});

test("planned free money becomes zero after spending the whole planned amount", () => {
  const state = makeState({
    moneySetup: {
      ...makeState().moneySetup,
      incomeSources: [
        {
          id: "salary",
          label: "Зарплата",
          expectedDate: "2026-07-14",
          expectedAmount: 11592,
          kind: "salary",
          recurrence: "monthly",
          intervalMonths: 1,
          dayOfMonth: 14,
          endDate: null,
        },
      ],
    },
    balances: { all: 34162, me: 34162, partner: 0 },
  });
  const snapshot = makeSnapshot([
    {
      id: "rent-1",
      title: "Аренда",
      amount: -25000,
      date: "2026-07-20",
      balanceAfter: 20754,
      source: "pending_transaction",
    },
    {
      id: "essential-budget-2026-07-18",
      title: "Плановые повседневные траты",
      amount: -20754,
      date: "2026-07-18",
      balanceAfter: 25000,
      source: "essential_budget",
    },
  ]);
  snapshot.resolvedIncomeSources = [
    {
      id: "salary",
      label: "Зарплата",
      expectedDate: "2026-07-14",
      expectedAmount: 11592,
      kind: "salary",
      recurrence: "monthly",
      intervalMonths: 1,
      dayOfMonth: 14,
      endDate: null,
      occurrenceId: "income-salary-2026-07-14",
      occurrenceDate: "2026-07-14",
      status: "due_today",
      matchedTransactionId: null,
      matchedTransactionDate: null,
    },
  ];

  const result = calculatePlannedFreeMoneyUntilPeriodEnd(state, snapshot);
  assert.equal(result.amount, 0);
});

test("planned free money subtracts recurring expense occurrence inside the current period", () => {
  const state = makeState();
  const snapshot = makeSnapshot([
    {
      id: "recurring-rent-2026-07-20",
      title: "Аренда квартиры",
      amount: -10000,
      date: "2026-07-20",
      balanceAfter: 35754,
      source: "recurring",
      recurringId: "rent-series",
    },
  ]);

  const result = calculatePlannedFreeMoneyUntilPeriodEnd(state, snapshot);
  assert.equal(result.breakdown?.recurringPayments, 10000);
  assert.equal(result.breakdown?.mandatoryPayments, 10000);
  assert.equal(result.amount, 35754);
});

test("planned free money ignores recurring expense outside the current period", () => {
  const state = makeState();
  const snapshot = makeSnapshot([
    {
      id: "recurring-rent-2026-08-20",
      title: "Аренда квартиры",
      amount: -10000,
      date: "2026-08-20",
      balanceAfter: 35754,
      source: "recurring",
      recurringId: "rent-series",
    },
  ]);

  const result = calculatePlannedFreeMoneyUntilPeriodEnd(state, snapshot);
  assert.equal(result.breakdown?.recurringPayments, 0);
  assert.equal(result.breakdown?.mandatoryPayments, 0);
});

test("planned free money includes recurring income events from the current period", () => {
  const state = makeState();
  const snapshot = makeSnapshot([
    {
      id: "recurring-side-income-2026-07-15",
      title: "Подработка",
      amount: 18000,
      date: "2026-07-15",
      balanceAfter: 63754,
      source: "recurring",
      recurringId: "side-income",
    },
  ]);

  const result = calculatePlannedFreeMoneyUntilPeriodEnd(state, snapshot);
  assert.equal(result.breakdown?.expectedRecurringIncome, 18000);
  assert.equal(result.amount, 63754);
  assert.equal(result.includesUnconfirmedIncome, true);
});

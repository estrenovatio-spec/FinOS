import assert from "node:assert/strict";
import test from "node:test";
import { decisionCoreSnapshot } from "@/lib/decision-core";
import { getDefaultCategories } from "@/lib/categories";
import { emptyMoneySetup } from "@/lib/money-setup";
import {
  groupForecastEventsByDate,
  resolveForecastFocus,
} from "@/lib/forecast-focus";
import type { BalanceForecast, DecisionCoreState } from "@/lib/decision-core/types";
import type { Transaction } from "@/types";
import type { DebtItem, RecurringTransaction } from "@/types/planning";

function tx(
  partial: Partial<Transaction> &
    Pick<Transaction, "id" | "amount" | "type" | "categoryId" | "date">,
): Transaction {
  return {
    id: partial.id,
    amount: partial.amount,
    type: partial.type,
    categoryId: partial.categoryId,
    currency: "RUB",
    note: partial.note ?? "",
    date: partial.date,
    owner: partial.owner ?? "me",
    confirmed: partial.confirmed,
    goalId: null,
    goalAmount: null,
    recurringId: partial.recurringId ?? null,
    odometerKm: null,
    fuelLiters: null,
    vehicleId: null,
    transferPairId: null,
    businessTxId: null,
  };
}

function recurring(
  partial: Partial<RecurringTransaction> &
    Pick<
      RecurringTransaction,
      "id" | "amount" | "type" | "categoryId" | "nextRunDate" | "frequency"
    >,
): RecurringTransaction {
  return {
    id: partial.id,
    amount: partial.amount,
    type: partial.type,
    categoryId: partial.categoryId,
    note: partial.note ?? "",
    skippedDates: partial.skippedDates ?? [],
    owner: partial.owner ?? "me",
    frequency: partial.frequency,
    intervalMonths: partial.intervalMonths ?? 1,
    dayOfMonth: partial.dayOfMonth ?? 15,
    nextRunDate: partial.nextRunDate,
    enabled: partial.enabled ?? true,
    updatedAt: partial.updatedAt,
  };
}

function debt(
  partial: Partial<DebtItem> &
    Pick<DebtItem, "id" | "name" | "balance" | "minPayment">,
): DebtItem {
  return {
    id: partial.id,
    name: partial.name,
    owner: partial.owner ?? "me",
    balance: partial.balance,
    minPayment: partial.minPayment,
    ratePct: partial.ratePct ?? null,
    nextPaymentDate: partial.nextPaymentDate ?? null,
    strategy: partial.strategy ?? "avalanche",
    priority: partial.priority ?? "normal",
    updatedAt: partial.updatedAt,
  };
}

function buildState(input?: {
  today?: string;
  transactions?: Transaction[];
  recurringTransactions?: RecurringTransaction[];
  debts?: DebtItem[];
  balances?: { all: number; me: number; partner: number };
  moneySetup?: ReturnType<typeof emptyMoneySetup>;
}): DecisionCoreState {
  return {
    locale: "ru",
    today: input?.today ?? "2026-07-10",
    categories: getDefaultCategories(),
    transactions: input?.transactions ?? [],
    householdFilter: "all",
    recurringTransactions: input?.recurringTransactions ?? [],
    debts: input?.debts ?? [],
    moneySetup: input?.moneySetup ?? emptyMoneySetup(),
    categoryBudgets: [],
    balances: input?.balances ?? { all: 0, me: 0, partner: 0 },
  };
}

function forecastFromState(state: DecisionCoreState) {
  return decisionCoreSnapshot(state).forecast;
}

test("focus date matches an exact forecast date and keeps all events on that date", () => {
  const forecast = forecastFromState(
    buildState({
      balances: { all: 50000, me: 50000, partner: 0 },
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-20",
        expectedIncomeAmount: 60000,
        hasNoRequiredFixedExpenses: true,
      },
      transactions: [
        tx({
          id: "school",
          amount: 5000,
          type: "expense",
          categoryId: "kids_family",
          date: "2026-07-14",
          confirmed: false,
          note: "Школа",
        }),
        tx({
          id: "internet",
          amount: 1200,
          type: "expense",
          categoryId: "services",
          date: "2026-07-14T23:59:00.000Z",
          confirmed: false,
          note: "Интернет",
        }),
      ],
    }),
  );

  const resolution = resolveForecastFocus(forecast, {
    date: "2026-07-14",
    source: "today_main_action",
    reason: "future_deficit",
    eventId: "internet",
  });
  const groups = groupForecastEventsByDate(forecast);
  const selectedGroup = groups.find((group) => group.date === resolution.selectedDate);

  assert.equal(resolution.exactMatch, true);
  assert.equal(resolution.selectedDate, "2026-07-14");
  assert.equal(resolution.selectedEventId, "internet");
  assert.equal(selectedGroup?.events.length, 2);
});

test("missing eventId keeps focus on the date without hiding other events", () => {
  const forecast: BalanceForecast = {
    startBalance: 10000,
    minBalance: 5800,
    minBalanceDate: "2026-07-14",
    firstDeficitDate: null,
    nextIncomeDate: "2026-07-20",
    horizonEndDate: "2026-07-31",
    events: [
      {
        id: "school",
        title: "School",
        amount: -3000,
        date: "2026-07-14",
        balanceAfter: 7000,
        source: "pending_transaction",
      },
      {
        id: "internet",
        title: "Internet",
        amount: -1200,
        date: "2026-07-14",
        balanceAfter: 5800,
        source: "pending_transaction",
      },
    ],
  };

  const resolution = resolveForecastFocus(forecast, {
    date: "2026-07-14",
    source: "today_main_action",
    reason: "reserve_required",
  });
  const group = groupForecastEventsByDate(forecast).find(
    (item) => item.date === "2026-07-14",
  );

  assert.equal(resolution.selectedDate, "2026-07-14");
  assert.equal(resolution.selectedEventId, null);
  assert.equal(group?.events.length, 2);
  assert.equal(group?.balanceAfter, 5800);
});

test("ISO datetime and late-night timestamps normalize to the same local calendar day", () => {
  const forecast: BalanceForecast = {
    startBalance: 10000,
    minBalance: 7000,
    minBalanceDate: "2026-07-10",
    firstDeficitDate: null,
    nextIncomeDate: "2026-07-20",
    horizonEndDate: "2026-07-31",
    events: [
      {
        id: "late-night",
        title: "Late night",
        amount: -3000,
        date: "2026-07-10T23:59:59.000Z",
        balanceAfter: 7000,
        source: "pending_transaction",
      },
    ],
  };

  const resolution = resolveForecastFocus(forecast, {
    date: "2026-07-10T00:15:00.000Z",
    source: "today_main_action",
    reason: "future_deficit",
  });

  assert.equal(resolution.selectedDate, "2026-07-10");
  assert.equal(resolution.exactMatch, true);
});

test("missing date inside the horizon falls back to the nearest available forecast date", () => {
  const forecast: BalanceForecast = {
    startBalance: 8000,
    minBalance: 4000,
    minBalanceDate: "2026-07-12",
    firstDeficitDate: null,
    nextIncomeDate: "2026-07-20",
    horizonEndDate: "2026-07-31",
    events: [
      {
        id: "a",
        title: "A",
        amount: -1000,
        date: "2026-07-12",
        balanceAfter: 7000,
        source: "pending_transaction",
      },
      {
        id: "b",
        title: "B",
        amount: -3000,
        date: "2026-07-16",
        balanceAfter: 4000,
        source: "recurring",
      },
    ],
  };

  const resolution = resolveForecastFocus(forecast, {
    date: "2026-07-15",
    source: "today_main_action",
    reason: "reserve_required",
  });

  assert.equal(resolution.exactMatch, false);
  assert.equal(resolution.selectedDate, "2026-07-16");
  assert.equal(resolution.outOfHorizon, false);
});

test("date outside the forecast horizon is handled safely", () => {
  const forecast: BalanceForecast = {
    startBalance: 8000,
    minBalance: 4000,
    minBalanceDate: "2026-07-12",
    firstDeficitDate: null,
    nextIncomeDate: "2026-07-20",
    horizonEndDate: "2026-07-31",
    events: [],
  };

  const resolution = resolveForecastFocus(forecast, {
    date: "2026-08-12",
    source: "today_main_action",
    reason: "future_deficit",
  });

  assert.equal(resolution.outOfHorizon, true);
  assert.equal(resolution.selectedDate, null);
});

test("future deficit focus date is reproducible from the same forecast line", () => {
  const snapshot = decisionCoreSnapshot(
    buildState({
      balances: { all: 12000, me: 12000, partner: 0 },
      recurringTransactions: [
        recurring({
          id: "rent",
          amount: 25000,
          type: "expense",
          categoryId: "rent",
          note: "Аренда",
          nextRunDate: "2026-07-15",
          frequency: "monthly",
          dayOfMonth: 15,
        }),
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-20",
        expectedIncomeAmount: 15000,
        hasNoRequiredFixedExpenses: true,
      },
    }),
  );

  assert.deepEqual(snapshot.mainAction.command, {
    type: "open_forecast",
    focusDate: "2026-07-15",
    reason: "future_deficit",
    eventId: "recurring-rent-2026-07-15",
  });

  const groups = groupForecastEventsByDate(snapshot.forecast);
  const selectedGroup = groups.find((group) => group.date === "2026-07-15");
  assert.ok(selectedGroup);
  assert.equal(selectedGroup?.balanceAfter, -13000);
  assert.equal(
    resolveForecastFocus(snapshot.forecast, {
      date: "2026-07-15",
      source: "today_main_action",
      reason: "future_deficit",
      eventId: "recurring-rent-2026-07-15",
    }).selectedEventId,
    "recurring-rent-2026-07-15",
  );
});

test("stale eventId falls back to the date after store changes", () => {
  const forecast = forecastFromState(
    buildState({
      balances: { all: 12000, me: 12000, partner: 0 },
      recurringTransactions: [
        recurring({
          id: "rent",
          amount: 25000,
          type: "expense",
          categoryId: "rent",
          note: "Аренда",
          nextRunDate: "2026-07-15",
          frequency: "monthly",
          dayOfMonth: 15,
        }),
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-20",
        expectedIncomeAmount: 15000,
        hasNoRequiredFixedExpenses: true,
      },
    }),
  );

  const resolution = resolveForecastFocus(forecast, {
    date: "2026-07-15",
    source: "today_main_action",
    reason: "future_deficit",
    eventId: "deleted-event",
  });

  assert.equal(resolution.selectedDate, "2026-07-15");
  assert.equal(resolution.selectedEventId, null);
  assert.equal(resolution.exactMatch, true);
});

test("materialized recurring does not appear in the forecast twice and debt keeps its expected date", () => {
  const forecast = forecastFromState(
    buildState({
      balances: { all: 20000, me: 20000, partner: 0 },
      recurringTransactions: [
        recurring({
          id: "rent",
          amount: 10000,
          type: "expense",
          categoryId: "rent",
          note: "Аренда",
          nextRunDate: "2026-07-15",
          frequency: "monthly",
        }),
      ],
      transactions: [
        tx({
          id: "rent-paid",
          amount: 10000,
          type: "expense",
          categoryId: "rent",
          date: "2026-07-15",
          recurringId: "rent",
          confirmed: true,
          note: "Аренда",
        }),
      ],
      debts: [
        debt({
          id: "loan",
          name: "Кредит",
          balance: 50000,
          minPayment: 4000,
          nextPaymentDate: "2026-07-18",
        }),
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-25",
        expectedIncomeAmount: 30000,
        hasNoRequiredFixedExpenses: true,
      },
    }),
  );

  const groups = groupForecastEventsByDate(forecast);
  const rentGroup = groups.find((group) => group.date === "2026-07-15");
  const debtGroup = groups.find((group) => group.date === "2026-07-18");

  assert.equal(rentGroup, undefined);
  assert.equal(debtGroup?.events[0]?.source, "debt_payment");
});

test("focus stays tied to date even when earlier events are inserted into the forecast", () => {
  const original = forecastFromState(
    buildState({
      balances: { all: 10000, me: 10000, partner: 0 },
      recurringTransactions: [
        recurring({
          id: "rent",
          amount: 12000,
          type: "expense",
          categoryId: "rent",
          note: "Аренда",
          nextRunDate: "2026-07-15",
          frequency: "monthly",
        }),
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-25",
        expectedIncomeAmount: 30000,
        hasNoRequiredFixedExpenses: true,
      },
    }),
  );
  const updated = forecastFromState(
    buildState({
      balances: { all: 10000, me: 10000, partner: 0 },
      recurringTransactions: [
        recurring({
          id: "taxi",
          amount: 500,
          type: "expense",
          categoryId: "transport",
          note: "Такси",
          nextRunDate: "2026-07-12",
          frequency: "monthly",
        }),
        recurring({
          id: "rent",
          amount: 12000,
          type: "expense",
          categoryId: "rent",
          note: "Аренда",
          nextRunDate: "2026-07-15",
          frequency: "monthly",
        }),
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-25",
        expectedIncomeAmount: 30000,
        hasNoRequiredFixedExpenses: true,
      },
    }),
  );

  const focus = {
    date: "2026-07-15",
    source: "today_main_action" as const,
    reason: "future_deficit" as const,
  };

  assert.equal(resolveForecastFocus(original, focus).selectedDate, "2026-07-15");
  assert.equal(resolveForecastFocus(updated, focus).selectedDate, "2026-07-15");
});

import test from "node:test";
import assert from "node:assert/strict";
import { decisionCore } from "@/lib/decision-core";
import { buildAllowed } from "@/lib/decision-core/allowed";
import { buildAvoid } from "@/lib/decision-core/avoid";
import { buildForecastLine } from "@/lib/decision-core/forecast-line";
import { buildMainAction } from "@/lib/decision-core/main-action";
import { buildNextRisk } from "@/lib/decision-core/next-risk";
import { resolvePrimaryDecision } from "@/lib/decision-core/primary-decision";
import { calculateDecisionSafeSpending, buildSafeUntil } from "@/lib/decision-core/safe-until";
import { buildTodayPayments } from "@/lib/decision-core/today-payments";
import type { DecisionCoreContext, DecisionCoreState } from "@/lib/decision-core/types";
import { emptyMoneySetup } from "@/lib/money-setup";
import { confirmPendingPaymentById } from "@/lib/pending-payment";
import { countsInBalance } from "@/lib/transaction-confirmed";
import { getDefaultCategories } from "@/lib/categories";
import type { Transaction } from "@/types";
import type { CategoryBudget, DebtItem, RecurringTransaction } from "@/types/planning";

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
  categoryBudgets?: CategoryBudget[];
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
    categoryBudgets: input?.categoryBudgets ?? [],
    balances: input?.balances ?? { all: 0, me: 0, partner: 0 },
  };
}

function buildContext(state: DecisionCoreState): DecisionCoreContext {
  const transactions = state.transactions.filter((transaction) =>
    state.householdFilter === "all" ? true : transaction.owner === state.householdFilter,
  );
  const confirmedTransactions = transactions.filter(countsInBalance);
  const availableNow = state.moneySetup.useHouseholdBalance
    ? state.balances.all
    : state.balances.me;

  const ctx: DecisionCoreContext = {
    locale: state.locale,
    today: state.today,
    categories: state.categories,
    transactions,
    confirmedTransactions,
    recurringTransactions: state.recurringTransactions,
    debts: state.debts,
    moneySetup: state.moneySetup,
    categoryBudgets: state.categoryBudgets,
    availableNow,
    safeSpending: calculateDecisionSafeSpending(state),
    forecast: {
      startBalance: availableNow,
      minBalance: availableNow,
      minBalanceDate: null,
      firstDeficitDate: null,
      nextIncomeDate: null,
      horizonEndDate: state.today,
      events: [],
    },
  };

  ctx.forecast = buildForecastLine(ctx);
  return ctx;
}

function evaluate(state: DecisionCoreState) {
  const ctx = buildContext(state);
  const safeUntil = buildSafeUntil(ctx);
  const todayPayments = buildTodayPayments(ctx);
  const nextRisk = buildNextRisk(ctx);
  const primaryDecision = resolvePrimaryDecision({
    ctx,
    safeUntil,
    todayPayments,
    nextRisk,
  });
  const mainAction = buildMainAction(primaryDecision, ctx, nextRisk);
  const avoid = buildAvoid(primaryDecision, ctx, nextRisk);
  const allowed = buildAllowed(primaryDecision, ctx);
  const result = decisionCore(state);

  return {
    ctx,
    safeUntil,
    todayPayments,
    nextRisk,
    primaryDecision,
    mainAction,
    avoid,
    allowed,
    result,
  };
}

test("PrimaryDecision gives highest priority to overdue payment", () => {
  const scenario = evaluate(
    buildState({
      balances: { all: 8000, me: 8000, partner: 0 },
      transactions: [
        tx({
          id: "rent-overdue",
          amount: 2500,
          type: "expense",
          categoryId: "rent",
          date: "2026-07-08T23:50:00.000Z",
          note: "Аренда",
          confirmed: false,
        }),
        tx({
          id: "school-today",
          amount: 3000,
          type: "expense",
          categoryId: "kids_family",
          date: "2026-07-10T08:00:00.000Z",
          note: "Школа",
          confirmed: false,
        }),
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-20",
        expectedIncomeAmount: 40000,
      },
    }),
  );

  assert.equal(scenario.primaryDecision.type, "overdue_payment");
  assert.equal(scenario.result.mainAction.type, "pay_overdue");
  assert.deepEqual(scenario.result.mainAction.command, {
    type: "confirm_payment",
    paymentId: "rent-overdue",
  });
  assert.equal(scenario.result.status.key, "action");
});

test("Today's payment outranks a future risk", () => {
  const scenario = evaluate(
    buildState({
      balances: { all: 20000, me: 20000, partner: 0 },
      transactions: [
        tx({
          id: "internet-today",
          amount: 1200,
          type: "expense",
          categoryId: "services",
          date: "2026-07-10",
          note: "Интернет",
          confirmed: false,
        }),
      ],
      recurringTransactions: [
        recurring({
          id: "rent",
          amount: 19000,
          type: "expense",
          categoryId: "rent",
          note: "Аренда",
          nextRunDate: "2026-07-14",
          frequency: "monthly",
          dayOfMonth: 14,
        }),
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-20",
        expectedIncomeAmount: 30000,
      },
    }),
  );

  assert.equal(scenario.primaryDecision.type, "payment_today");
  assert.equal(scenario.result.mainAction.type, "pay_today");
  assert.deepEqual(scenario.result.mainAction.command, {
    type: "confirm_payment",
    paymentId: "internet-today",
  });
});

test("Current deficit outranks future deficit", () => {
  const scenario = evaluate(
    buildState({
      balances: { all: -1500, me: -1500, partner: 0 },
      recurringTransactions: [
        recurring({
          id: "rent",
          amount: 18000,
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
        expectedIncomeAmount: 40000,
      },
    }),
  );

  assert.equal(scenario.primaryDecision.type, "current_deficit");
  assert.equal(scenario.result.mainAction.type, "cover_deficit");
  assert.deepEqual(scenario.result.mainAction.command, {
    type: "open_forecast",
    focusDate: "2026-07-10",
    reason: "current_deficit",
    eventId: null,
  });
});

test("No risk returns no_urgent_action and all outputs come from the same PrimaryDecision", () => {
  const state = buildState({
    balances: { all: 50000, me: 50000, partner: 0 },
    recurringTransactions: [
      recurring({
        id: "rent",
        amount: 18000,
        type: "expense",
        categoryId: "rent",
        note: "Аренда",
        nextRunDate: "2026-07-12",
        frequency: "monthly",
      }),
    ],
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-07-20",
      expectedIncomeAmount: 50000,
      hasNoRequiredFixedExpenses: true,
    },
  });
  const scenario = evaluate(state);

  assert.equal(scenario.primaryDecision.type, "no_urgent_action");
  assert.equal(scenario.result.mainAction.type, scenario.mainAction.type);
  assert.deepEqual(scenario.result.mainAction.command, { type: "none" });
  assert.deepEqual(scenario.result.avoid, scenario.avoid);
  assert.deepEqual(scenario.result.allowed, scenario.allowed);
});

test("Allowed is restricted to zero for deficits and required payments", () => {
  const deficitScenario = evaluate(
    buildState({
      balances: { all: 10000, me: 10000, partner: 0 },
      recurringTransactions: [
        recurring({
          id: "rent",
          amount: 18000,
          type: "expense",
          categoryId: "rent",
          note: "Аренда",
          nextRunDate: "2026-07-12",
          frequency: "monthly",
        }),
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-20",
        expectedIncomeAmount: 50000,
        hasNoRequiredFixedExpenses: true,
      },
    }),
  );

  assert.equal(deficitScenario.result.allowed.status, "restricted");
  assert.equal(deficitScenario.result.allowed.amount, 0);
});

test("Allowed stays unknown without next income horizon", () => {
  const scenario = evaluate(
    buildState({
      balances: { all: 12000, me: 12000, partner: 0 },
      recurringTransactions: [
        recurring({
          id: "utilities",
          amount: 3000,
          type: "expense",
          categoryId: "services",
          note: "Коммуналка",
          nextRunDate: "2026-07-15",
          frequency: "monthly",
        }),
      ],
    }),
  );

  assert.equal(scenario.primaryDecision.type, "missing_data");
  assert.deepEqual(scenario.result.mainAction.command, {
    type: "open_money_setup",
    scope: "income",
  });
  assert.equal(scenario.result.allowed.status, "unknown");
  assert.equal(scenario.result.allowed.amount ?? null, null);
  assert.equal(scenario.result.safeUntil.isReady, false);
});

test("Allowed uses the next income as its horizon when confidence is available", () => {
  const scenario = evaluate(
    buildState({
      balances: { all: 40000, me: 40000, partner: 0 },
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
        nextIncomeDate: "2026-07-20",
        expectedIncomeAmount: 60000,
        hasNoRequiredFixedExpenses: true,
      },
    }),
  );

  assert.equal(scenario.result.allowed.status, "available");
  assert.equal(scenario.result.allowed.horizonDate, "2026-07-20");
  assert.ok((scenario.result.allowed.amount ?? 0) > 0);
});

test("Missing required expenses returns a targeted setup command", () => {
  const scenario = evaluate(
    buildState({
      balances: { all: 15000, me: 15000, partner: 0 },
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-20",
        expectedIncomeAmount: 50000,
      },
    }),
  );

  assert.equal(scenario.primaryDecision.type, "missing_data");
  assert.deepEqual(scenario.result.mainAction.command, {
    type: "open_money_setup",
    scope: "required_expenses",
  });
});

test("Future deficit opens forecast with the stable risk date", () => {
  const scenario = evaluate(
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

  assert.equal(scenario.primaryDecision.type, "future_deficit");
  assert.deepEqual(scenario.result.mainAction.command, {
    type: "open_forecast",
    focusDate: scenario.primaryDecision.riskDate,
    reason: "future_deficit",
    eventId: "recurring-rent-2026-07-15",
  });
});

test("Reserve-required uses forecast instead of a fake reserve confirmation", () => {
  const scenario = evaluate(
    buildState({
      balances: { all: 18000, me: 18000, partner: 0 },
      recurringTransactions: [
        recurring({
          id: "school",
          amount: 12000,
          type: "expense",
          categoryId: "kids_family",
          note: "Школа",
          nextRunDate: "2026-07-16",
          frequency: "monthly",
          dayOfMonth: 16,
        }),
        recurring({
          id: "utilities",
          amount: 2000,
          type: "expense",
          categoryId: "services",
          note: "Коммуналка",
          nextRunDate: "2026-07-14",
          frequency: "monthly",
          dayOfMonth: 14,
        }),
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-25",
        expectedIncomeAmount: 40000,
        hasNoRequiredFixedExpenses: true,
      },
      transactions: [
        tx({
          id: "groceries-yesterday",
          amount: 500,
          type: "expense",
          categoryId: "groceries",
          date: "2026-07-09",
          confirmed: true,
        }),
      ],
    }),
  );

  assert.equal(scenario.primaryDecision.type, "reserve_required");
  assert.deepEqual(scenario.result.mainAction.command, {
    type: "open_forecast",
    focusDate: scenario.primaryDecision.dueDate,
    reason: "reserve_required",
    eventId: "recurring-utilities-2026-07-14",
  });
});

test("Locale changes text but not the underlying command", () => {
  const ru = evaluate(
    buildState({
      balances: { all: 9000, me: 9000, partner: 0 },
      transactions: [
        tx({
          id: "internet-today",
          amount: 1200,
          type: "expense",
          categoryId: "services",
          date: "2026-07-10",
          note: "Интернет",
          confirmed: false,
        }),
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-20",
        expectedIncomeAmount: 30000,
      },
    }),
  ).result;

  const en = decisionCore({
    ...buildState({
      balances: { all: 9000, me: 9000, partner: 0 },
      transactions: [
        tx({
          id: "internet-today",
          amount: 1200,
          type: "expense",
          categoryId: "services",
          date: "2026-07-10",
          note: "Internet",
          confirmed: false,
        }),
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-20",
        expectedIncomeAmount: 30000,
      },
    }),
    locale: "en",
  });

  assert.notEqual(ru.mainAction.title, en.mainAction.title);
  assert.deepEqual(ru.mainAction.command, en.mainAction.command);
});

test("Recurring dedupe keeps two different payments on one date even with same amount", () => {
  const ctx = buildContext(
    buildState({
      balances: { all: 50000, me: 50000, partner: 0 },
      recurringTransactions: [
        recurring({
          id: "music",
          amount: 999,
          type: "expense",
          categoryId: "services",
          note: "Spotify",
          nextRunDate: "2026-07-12",
          frequency: "monthly",
        }),
        recurring({
          id: "video",
          amount: 999,
          type: "expense",
          categoryId: "services",
          note: "YouTube Premium",
          nextRunDate: "2026-07-12",
          frequency: "monthly",
        }),
      ],
    }),
  );

  const sameDayEvents = ctx.forecast.events.filter((event) => event.date === "2026-07-12");
  assert.equal(sameDayEvents.length, 2);
  assert.notEqual(sameDayEvents[0]?.id, sameDayEvents[1]?.id);
});

test("Recurring already materialized via recurringId is not counted twice, while a second recurring survives", () => {
  const ctx = buildContext(
    buildState({
      balances: { all: 20000, me: 20000, partner: 0 },
      transactions: [
        tx({
          id: "spotify-pending",
          amount: 999,
          type: "expense",
          categoryId: "services",
          date: "2026-07-12",
          note: "Spotify",
          confirmed: false,
          recurringId: "music",
        }),
      ],
      recurringTransactions: [
        recurring({
          id: "music",
          amount: 999,
          type: "expense",
          categoryId: "services",
          note: "Spotify",
          nextRunDate: "2026-07-12",
          frequency: "monthly",
        }),
        recurring({
          id: "video",
          amount: 999,
          type: "expense",
          categoryId: "services",
          note: "YouTube Premium",
          nextRunDate: "2026-07-12",
          frequency: "monthly",
        }),
      ],
    }),
  );

  const sameDayEvents = ctx.forecast.events.filter((event) => event.date === "2026-07-12");
  assert.equal(sameDayEvents.length, 2);
  assert.equal(sameDayEvents.filter((event) => event.id === "spotify-pending").length, 1);
  assert.equal(sameDayEvents.some((event) => event.id.includes("video")), true);
});

test("Confirmed recurring transaction does not reappear as a recurring occurrence", () => {
  const ctx = buildContext(
    buildState({
      balances: { all: 20000, me: 20000, partner: 0 },
      transactions: [
        tx({
          id: "rent-confirmed",
          amount: 5000,
          type: "expense",
          categoryId: "rent",
          date: "2026-07-12",
          note: "Аренда",
          confirmed: true,
          recurringId: "rent",
        }),
      ],
      recurringTransactions: [
        recurring({
          id: "rent",
          amount: 5000,
          type: "expense",
          categoryId: "rent",
          note: "Аренда",
          nextRunDate: "2026-07-12",
          frequency: "monthly",
        }),
      ],
    }),
  );

  assert.equal(
    ctx.forecast.events.filter((event) => event.date === "2026-07-12").length,
    0,
  );
});

test("Pending payment confirmation is idempotent", () => {
  const originalTransactions = [
    tx({
      id: "internet",
      amount: 1200,
      type: "expense",
      categoryId: "services",
      date: "2026-07-10",
      note: "Интернет",
      confirmed: false,
    }),
  ];

  const first = confirmPendingPaymentById(originalTransactions, "internet");
  const second = confirmPendingPaymentById(first.transactions, "internet");

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(
    first.transactions.filter((transaction) => transaction.id === "internet").length,
    1,
  );
  assert.equal(first.transactions[0]?.confirmed, true);
  assert.deepEqual(first.transactions, second.transactions);
});

test("After payment, todayPayments disappear and mainAction recalculates", () => {
  const base = buildState({
    balances: { all: 9000, me: 9000, partner: 0 },
    transactions: [
      tx({
        id: "internet",
        amount: 1200,
        type: "expense",
        categoryId: "services",
        date: "2026-07-10",
        note: "Интернет",
        confirmed: false,
      }),
    ],
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-07-25",
      expectedIncomeAmount: 40000,
    },
  });

  const first = confirmPendingPaymentById(base.transactions, "internet");
  const before = decisionCore(base);
  const after = decisionCore({
    ...base,
    transactions: first.transactions,
  });

  assert.equal(before.mainAction.type, "pay_today");
  assert.equal(after.todayPayments.length, 0);
  assert.notEqual(after.mainAction.type, "pay_today");
});

test("Negative balance with future income is explicit, and without income stays cautious", () => {
  const withIncome = decisionCore(
    buildState({
      balances: { all: -3000, me: -3000, partner: 0 },
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-20",
        expectedIncomeAmount: 30000,
      },
    }),
  );
  const withoutIncome = decisionCore(
    buildState({
      balances: { all: -3000, me: -3000, partner: 0 },
    }),
  );

  assert.equal(withIncome.status.key, "action");
  assert.equal(withIncome.mainAction.type, "cover_deficit");
  assert.equal(withoutIncome.allowed.status, "restricted");
  assert.equal(withoutIncome.safeUntil.isReady, true);
});

test("No regular expenses and no risks do not create a fake problem", () => {
  const result = decisionCore(
    buildState({
      balances: { all: 15000, me: 15000, partner: 0 },
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-25",
        expectedIncomeAmount: 20000,
        hasNoRequiredFixedExpenses: true,
      },
    }),
  );

  assert.equal(result.mainAction.type, "hold");
  assert.equal(result.status.key, "calm");
});

test("Future recurring income keeps the day calm even when discretionary limit stays cautious", () => {
  const result = decisionCore(
    buildState({
      balances: { all: 8000, me: 8000, partner: 0 },
      recurringTransactions: [
        recurring({
          id: "freelance-income",
          amount: 30000,
          type: "income",
          categoryId: "freelance",
          note: "Фриланс",
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
        hasNoRequiredFixedExpenses: true,
      },
    }),
  );

  assert.equal(result.status.key, "calm");
  assert.equal(result.allowed.status, "unknown");
});

test("Dates around midnight are normalized by local day slices", () => {
  const result = decisionCore(
    buildState({
      today: "2026-07-10",
      balances: { all: 10000, me: 10000, partner: 0 },
      transactions: [
        tx({
          id: "late-night",
          amount: 700,
          type: "expense",
          categoryId: "services",
          date: "2026-07-10T23:59:59.000Z",
          note: "Сервис",
          confirmed: false,
        }),
        tx({
          id: "previous-night",
          amount: 1500,
          type: "expense",
          categoryId: "rent",
          date: "2026-07-09T23:59:59.000Z",
          note: "Аренда",
          confirmed: false,
        }),
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-20",
        expectedIncomeAmount: 40000,
      },
    }),
  );

  assert.equal(result.todayPayments.some((payment) => payment.id === "late-night"), true);
  assert.equal(result.todayPayments.some((payment) => payment.id === "previous-night"), false);
  assert.equal(result.mainAction.type, "pay_overdue");
});

test("Debt due today becomes the next risk when no payment has higher priority", () => {
  const result = decisionCore(
    buildState({
      balances: { all: 10000, me: 10000, partner: 0 },
      debts: [
        debt({
          id: "card",
          name: "Кредитка",
          balance: 50000,
          minPayment: 7000,
          nextPaymentDate: "2026-07-10",
        }),
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-20",
        expectedIncomeAmount: 40000,
      },
    }),
  );

  assert.equal(result.nextRisk?.kind, "debt");
  assert.equal(result.nextRisk?.date, "2026-07-10");
});

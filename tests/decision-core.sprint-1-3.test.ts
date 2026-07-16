import test from "node:test";
import assert from "node:assert/strict";
import { decisionCore } from "@/lib/decision-core";
import { decisionCoreSnapshot } from "@/lib/decision-core";
import { buildAllowed } from "@/lib/decision-core/allowed";
import { buildAvoid } from "@/lib/decision-core/avoid";
import {
  findConstraintEvent,
  getConstraintPoint,
  getRequiredFloor,
} from "@/lib/decision-core/constraint-point";
import { buildEssentialBudgetReserve } from "@/lib/decision-core/essential-budget-reserve";
import {
  buildForecastLine,
  buildGeneratedExpectedPaymentEvents,
} from "@/lib/decision-core/forecast-line";
import { buildMainAction } from "@/lib/decision-core/main-action";
import { buildNextRisk } from "@/lib/decision-core/next-risk";
import { resolvePrimaryDecision } from "@/lib/decision-core/primary-decision";
import { calculateDecisionSafeSpending, buildSafeUntil } from "@/lib/decision-core/safe-until";
import { buildTodayPayments } from "@/lib/decision-core/today-payments";
import type { DecisionCoreContext, DecisionCoreState } from "@/lib/decision-core/types";
import { emptyMoneySetup, resolveMoneySetupIncomeSources } from "@/lib/money-setup";
import { rescheduleIncomeSourceInSetup } from "@/lib/expected-events";
import { confirmPendingPaymentById } from "@/lib/pending-payment";
import { buildStoredTransactionNote } from "@/lib/transaction-note";
import { countsInBalance } from "@/lib/transaction-confirmed";
import { getDefaultCategories } from "@/lib/categories";
import { calculatePlannedFreeMoneyUntilPeriodEnd } from "@/lib/free-money";
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
  forecastHorizonMonths?: 1 | 3 | 6;
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
    forecastHorizonMonths: input?.forecastHorizonMonths ?? 3,
    categories: getDefaultCategories(),
    transactions: input?.transactions ?? [],
    householdFilter: "all",
    recurringTransactions: input?.recurringTransactions ?? [],
    debts: input?.debts ?? [],
    moneySetup: input?.moneySetup ?? emptyMoneySetup(),
    categoryBudgets: input?.categoryBudgets ?? [],
    budgetMonthStartDay: 1,
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
    forecastHorizonMonths: state.forecastHorizonMonths,
    categories: state.categories,
    transactions,
    confirmedTransactions,
    recurringTransactions: state.recurringTransactions,
    debts: state.debts,
    moneySetup: state.moneySetup,
    categoryBudgets: state.categoryBudgets,
    budgetMonthStartDay: state.budgetMonthStartDay,
    expectedEventReminderStates:
      state.expectedEventReminderStates ?? state.moneySetup.expectedEventReminderStates,
    availableNow,
    resolvedIncomeSources: resolveMoneySetupIncomeSources({
      moneySetup: state.moneySetup,
      confirmedTransactions,
      today: state.today,
      locale: state.locale,
      forecastHorizonMonths: state.forecastHorizonMonths,
    }),
    safeSpending: calculateDecisionSafeSpending(state),
    essentialBudgetReserve: {
      totalRemaining: 0,
      periodFrom: state.today,
      periodTo: state.today,
      items: [],
    },
    forecast: {
      startBalance: availableNow,
      minBalance: availableNow,
      minBalanceDate: null,
      firstDeficitDate: null,
      nextIncomeDate: null,
      horizonEndDate: state.today,
      horizonMonths: state.forecastHorizonMonths,
      events: [],
    },
  };

  ctx.essentialBudgetReserve = buildEssentialBudgetReserve(ctx);
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

test("Allowed uses the forecast horizon end when there is no constraint point", () => {
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
  assert.equal(scenario.ctx.forecast.horizonEndDate, "2026-10-10");
  assert.equal(scenario.result.allowed.horizonDate, "2026-10-10");
  assert.equal(scenario.result.safeUntil.status, "no_risk_in_horizon");
  assert.match(scenario.result.safeUntil.title, /3 месяца/);
  assert.match(scenario.result.safeUntil.note ?? "", /10\.10\.2026/);
  assert.ok((scenario.result.allowed.amount ?? 0) > 0);
});

test("Allowed uses the forecast minimum after essential budgets are spread once", () => {
  const scenario = evaluate(
    buildState({
      today: "2026-07-12",
      balances: { all: 40000, me: 40000, partner: 0 },
      transactions: [
        tx({
          id: "groceries-spent",
          amount: 19200,
          type: "expense",
          categoryId: "groceries",
          date: "2026-07-05",
          confirmed: true,
        }),
      ],
      categoryBudgets: [
        {
          categoryId: "groceries",
          monthlyLimit: 30000,
        },
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-20",
        expectedIncomeAmount: 60000,
        hasNoRequiredFixedExpenses: true,
        essentialCategoryIds: ["groceries"],
      },
    }),
  );

  assert.equal(scenario.ctx.essentialBudgetReserve.totalRemaining, 10800);
  assert.equal(scenario.result.allowed.status, "available");
  assert.equal(getRequiredFloor(scenario.ctx), 0);
  assert.equal(scenario.result.allowed.amount, 35680);
  assert.equal(scenario.result.allowed.amount, scenario.ctx.forecast.minBalance);
});

test("Category budgets affect forecast even when no essential categories are marked", () => {
  const scenario = evaluate(
    buildState({
      today: "2026-07-12",
      balances: { all: 40000, me: 40000, partner: 0 },
      transactions: [
        tx({
          id: "groceries-spent",
          amount: 19200,
          type: "expense",
          categoryId: "groceries",
          date: "2026-07-05",
          confirmed: true,
        }),
      ],
      categoryBudgets: [
        {
          categoryId: "groceries",
          monthlyLimit: 30000,
        },
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-20",
        expectedIncomeAmount: 60000,
        hasNoRequiredFixedExpenses: true,
        essentialCategoryIds: [],
      },
    }),
  );

  assert.equal(scenario.ctx.essentialBudgetReserve.totalRemaining, 10800);
  assert.ok(
    scenario.ctx.forecast.events.some(
      (event) => event.source === "essential_budget" && event.date >= "2026-07-12",
    ),
  );
  assert.equal(scenario.result.allowed.amount, scenario.ctx.forecast.minBalance);
});

test("Spent above the essential limit does not create a negative reserve", () => {
  const scenario = evaluate(
    buildState({
      today: "2026-07-12",
      balances: { all: 20000, me: 20000, partner: 0 },
      transactions: [
        tx({
          id: "groceries-over",
          amount: 35000,
          type: "expense",
          categoryId: "groceries",
          date: "2026-07-05",
          confirmed: true,
        }),
      ],
      categoryBudgets: [
        {
          categoryId: "groceries",
          monthlyLimit: 30000,
        },
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-20",
        expectedIncomeAmount: 30000,
        hasNoRequiredFixedExpenses: true,
        essentialCategoryIds: ["groceries"],
      },
    }),
  );

  assert.equal(scenario.ctx.essentialBudgetReserve.totalRemaining, 0);
});

test("Large start balance alone does not create an arbitrary reserve", () => {
  const scenario = evaluate(
    buildState({
      balances: { all: 100000, me: 100000, partner: 0 },
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-20",
        expectedIncomeAmount: 50000,
        hasNoRequiredFixedExpenses: true,
      },
    }),
  );

  assert.equal(getRequiredFloor(scenario.ctx), 0);
  assert.equal(scenario.result.mainAction.type, "hold");
  assert.equal(scenario.result.nextRisk, null);
});

test("Allowed spending keeps the forecast above the required floor", () => {
  const scenario = evaluate(
    buildState({
      today: "2026-07-12",
      balances: { all: 40000, me: 40000, partner: 0 },
      transactions: [
        tx({
          id: "groceries-spent",
          amount: 19200,
          type: "expense",
          categoryId: "groceries",
          date: "2026-07-05",
          confirmed: true,
        }),
      ],
      recurringTransactions: [
        recurring({
          id: "utilities",
          amount: 8000,
          type: "expense",
          categoryId: "services",
          note: "ЖКХ",
          nextRunDate: "2026-07-15",
          frequency: "monthly",
        }),
      ],
      categoryBudgets: [
        {
          categoryId: "groceries",
          monthlyLimit: 30000,
        },
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-20",
        expectedIncomeAmount: 60000,
        hasNoRequiredFixedExpenses: true,
        essentialCategoryIds: ["groceries"],
      },
    }),
  );

  const floor = getRequiredFloor(scenario.ctx);
  const allowed = scenario.result.allowed.amount ?? 0;
  assert.equal(allowed, scenario.ctx.forecast.minBalance - floor);
  assert.equal(scenario.ctx.forecast.minBalance - allowed, floor);
});

test("Required recurring expense is not duplicated through an essential budget", () => {
  const scenario = evaluate(
    buildState({
      today: "2026-07-12",
      balances: { all: 50000, me: 50000, partner: 0 },
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
      categoryBudgets: [
        {
          categoryId: "rent",
          monthlyLimit: 20000,
        },
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-25",
        expectedIncomeAmount: 60000,
        requiredRecurringIds: ["rent"],
        essentialCategoryIds: ["rent"],
      },
    }),
  );

  assert.equal(scenario.ctx.essentialBudgetReserve.totalRemaining, 8000);
});

test("Distributed essential budgets affect minBalance directly instead of becoming a separate floor", () => {
  const scenario = evaluate(
    buildState({
      today: "2026-07-12",
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
      categoryBudgets: [
        {
          categoryId: "groceries",
          monthlyLimit: 10000,
        },
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-20",
        expectedIncomeAmount: 50000,
        hasNoRequiredFixedExpenses: true,
        essentialCategoryIds: ["groceries"],
      },
    }),
  );

  assert.equal(scenario.ctx.forecast.minBalance, 6000);
  assert.equal(getRequiredFloor(scenario.ctx), 0);
  assert.equal(scenario.result.allowed.amount, 6000);
});

test("Without a separate reserve floor, essential budgets no longer create a fake reserve decision", () => {
  const scenario = evaluate(
    buildState({
      today: "2026-07-12",
      balances: { all: 18000, me: 18000, partner: 0 },
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
      categoryBudgets: [
        {
          categoryId: "groceries",
          monthlyLimit: 10000,
        },
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-20",
        expectedIncomeAmount: 50000,
        hasNoRequiredFixedExpenses: true,
        essentialCategoryIds: ["groceries"],
      },
    }),
  );

  assert.equal(getRequiredFloor(scenario.ctx), 0);
  assert.notEqual(scenario.primaryDecision.type, "reserve_required");
  assert.ok((scenario.result.allowed.amount ?? 0) >= 0);
});

test("Recurring expenses no longer require a separate setup confirmation", () => {
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

  assert.notEqual(scenario.primaryDecision.type, "missing_data");
  assert.notDeepEqual(scenario.result.mainAction.command, {
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

test("Distributed essential budgets no longer create a fake reserve confirmation flow", () => {
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
        essentialCategoryIds: ["groceries"],
      },
      categoryBudgets: [
        {
          categoryId: "groceries",
          monthlyLimit: 5000,
        },
      ],
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

  assert.equal(scenario.primaryDecision.type, "no_urgent_action");
  assert.notEqual(scenario.result.mainAction.command.type, "open_forecast");
});

test("Distributed essential spending keeps the constraint point on the real later deficit", () => {
  const scenario = evaluate(
    buildState({
      today: "2026-07-12",
      forecastHorizonMonths: 1,
      balances: { all: 69691, me: 69691, partner: 0 },
      recurringTransactions: [
        recurring({
          id: "utilities",
          amount: 14000,
          type: "expense",
          categoryId: "services",
          note: "ЖКХ",
          nextRunDate: "2026-07-15",
          frequency: "monthly",
          dayOfMonth: 15,
        }),
        recurring({
          id: "late-risk",
          amount: 14900,
          type: "expense",
          categoryId: "shopping",
          note: "Крупный платёж",
          nextRunDate: "2026-07-25",
          frequency: "monthly",
          dayOfMonth: 25,
        }),
        recurring({
          id: "groceries-topup",
          amount: 791,
          type: "expense",
          categoryId: "groceries",
          note: "Продукты",
          nextRunDate: "2026-08-02",
          frequency: "monthly",
          dayOfMonth: 2,
        }),
        recurring({
          id: "final-risk",
          amount: 40000,
          type: "expense",
          categoryId: "rent",
          note: "Финальный платёж",
          nextRunDate: "2026-08-03",
          frequency: "monthly",
          dayOfMonth: 3,
        }),
      ],
      transactions: [
        tx({
          id: "groceries-spent",
          amount: 19200,
          type: "expense",
          categoryId: "groceries",
          date: "2026-07-04",
          confirmed: true,
        }),
      ],
      categoryBudgets: [
        {
          categoryId: "groceries",
          monthlyLimit: 30000,
        },
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-08-10",
        expectedIncomeAmount: 100000,
        hasNoRequiredFixedExpenses: true,
        essentialCategoryIds: ["groceries"],
      },
    }),
  );

  const july15 = scenario.ctx.forecast.events.find((event) => event.id === "recurring-utilities-2026-07-15");
  const constraint = findConstraintEvent(scenario.ctx);
  assert.equal(july15?.balanceAfter, 54071);
  assert.equal(scenario.ctx.essentialBudgetReserve.totalRemaining, 10800);
  assert.equal(getRequiredFloor(scenario.ctx), 0);
  assert.equal(constraint?.date, "2026-08-03");
  assert.equal(scenario.primaryDecision.type, "future_deficit");
  assert.equal(scenario.primaryDecision.riskDate, "2026-08-03");
  assert.match(scenario.result.safeUntil.title, /Дефицит через/);
  assert.equal(scenario.result.nextRisk?.date, "2026-08-03");
  assert.equal(scenario.result.allowed.horizonDate, "2026-08-03");
  assert.equal(scenario.result.constraintExplanation?.date, "2026-08-03");
  assert.equal(scenario.result.constraintExplanation?.kind, "deficit");
  assert.equal(scenario.result.mainAction.command.type, "open_forecast");
  if (scenario.result.mainAction.command.type === "open_forecast") {
    assert.equal(scenario.result.mainAction.command.focusDate, "2026-08-03");
    assert.equal(scenario.result.mainAction.command.eventId, "recurring-final-risk-2026-08-03");
  }
});

test("safeUntil and allowed still use the same later deficit point instead of the earlier next income", () => {
  const scenario = evaluate(
    buildState({
      today: "2026-07-12",
      forecastHorizonMonths: 1,
      balances: { all: 69691, me: 69691, partner: 0 },
      recurringTransactions: [
        recurring({
          id: "utilities",
          amount: 14000,
          type: "expense",
          categoryId: "services",
          note: "ЖКХ",
          nextRunDate: "2026-07-15",
          frequency: "monthly",
          dayOfMonth: 15,
        }),
        recurring({
          id: "late-risk",
          amount: 14900,
          type: "expense",
          categoryId: "shopping",
          note: "Крупный платёж",
          nextRunDate: "2026-07-25",
          frequency: "monthly",
          dayOfMonth: 25,
        }),
        recurring({
          id: "groceries-topup",
          amount: 791,
          type: "expense",
          categoryId: "groceries",
          note: "Продукты",
          nextRunDate: "2026-08-02",
          frequency: "monthly",
          dayOfMonth: 2,
        }),
        recurring({
          id: "final-risk",
          amount: 40000,
          type: "expense",
          categoryId: "rent",
          note: "Финальный платёж",
          nextRunDate: "2026-08-03",
          frequency: "monthly",
          dayOfMonth: 3,
        }),
      ],
      transactions: [
        tx({
          id: "groceries-spent",
          amount: 19200,
          type: "expense",
          categoryId: "groceries",
          date: "2026-07-04",
          confirmed: true,
        }),
      ],
      categoryBudgets: [
        {
          categoryId: "groceries",
          monthlyLimit: 30000,
        },
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-13",
        expectedIncomeAmount: 1000,
        hasNoRequiredFixedExpenses: true,
        essentialCategoryIds: ["groceries"],
      },
    }),
  );

  assert.equal(scenario.ctx.forecast.nextIncomeDate, "2026-07-13");
  assert.equal(findConstraintEvent(scenario.ctx)?.date, "2026-08-03");
  assert.match(scenario.result.safeUntil.title, /Дефицит через/);
  assert.equal(scenario.result.nextRisk?.date, "2026-08-03");
  assert.equal(scenario.result.allowed.horizonDate, "2026-08-03");
  assert.equal(scenario.result.mainAction.dueDate, "2026-08-03");
  assert.equal(scenario.result.constraintExplanation?.date, "2026-08-03");
  assert.notEqual(scenario.result.allowed.horizonDate, "2026-07-13");
});

test("deficit explanation uses negative balance language", () => {
  const scenario = evaluate(
    buildState({
      today: "2026-07-12",
      balances: { all: 25000, me: 25000, partner: 0 },
      recurringTransactions: [
        recurring({
          id: "mortgage",
          amount: 40000,
          type: "expense",
          categoryId: "rent",
          note: "Ипотека",
          nextRunDate: "2026-08-03",
          frequency: "monthly",
          dayOfMonth: 3,
        }),
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-08-10",
        expectedIncomeAmount: 1000,
        hasNoRequiredFixedExpenses: true,
      },
    }),
  );

  assert.equal(scenario.result.constraintExplanation?.kind, "deficit");
  assert.equal(scenario.result.constraintExplanation?.date, "2026-08-03");
  assert.match(scenario.result.constraintExplanation?.title ?? "", /денег уже не хватит/);
  assert.match(
    scenario.result.constraintExplanation?.summary ?? "",
    /баланс станет −15[\s\u00A0]000 ₽/,
  );
  assert.equal(scenario.result.constraintExplanation?.detail, null);
});

test("multiple events on one date are explained by the day total", () => {
  const scenario = evaluate(
    buildState({
      today: "2026-07-12",
      balances: { all: 48000, me: 48000, partner: 0 },
      recurringTransactions: [
        recurring({
          id: "school",
          amount: 20000,
          type: "expense",
          categoryId: "kids_family",
          note: "Школа",
          nextRunDate: "2026-08-03",
          frequency: "monthly",
          dayOfMonth: 3,
        }),
        recurring({
          id: "utilities",
          amount: 22791,
          type: "expense",
          categoryId: "services",
          note: "ЖКХ",
          nextRunDate: "2026-08-03",
          frequency: "monthly",
          dayOfMonth: 3,
        }),
        recurring({
          id: "salary",
          amount: 10000,
          type: "income",
          categoryId: "salary",
          note: "Подработка",
          nextRunDate: "2026-08-03",
          frequency: "monthly",
          dayOfMonth: 3,
        }),
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-08-20",
        expectedIncomeAmount: 1000,
        hasNoRequiredFixedExpenses: true,
      },
    }),
  );

  assert.equal(scenario.result.constraintExplanation?.eventCount, 3);
  assert.match(
    scenario.result.constraintExplanation?.summary ?? "",
    /придёт 10[\s\u00A0]000 ₽ и спишется 42[\s\u00A0]791 ₽/,
  );
  assert.equal(scenario.result.constraintExplanation?.balanceAfter, -16582);
});

test("no constraint point means there is no artificial explanation", () => {
  const scenario = evaluate(
    buildState({
      balances: { all: 50000, me: 50000, partner: 0 },
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-07-20",
        expectedIncomeAmount: 100000,
        hasNoRequiredFixedExpenses: true,
      },
    }),
  );

  assert.equal(scenario.result.constraintExplanation, null);
});

test("Nearest payment with healthy balance does not become the next risk", () => {
  const scenario = evaluate(
    buildState({
      today: "2026-07-12",
      forecastHorizonMonths: 1,
      balances: { all: 69691, me: 69691, partner: 0 },
      recurringTransactions: [
        recurring({
          id: "utilities",
          amount: 14000,
          type: "expense",
          categoryId: "services",
          note: "ЖКХ",
          nextRunDate: "2026-07-15",
          frequency: "monthly",
          dayOfMonth: 15,
        }),
        recurring({
          id: "later",
          amount: 55000,
          type: "expense",
          categoryId: "rent",
          note: "Большой платёж",
          nextRunDate: "2026-08-03",
          frequency: "monthly",
          dayOfMonth: 3,
        }),
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-08-10",
        expectedIncomeAmount: 100000,
        hasNoRequiredFixedExpenses: true,
      },
    }),
  );

  assert.equal(scenario.ctx.forecast.events.find((event) => event.id === "recurring-utilities-2026-07-15")?.balanceAfter, 55691);
  assert.equal(scenario.result.nextRisk, null);
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

  const sameDayEvents = ctx.forecast.events.filter(
    (event) => event.date === "2026-07-12",
  );
  assert.equal(sameDayEvents.filter((event) => event.source === "recurring").length, 0);
  assert.equal(
    sameDayEvents.filter((event) => event.source === "confirmed_transaction").length,
    1,
  );
});

test("Recurring occurrence is not collapsed by a similar transaction without recurringId", () => {
  const ctx = buildContext(
    buildState({
      today: "2026-07-13",
      balances: { all: 50000, me: 50000, partner: 0 },
      transactions: [
        tx({
          id: "manual-zoom-like",
          amount: 1500,
          type: "expense",
          categoryId: "services",
          date: "2026-09-11T10:00:00.000Z",
          note: "Zoom",
          confirmed: true,
          recurringId: null,
        }),
      ],
      recurringTransactions: [
        recurring({
          id: "zoom",
          amount: 1500,
          type: "expense",
          categoryId: "services",
          note: "Zoom",
          nextRunDate: "2026-09-11",
          frequency: "monthly",
          dayOfMonth: 11,
        }),
      ],
    }),
  );

  const zoomEvents = ctx.forecast.events.filter((event) => event.date === "2026-09-11");
  assert.equal(zoomEvents.some((event) => event.id === "manual-zoom-like"), true);
  assert.equal(zoomEvents.some((event) => event.id === "recurring-zoom-2026-09-11"), true);
});

test("Essential budgets are spread across the visible budget periods instead of one lump sum", () => {
  const ctx = buildContext(
    buildState({
      today: "2026-07-13",
      forecastHorizonMonths: 3,
      balances: { all: 200000, me: 200000, partner: 0 },
      transactions: [
        tx({
          id: "july-groceries",
          amount: 19000,
          type: "expense",
          categoryId: "groceries",
          date: "2026-07-05",
          confirmed: true,
        }),
        tx({
          id: "july-fuel",
          amount: 2000,
          type: "expense",
          categoryId: "transport",
          date: "2026-07-06",
          confirmed: true,
        }),
      ],
      categoryBudgets: [
        { categoryId: "groceries", monthlyLimit: 30000 },
        { categoryId: "transport", monthlyLimit: 10000 },
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        hasNoRequiredFixedExpenses: true,
        essentialCategoryIds: ["groceries", "transport"],
      },
    }),
  );

  assert.equal(ctx.essentialBudgetReserve.totalRemaining, 19000);

  const budgetEvents = ctx.forecast.events.filter(
    (event) => event.source === "essential_budget",
  );
  assert.equal(budgetEvents.some((event) => event.amount === -40000), false);

  const totalForRange = (from: string, to: string) =>
    budgetEvents
      .filter((event) => event.date >= from && event.date <= to)
      .reduce((sum, event) => sum + Math.abs(event.amount), 0);

  assert.equal(totalForRange("2026-07-13", "2026-07-31"), 19000);
  assert.equal(totalForRange("2026-08-01", "2026-08-31"), 40000);
  assert.equal(totalForRange("2026-09-01", "2026-09-30"), 40000);
  assert.equal(totalForRange("2026-10-01", "2026-10-13"), 16757);
  assert.equal(budgetEvents[0]?.title, "Плановые повседневные траты");
});

test("Future essential budgets stay reduced by spending and required recurring obligations after spreading", () => {
  const ctx = buildContext(
    buildState({
      today: "2026-07-13",
      forecastHorizonMonths: 3,
      balances: { all: 200000, me: 200000, partner: 0 },
      transactions: [
        tx({
          id: "august-groceries",
          amount: 5000,
          type: "expense",
          categoryId: "groceries",
          date: "2026-08-05",
          confirmed: true,
        }),
      ],
      recurringTransactions: [
        recurring({
          id: "rent",
          amount: 12000,
          type: "expense",
          categoryId: "rent",
          note: "Аренда",
          nextRunDate: "2026-08-15",
          frequency: "monthly",
          dayOfMonth: 15,
        }),
      ],
      categoryBudgets: [
        { categoryId: "groceries", monthlyLimit: 30000 },
        { categoryId: "rent", monthlyLimit: 20000 },
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        requiredRecurringIds: ["rent"],
        essentialCategoryIds: ["groceries", "rent"],
      },
    }),
  );

  const augustBudgetTotal = ctx.forecast.events
    .filter((event) => event.source === "essential_budget")
    .filter((event) => event.date >= "2026-08-01" && event.date <= "2026-08-31")
    .reduce((sum, event) => sum + Math.abs(event.amount), 0);
  assert.equal(augustBudgetTotal, 33000);
  assert.equal(
    ctx.forecast.events.some((event) => event.id === "recurring-rent-2026-08-15"),
    true,
  );
  assert.equal(
    ctx.forecast.events.some((event) => event.id === "august-groceries"),
    true,
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

test("Future recurring income can define a calm forecast horizon on its own", () => {
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
  assert.equal(result.safeUntil.status, "no_risk_in_horizon");
});

test("Dates around midnight keep the local slice and allow overdue payments to stay visible", () => {
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
  assert.equal(result.todayPayments.some((payment) => payment.id === "previous-night"), true);
  assert.equal(result.mainAction.type, "pay_overdue");
});

test("Debt that does not constrain the balance is not treated as the next risk", () => {
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

  assert.equal(result.nextRisk, null);
});

test("Overdue debt payments reduce free money and become the top Today action", () => {
  const state = buildState({
    today: "2026-07-16",
    balances: { all: 50000, me: 50000, partner: 0 },
    debts: [
      debt({
        id: "debt-a",
        name: "Долг A",
        balance: 21000,
        minPayment: 5000,
        nextPaymentDate: "2026-07-15",
        strategy: "snowball",
      }),
      debt({
        id: "debt-b",
        name: "Долг B",
        balance: 86000,
        minPayment: 18000,
        nextPaymentDate: "2026-07-15",
        strategy: "snowball",
      }),
    ],
    moneySetup: {
      ...emptyMoneySetup(),
      hasNoRequiredFixedExpenses: true,
    },
  });
  const result = decisionCore(state);
  const snapshot = decisionCoreSnapshot(state);
  const plannedFreeMoney = calculatePlannedFreeMoneyUntilPeriodEnd(state, snapshot);

  assert.equal(plannedFreeMoney.amount, 27000);
  assert.equal(result.mainAction.type, "pay_overdue");
  assert.deepEqual(result.mainAction.command, {
    type: "confirm_payment",
    paymentId: "debt:debt-a:2026-07-15",
  });
  assert.equal(result.todayPayments.length, 2);
  assert.equal(result.todayPayments[0]?.source, "debt_payment");
  assert.equal(result.todayPayments[0]?.amount, 5000);
  assert.equal(result.todayPayments[1]?.amount, 18000);
  assert.equal(
    snapshot.forecast.events.filter((event) => event.source === "debt_payment").length,
    2,
  );
  assert.equal(
    snapshot.forecast.events.some(
      (event) =>
        event.source === "debt_payment" &&
        event.date === "2026-07-16" &&
        event.plannedDate === "2026-07-15",
    ),
    true,
  );
});

test("expected payment generation does not create a recurring duplicate when debt already covers the same due amount", () => {
  const ctx = buildContext(
    buildState({
      today: "2026-07-16",
      balances: { all: 68115, me: 68115, partner: 0 },
      recurringTransactions: [
        recurring({
          id: "housing-recurring",
          amount: 19000,
          type: "expense",
          categoryId: "home_housing",
          note: "",
          nextRunDate: "2026-07-16",
          frequency: "monthly",
          dayOfMonth: 16,
        }),
      ],
      debts: [
        debt({
          id: "housing-debt",
          name: "Ипотека",
          balance: 95000,
          minPayment: 19000,
          nextPaymentDate: "2026-07-16",
        }),
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        hasNoRequiredFixedExpenses: true,
      },
    }),
  );

  const events = buildGeneratedExpectedPaymentEvents(ctx, ctx.forecast.horizonEndDate);
  const sameDateEvents = events.filter(
    (event) => event.date === "2026-07-16" && event.amount === -19000,
  );

  assert.equal(sameDateEvents.length, 1);
  assert.equal(sameDateEvents[0]?.source, "debt_payment");
  assert.equal(sameDateEvents[0]?.amount, -19000);
  assert.equal(sameDateEvents[0]?.date, "2026-07-16");
  assert.equal(sameDateEvents[0]?.debtId, "housing-debt");
});

test("future expected income stays in forecast before its planned date", () => {
  const scenario = evaluate(
    buildState({
      today: "2026-07-08",
      balances: { all: 10000, me: 10000, partner: 0 },
      moneySetup: {
        ...emptyMoneySetup(),
        incomeSources: [
          {
            id: "salary-july",
            label: "Зарплата",
            expectedDate: "2026-07-10",
            expectedAmount: 120000,
            kind: "salary",
            recurrence: "once",
            isPrimary: true,
          },
        ],
      },
    }),
  );

  const incomeEvents = scenario.ctx.forecast.events.filter(
    (event) => event.source === "income_source",
  );

  assert.equal(incomeEvents.length, 1);
  assert.equal(incomeEvents[0]?.date, "2026-07-10");
  assert.equal(incomeEvents[0]?.amount, 120000);
  assert.equal(scenario.result.safeUntil.nextIncomeDate, "2026-07-10");
});

test("planned income due today stays in forecast as planned and asks for confirmation", () => {
  const scenario = evaluate(
    buildState({
      today: "2026-07-10",
      balances: { all: 10000, me: 10000, partner: 0 },
      moneySetup: {
        ...emptyMoneySetup(),
        incomeSources: [
          {
            id: "salary-july",
            label: "Зарплата",
            expectedDate: "2026-07-10",
            expectedAmount: 120000,
            kind: "salary",
            recurrence: "once",
            isPrimary: true,
          },
        ],
      },
    }),
  );

  const incomeEvent = scenario.ctx.forecast.events.find(
    (event) => event.source === "income_source",
  );
  assert.equal(Boolean(incomeEvent), true);
  assert.equal(incomeEvent?.plannedIncomeStatus, "due_today");
  assert.equal(incomeEvent?.incomeSourceId, "salary-july");
  assert.equal(scenario.result.mainAction.type, "confirm_income");
  assert.equal(scenario.result.mainAction.command.type, "confirm_income_source");
  assert.equal(scenario.result.safeUntil.confidence, "planned");
});

test("overdue unconfirmed income stays visible in forecast and marks confidence as uncertain", () => {
  const scenario = evaluate(
    buildState({
      today: "2026-07-12",
      balances: { all: 10000, me: 10000, partner: 0 },
      moneySetup: {
        ...emptyMoneySetup(),
        incomeSources: [
          {
            id: "salary-july",
            label: "Зарплата",
            expectedDate: "2026-07-10",
            expectedAmount: 120000,
            kind: "salary",
            recurrence: "once",
            isPrimary: true,
          },
        ],
      },
    }),
  );

  const incomeEvent = scenario.ctx.forecast.events.find(
    (event) => event.source === "income_source",
  );
  assert.equal(Boolean(incomeEvent), true);
  assert.equal(incomeEvent?.plannedIncomeStatus, "overdue_unconfirmed");
  assert.equal(incomeEvent?.date, "2026-07-12");
  assert.equal(scenario.result.mainAction.type, "resolve_income_delay");
  assert.equal(scenario.result.safeUntil.confidence, "uncertain");
  assert.match(scenario.result.safeUntil.confidenceNote ?? "", /неподтвержд/i);
  assert.equal(scenario.result.status.key, "action");
});

test("confirmed income transaction prevents double counting of the expected source", () => {
  const scenario = evaluate(
    buildState({
      today: "2026-07-09",
      balances: { all: 130000, me: 130000, partner: 0 },
      transactions: [
        tx({
          id: "salary-recorded",
          amount: 120000,
          type: "income",
          categoryId: "salary",
          date: "2026-07-09",
          note: "Зарплата",
          confirmed: true,
        }),
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        incomeSources: [
          {
            id: "salary-july",
            label: "Зарплата",
            expectedDate: "2026-07-10",
            expectedAmount: 120000,
            kind: "salary",
            recurrence: "once",
            isPrimary: true,
          },
        ],
      },
    }),
  );

  assert.equal(
    scenario.ctx.forecast.events.some((event) => event.source === "income_source"),
    false,
  );
  assert.equal(scenario.result.safeUntil.rawStatus, "missing_income");
});

function buildSameDayCashGapScenario(expenseOrder: string[] = ["rent", "school", "internet"]) {
  const expenseMap = {
    rent: tx({
      id: "rent-july-25",
      amount: 53000,
      type: "expense",
      categoryId: "rent",
      date: "2026-07-25",
      note: "Аренда",
      confirmed: false,
    }),
    school: tx({
      id: "school-july-25",
      amount: 9300,
      type: "expense",
      categoryId: "kids_family",
      date: "2026-07-25",
      note: "Учёба Ксю",
      confirmed: false,
    }),
    internet: tx({
      id: "internet-july-25",
      amount: 500,
      type: "expense",
      categoryId: "services",
      date: "2026-07-25",
      note: "Интернет",
      confirmed: false,
    }),
  } as const;

  return evaluate(
    buildState({
      today: "2026-07-20",
      balances: { all: 60894, me: 60894, partner: 0 },
      transactions: expenseOrder.map((key) => expenseMap[key as keyof typeof expenseMap]),
      recurringTransactions: [
        recurring({
          id: "tax-july-28",
          amount: 30000,
          type: "expense",
          categoryId: "tax",
          note: "Налог",
          nextRunDate: "2026-07-28",
          frequency: "monthly",
          dayOfMonth: 28,
        }),
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        incomeSources: [
          {
            id: "income-july-25",
            label: "Доход",
            expectedDate: "2026-07-25",
            expectedAmount: 25000,
            kind: "salary",
            isPrimary: true,
          },
        ],
        hasNoRequiredFixedExpenses: true,
      },
    }),
  );
}

test("same-day income and expenses aggregate into one end-of-day balance", () => {
  const scenario = buildSameDayCashGapScenario();
  const july25 = scenario.ctx.forecast.days?.find((day) => day.date === "2026-07-25");

  assert.ok(july25);
  assert.equal(july25?.startBalance, 60894);
  assert.equal(july25?.incomeTotal, 25000);
  assert.equal(july25?.expenseTotal, 62800);
  assert.equal(july25?.netChange, -37800);
  assert.equal(july25?.endBalance, 23094);
});

test("positive end-of-day balance does not create a false deficit on the same date", () => {
  const scenario = buildSameDayCashGapScenario();

  assert.equal(scenario.ctx.forecast.firstDeficitDate, "2026-07-28");
  assert.equal(
    scenario.ctx.forecast.days?.find((day) => day.date === "2026-07-25")?.endBalance,
    23094,
  );
  assert.equal(
    scenario.ctx.forecast.events.some(
      (event) => event.date === "2026-07-25" && event.balanceAfter < 0,
    ),
    true,
  );
});

test("constraint point uses the next truly limiting day instead of a same-day intermediate dip", () => {
  const scenario = buildSameDayCashGapScenario();
  const point = getConstraintPoint(scenario.ctx);

  assert.equal(point?.date, "2026-07-28");
  assert.equal(point?.kind, "deficit");
  assert.equal(point?.balanceAfter, -6906);
  assert.notEqual(point?.eventId, "school-july-25");
  assert.equal(scenario.result.nextRisk?.date, "2026-07-28");
  assert.equal(scenario.result.allowed.horizonDate, "2026-07-28");
  assert.match(scenario.result.safeUntil.note ?? "", /28\.07\.2026/);
});

test("same-day constraint semantics do not depend on event order", () => {
  const original = buildSameDayCashGapScenario(["rent", "school", "internet"]);
  const reordered = buildSameDayCashGapScenario(["internet", "school", "rent"]);

  assert.equal(
    original.ctx.forecast.days?.find((day) => day.date === "2026-07-25")?.endBalance,
    23094,
  );
  assert.equal(
    reordered.ctx.forecast.days?.find((day) => day.date === "2026-07-25")?.endBalance,
    23094,
  );
  assert.equal(original.ctx.forecast.firstDeficitDate, reordered.ctx.forecast.firstDeficitDate);
  assert.equal(original.result.nextRisk?.date, reordered.result.nextRisk?.date);
  assert.equal(original.result.allowed.horizonDate, reordered.result.allowed.horizonDate);
});

test("constraint explanation describes the end-of-day total instead of a fake same-day deficit", () => {
  const scenario = buildSameDayCashGapScenario();

  assert.equal(scenario.result.constraintExplanation?.date, "2026-07-28");
  assert.equal(
    scenario.result.constraintExplanation?.summary?.includes("25 июля денег уже не хватит"),
    false,
  );
  const july25 = scenario.ctx.forecast.days?.find((day) => day.date === "2026-07-25");
  assert.equal(july25?.endBalance, 23094);
});

test("a truly negative end-of-day balance still creates a same-day deficit", () => {
  const scenario = evaluate(
    buildState({
      today: "2026-07-20",
      balances: { all: 60894, me: 60894, partner: 0 },
      transactions: [
        tx({
          id: "rent-july-25",
          amount: 53000,
          type: "expense",
          categoryId: "rent",
          date: "2026-07-25",
          note: "Аренда",
          confirmed: false,
        }),
        tx({
          id: "school-july-25",
          amount: 9300,
          type: "expense",
          categoryId: "kids_family",
          date: "2026-07-25",
          note: "Учёба Ксю",
          confirmed: false,
        }),
        tx({
          id: "internet-july-25",
          amount: 500,
          type: "expense",
          categoryId: "services",
          date: "2026-07-25",
          note: "Интернет",
          confirmed: false,
        }),
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        incomeSources: [
          {
            id: "income-july-25",
            label: "Доход",
            expectedDate: "2026-07-25",
            expectedAmount: 1000,
            kind: "salary",
            isPrimary: true,
          },
        ],
        hasNoRequiredFixedExpenses: true,
      },
    }),
  );

  assert.equal(
    scenario.ctx.forecast.days?.find((day) => day.date === "2026-07-25")?.endBalance,
    -906,
  );
  assert.equal(scenario.ctx.forecast.firstDeficitDate, "2026-07-25");
  assert.equal(scenario.result.nextRisk?.date, "2026-07-25");
});

test("forecast horizon can be configured to 1, 3, or 6 months", () => {
  const oneMonth = evaluate(
    buildState({
      today: "2026-07-13",
      forecastHorizonMonths: 1,
      balances: { all: 83651, me: 83651, partner: 0 },
      moneySetup: {
        ...emptyMoneySetup(),
        incomeSources: [
          {
            id: "income-14-july",
            label: "Пассив",
            expectedDate: "2026-07-14",
            expectedAmount: 24000,
            kind: "passive",
            isPrimary: true,
          },
        ],
        hasNoRequiredFixedExpenses: true,
      },
    }),
  );
  const threeMonths = evaluate(
    buildState({
      today: "2026-07-13",
      forecastHorizonMonths: 3,
      balances: { all: 83651, me: 83651, partner: 0 },
      moneySetup: {
        ...emptyMoneySetup(),
        incomeSources: [
          {
            id: "income-14-july",
            label: "Пассив",
            expectedDate: "2026-07-14",
            expectedAmount: 24000,
            kind: "passive",
            isPrimary: true,
          },
        ],
        hasNoRequiredFixedExpenses: true,
      },
    }),
  );
  const sixMonths = evaluate(
    buildState({
      today: "2026-07-13",
      forecastHorizonMonths: 6,
      balances: { all: 83651, me: 83651, partner: 0 },
      moneySetup: {
        ...emptyMoneySetup(),
        incomeSources: [
          {
            id: "income-14-july",
            label: "Пассив",
            expectedDate: "2026-07-14",
            expectedAmount: 24000,
            kind: "passive",
            isPrimary: true,
          },
        ],
        hasNoRequiredFixedExpenses: true,
      },
    }),
  );

  assert.equal(oneMonth.ctx.forecast.horizonEndDate, "2026-08-13");
  assert.equal(threeMonths.ctx.forecast.horizonEndDate, "2026-10-13");
  assert.equal(sixMonths.ctx.forecast.horizonEndDate, "2027-01-13");
});

test("next income does not become safe-until when there is no risk in the selected horizon", () => {
  const scenario = evaluate(
    buildState({
      today: "2026-07-13",
      forecastHorizonMonths: 3,
      balances: { all: 83651, me: 83651, partner: 0 },
      moneySetup: {
        ...emptyMoneySetup(),
        incomeSources: [
          {
            id: "income-14-july",
            label: "Пассив",
            expectedDate: "2026-07-14",
            expectedAmount: 24000,
            kind: "passive",
            isPrimary: true,
          },
        ],
        hasNoRequiredFixedExpenses: true,
      },
    }),
  );

  assert.equal(scenario.result.nextRisk, null);
  assert.equal(scenario.result.safeUntil.status, "no_risk_in_horizon");
  assert.equal(scenario.result.safeUntil.horizonEndDate, "2026-10-13");
  assert.equal(scenario.result.safeUntil.nextIncomeDate, "2026-07-14");
  assert.match(scenario.result.safeUntil.title, /3 месяца/);
  assert.match(scenario.result.safeUntil.note ?? "", /13\.10\.2026/);
  assert.doesNotMatch(scenario.result.safeUntil.title, /14 июля/);
  assert.equal(scenario.result.allowed.horizonDate, "2026-10-13");
});

test("a risk outside the 1 month horizon appears when the horizon is expanded to 3 months", () => {
  const oneMonth = evaluate(
    buildState({
      today: "2026-07-13",
      forecastHorizonMonths: 1,
      balances: { all: 50000, me: 50000, partner: 0 },
      recurringTransactions: [
        recurring({
          id: "autumn-risk",
          amount: 70000,
          type: "expense",
          categoryId: "rent",
          note: "Крупный платёж",
          nextRunDate: "2026-09-01",
          frequency: "monthly",
        }),
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-08-20",
        expectedIncomeAmount: 100000,
        hasNoRequiredFixedExpenses: true,
      },
    }),
  );
  const threeMonths = evaluate(
    buildState({
      today: "2026-07-13",
      forecastHorizonMonths: 3,
      balances: { all: 50000, me: 50000, partner: 0 },
      recurringTransactions: [
        recurring({
          id: "autumn-risk",
          amount: 70000,
          type: "expense",
          categoryId: "rent",
          note: "Крупный платёж",
          nextRunDate: "2026-09-01",
          frequency: "monthly",
        }),
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        nextIncomeDate: "2026-10-20",
        expectedIncomeAmount: 100000,
        hasNoRequiredFixedExpenses: true,
      },
    }),
  );

  assert.equal(oneMonth.ctx.forecast.horizonEndDate, "2026-08-13");
  assert.equal(oneMonth.result.nextRisk, null);
  assert.equal(oneMonth.result.safeUntil.status, "no_risk_in_horizon");
  assert.equal(threeMonths.ctx.forecast.horizonEndDate, "2026-10-13");
  assert.equal(threeMonths.result.nextRisk?.date, "2026-09-01");
  assert.equal(threeMonths.result.safeUntil.status, "constraint_found");
});

test("one-time planned income appears only once within the horizon", () => {
  const scenario = evaluate(
    buildState({
      today: "2026-07-13",
      forecastHorizonMonths: 3,
      balances: { all: 50000, me: 50000, partner: 0 },
      moneySetup: {
        ...emptyMoneySetup(),
        incomeSources: [
          {
            id: "one-time-income",
            label: "Разовый бонус",
            expectedDate: "2026-07-14",
            expectedAmount: 24000,
            kind: "other",
            recurrence: "once",
            isPrimary: true,
          },
        ],
      },
    }),
  );

  const incomeEvents = scenario.ctx.forecast.events.filter(
    (event) => event.source === "income_source",
  );

  assert.deepEqual(
    incomeEvents.map((event) => event.date),
    ["2026-07-14"],
  );
});

test("monthly planned income expands across the whole forecast horizon", () => {
  const scenario = evaluate(
    buildState({
      today: "2026-07-13",
      forecastHorizonMonths: 3,
      balances: { all: 80172, me: 80172, partner: 0 },
      moneySetup: {
        ...emptyMoneySetup(),
        incomeSources: [
          {
            id: "salary-14th",
            label: "Доход 14 числа",
            expectedDate: "2026-07-14",
            expectedAmount: 24000,
            kind: "salary",
            recurrence: "monthly",
            intervalMonths: 1,
            dayOfMonth: 14,
            isPrimary: true,
          },
        ],
      },
    }),
  );

  const incomeEvents = scenario.ctx.forecast.events.filter(
    (event) => event.source === "income_source",
  );

  assert.deepEqual(
    incomeEvents.map((event) => event.date),
    ["2026-07-14", "2026-08-14", "2026-09-14"],
  );
  assert.equal(
    incomeEvents.every((event) => event.incomeOccurrenceId?.startsWith("income-salary-14th-")),
    true,
  );
  assert.equal(incomeEvents.some((event) => event.date === "2026-10-14"), false);
});

test("confirmed July income replaces only the July occurrence while August and September remain planned", () => {
  const scenario = evaluate(
    buildState({
      today: "2026-07-15",
      forecastHorizonMonths: 3,
      balances: { all: 102672, me: 102672, partner: 0 },
      transactions: [
        tx({
          id: "salary-july-fact",
          amount: 22500,
          type: "income",
          categoryId: "salary",
          date: "2026-07-14",
          note: buildStoredTransactionNote(
            "Зарплата пришла",
            22500,
            "salary-14th",
            "2026-07-14",
          ),
        }),
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        incomeSources: [
          {
            id: "salary-14th",
            label: "Зарплата",
            expectedDate: "2026-07-14",
            expectedAmount: 24000,
            kind: "salary",
            recurrence: "monthly",
            intervalMonths: 1,
            dayOfMonth: 14,
            isPrimary: true,
          },
        ],
      },
    }),
  );

  const plannedIncomeEvents = scenario.ctx.forecast.events.filter(
    (event) => event.source === "income_source",
  );
  assert.deepEqual(
    plannedIncomeEvents.map((event) => [event.date, event.amount]),
    [
      ["2026-08-14", 24000],
      ["2026-09-14", 24000],
      ["2026-10-14", 24000],
    ].filter(([date]) => date <= scenario.ctx.forecast.horizonEndDate),
  );
  assert.equal(
    plannedIncomeEvents.some((event) => event.incomeOccurrenceDate === "2026-07-14"),
    false,
  );
});

test("overdue unconfirmed income does not stop the monthly series", () => {
  const sources = resolveMoneySetupIncomeSources({
    moneySetup: {
      ...emptyMoneySetup(),
      incomeSources: [
        {
          id: "salary-14th",
          label: "Зарплата",
          expectedDate: "2026-07-14",
          expectedAmount: 24000,
          kind: "salary",
          recurrence: "monthly",
          intervalMonths: 1,
          dayOfMonth: 14,
          isPrimary: true,
        },
      ],
    },
    confirmedTransactions: [],
    today: "2026-07-20",
    forecastHorizonMonths: 3,
    locale: "ru",
  });

  assert.deepEqual(
    sources.map((source) => [source.occurrenceDate, source.status]),
    [
      ["2026-07-14", "overdue_unconfirmed"],
      ["2026-08-14", "scheduled"],
      ["2026-09-14", "scheduled"],
      ["2026-10-14", "scheduled"],
    ],
  );
});

test("rescheduling an overdue income removes the old hero event and moves forecast to the new date", () => {
  const initialSetup = {
    ...emptyMoneySetup(),
    incomeSources: [
      {
        id: "salary-july",
        label: "Зарплата",
        expectedDate: "2026-07-06",
        expectedAmount: 50000,
        kind: "salary" as const,
        recurrence: "monthly" as const,
        intervalMonths: 1,
        dayOfMonth: 6,
        isPrimary: true,
      },
    ],
  };

  const rescheduledSetup = rescheduleIncomeSourceInSetup(
    initialSetup,
    "salary-july",
    "2026-07-16",
    "ru",
  );

  const scenario = evaluate(
    buildState({
      today: "2026-07-10",
      balances: { all: 10000, me: 10000, partner: 0 },
      moneySetup: rescheduledSetup,
    }),
  );

  const incomeEvents = scenario.ctx.forecast.events.filter(
    (event) => event.source === "income_source",
  );

  assert.notEqual(scenario.result.mainAction.type, "resolve_income_delay");
  assert.equal(
    incomeEvents.some((event) => event.incomeOccurrenceDate === "2026-07-06"),
    false,
  );
  assert.equal(
    incomeEvents.some(
      (event) =>
        event.incomeOccurrenceDate === "2026-07-16" &&
        event.date === "2026-07-16",
    ),
    true,
  );
});

test("rescheduling an overdue payment removes the old overdue hero state and moves forecast to the new date", () => {
  const scenario = evaluate(
    buildState({
      today: "2026-07-10",
      balances: { all: 60000, me: 60000, partner: 0 },
      transactions: [
        tx({
          id: "rent-july",
          amount: 50000,
          type: "expense",
          categoryId: "housing",
          date: "2026-07-16",
          note: "Аренда",
          confirmed: false,
          recurringId: "rent-recurring",
        }),
      ],
      recurringTransactions: [
        recurring({
          id: "rent-recurring",
          amount: 50000,
          type: "expense",
          categoryId: "housing",
          note: "Аренда",
          nextRunDate: "2026-07-16",
          frequency: "monthly",
          dayOfMonth: 6,
        }),
      ],
    }),
  );

  const paymentEvents = scenario.ctx.forecast.events.filter(
    (event) => event.source === "pending_transaction" || event.source === "recurring",
  );

  assert.notEqual(scenario.result.mainAction.type, "overdue_payment");
  assert.equal(
    paymentEvents.some((event) => event.date === "2026-07-06" && event.amount === -50000),
    false,
  );
  assert.equal(
    paymentEvents.some((event) => event.date === "2026-07-16" && event.amount === -50000),
    true,
  );
});

test("snoozed overdue income is hidden today without changing the forecast date, and returns tomorrow", () => {
  const baseMoneySetup = {
    ...emptyMoneySetup(),
    incomeSources: [
      {
        id: "salary-july",
        label: "Зарплата",
        expectedDate: "2026-07-06",
        expectedAmount: 50000,
        kind: "salary" as const,
        recurrence: "once" as const,
        isPrimary: true,
      },
    ],
    expectedEventReminderStates: [
      {
        eventKey: "income:salary-july:2026-07-06",
        remindOn: "2026-07-16",
      },
    ],
  };

  const hiddenToday = evaluate(
    buildState({
      today: "2026-07-15",
      balances: { all: 10000, me: 10000, partner: 0 },
      moneySetup: baseMoneySetup,
    }),
  );
  const visibleTomorrow = evaluate(
    buildState({
      today: "2026-07-16",
      balances: { all: 10000, me: 10000, partner: 0 },
      moneySetup: baseMoneySetup,
    }),
  );

  const hiddenForecastEvent = hiddenToday.ctx.forecast.events.find(
    (event) => event.incomeOccurrenceDate === "2026-07-06",
  );
  const visibleForecastEvent = visibleTomorrow.ctx.forecast.events.find(
    (event) => event.incomeOccurrenceDate === "2026-07-06",
  );

  assert.notEqual(hiddenToday.result.mainAction.type, "resolve_income_delay");
  assert.equal(hiddenForecastEvent?.date, "2026-07-15");
  assert.equal(visibleTomorrow.result.mainAction.type, "resolve_income_delay");
  assert.equal(visibleForecastEvent?.date, "2026-07-16");
});

test("snoozed overdue payment is hidden today without changing the forecast date, and returns tomorrow", () => {
  const baseState = buildState({
    today: "2026-07-15",
    balances: { all: 60000, me: 60000, partner: 0 },
    transactions: [
      tx({
        id: "rent-july",
        amount: 50000,
        type: "expense",
        categoryId: "housing",
        date: "2026-07-10",
        note: "Аренда",
        confirmed: false,
      }),
    ],
    moneySetup: {
      ...emptyMoneySetup(),
      expectedEventReminderStates: [
        {
          eventKey: "expense:rent-july:2026-07-10",
          remindOn: "2026-07-16",
        },
      ],
    },
  });

  const hiddenToday = evaluate(baseState);
  const visibleTomorrow = evaluate({
    ...baseState,
    today: "2026-07-16",
  });

  const hiddenPendingTx = hiddenToday.ctx.transactions.find((tx) => tx.id === "rent-july");
  const visiblePendingTx = visibleTomorrow.ctx.transactions.find((tx) => tx.id === "rent-july");

  assert.notEqual(hiddenToday.result.mainAction.type, "overdue_payment");
  assert.equal(hiddenPendingTx?.date, "2026-07-10");
  assert.equal(visibleTomorrow.result.mainAction.type, "pay_overdue");
  assert.equal(visiblePendingTx?.date, "2026-07-10");
});

test("monthly income uses the last available day for shorter months", () => {
  const sources = resolveMoneySetupIncomeSources({
    moneySetup: {
      ...emptyMoneySetup(),
      incomeSources: [
        {
          id: "month-end-income",
          label: "Доход в конце месяца",
          expectedDate: "2026-01-31",
          expectedAmount: 10000,
          kind: "salary",
          recurrence: "monthly",
          intervalMonths: 1,
          dayOfMonth: 31,
          isPrimary: true,
        },
      ],
    },
    confirmedTransactions: [],
    today: "2026-01-15",
    forecastHorizonMonths: 3,
    locale: "ru",
  });

  assert.deepEqual(
    sources.map((source) => source.occurrenceDate),
    ["2026-01-31", "2026-02-28", "2026-03-31"],
  );
});

test("recurring expense stops generating forecast events after endDate", () => {
  const ctx = buildContext(
    buildState({
      today: "2026-07-10",
      forecastHorizonMonths: 3,
      balances: { all: 50000, me: 50000, partner: 0 },
      recurringTransactions: [
        {
          id: "zoom",
          amount: 1500,
          type: "expense",
          categoryId: "subscriptions",
          note: "Zoom",
          owner: "me",
          frequency: "monthly",
          intervalMonths: 1,
          dayOfMonth: 11,
          nextRunDate: "2026-07-11",
          endDate: "2026-09-11",
          enabled: true,
        },
      ],
    }),
  );

  const zoomEvents = ctx.forecast.events.filter((event) => event.source === "recurring");
  assert.deepEqual(
    zoomEvents.map((event) => event.date),
    ["2026-07-11", "2026-08-11", "2026-09-11"],
  );
});

test("recurring expense includes the occurrence that lands exactly on endDate", () => {
  const ctx = buildContext(
    buildState({
      today: "2026-09-11",
      forecastHorizonMonths: 1,
      balances: { all: 20000, me: 20000, partner: 0 },
      recurringTransactions: [
        {
          id: "course",
          amount: 9300,
          type: "expense",
          categoryId: "education",
          note: "Курс",
          owner: "me",
          frequency: "monthly",
          intervalMonths: 1,
          dayOfMonth: 11,
          nextRunDate: "2026-09-11",
          endDate: "2026-09-11",
          enabled: true,
        },
      ],
    }),
  );

  const courseEvents = ctx.forecast.events.filter((event) => event.source === "recurring");
  assert.equal(courseEvents.length, 1);
  assert.equal(courseEvents[0]?.date, "2026-09-11");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  executeMainActionCommand,
  getForecastFocusFromCommand,
  getMainActionButtonLabel,
} from "@/components/today/main-action-resolver";
import { decisionCore } from "@/lib/decision-core";
import { getDefaultCategories } from "@/lib/categories";
import { emptyMoneySetup } from "@/lib/money-setup";
import { confirmPendingPaymentById } from "@/lib/pending-payment";
import type { DecisionCoreState, DecisionMainActionCommand } from "@/lib/decision-core/types";
import type { Transaction } from "@/types";

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

function buildState(input?: {
  transactions?: Transaction[];
  balances?: { all: number; me: number; partner: number };
  moneySetup?: ReturnType<typeof emptyMoneySetup>;
}): DecisionCoreState {
  return {
    locale: "ru",
    today: "2026-07-10",
    forecastHorizonMonths: 3,
    categories: getDefaultCategories(),
    transactions: input?.transactions ?? [],
    householdFilter: "all",
    recurringTransactions: [],
    debts: [],
    moneySetup: input?.moneySetup ?? emptyMoneySetup(),
    categoryBudgets: [],
    budgetMonthStartDay: 1,
    balances: input?.balances ?? { all: 0, me: 0, partner: 0 },
  };
}

test("confirm_payment uses the existing idempotent payment confirmation flow", async () => {
  const initialState = buildState({
    balances: { all: 10000, me: 10000, partner: 0 },
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
  });

  const before = decisionCore(initialState);
  assert.equal(before.mainAction.command.type, "confirm_payment");
  assert.equal(getMainActionButtonLabel(before.mainAction.command, "ru"), "Оплатить");
  assert.equal(before.todayPayments.length, 1);

  let transactions = initialState.transactions;
  const executor = {
    confirmPendingTransaction(paymentId: string) {
      const result = confirmPendingPaymentById(transactions, paymentId);
      transactions = result.transactions;
      return result.changed;
    },
    openIncomeConfirmation() {
      assert.fail("income confirmation should not open for confirm_payment");
    },
    openMoneySetup() {
      assert.fail("money setup should not open for confirm_payment");
    },
    openQuickAdd() {
      assert.fail("quick add should not open for confirm_payment");
    },
    navigateToTab() {
      assert.fail("navigation should not run for confirm_payment");
    },
  };

  const first = await executeMainActionCommand(before.mainAction.command, executor);
  assert.deepEqual(first, { ok: true });

  const afterFirst = decisionCore({
    ...initialState,
    transactions,
  });
  assert.equal(afterFirst.todayPayments.length, 0);
  assert.notEqual(afterFirst.mainAction.type, before.mainAction.type);

  const second = await executeMainActionCommand(before.mainAction.command, executor);
  assert.deepEqual(second, { ok: false, error: "missing_entity" });
});

test("forecast and recurring commands navigate through existing tabs without routes", async () => {
  const visitedTabs: string[] = [];
  const receivedOptions: unknown[] = [];
  const executor = {
    confirmPendingTransaction() {
      return false;
    },
    openIncomeConfirmation() {
      assert.fail("income confirmation should not open in navigation test");
    },
    openMoneySetup() {
      assert.fail("money setup should not open in navigation test");
    },
    openQuickAdd() {
      assert.fail("quick add should not open in navigation test");
    },
    navigateToTab(
      tab: string,
      options?: { forecastFocus?: unknown; planSection?: string; entityId?: string | null },
    ) {
      visitedTabs.push(tab);
      receivedOptions.push(options ?? null);
    },
  };

  const forecastResult = await executeMainActionCommand(
    {
      type: "open_forecast",
      focusDate: "2026-07-15",
      reason: "future_deficit",
    },
    executor,
  );
  const recurringResult = await executeMainActionCommand(
    { type: "open_recurring_operations", recurringId: "rent" },
    executor,
  );

  assert.deepEqual([forecastResult, recurringResult], [{ ok: true }, { ok: true }]);
  assert.deepEqual(visitedTabs, ["forecast", "plan"]);
  assert.deepEqual(receivedOptions, [
    {
      forecastFocus: {
        date: "2026-07-15",
        source: "today_main_action",
        reason: "future_deficit",
        eventId: null,
      },
    },
    {
      planSection: "recurring",
      entityId: "rent",
    },
  ]);
});

test("forecast focus is passed through without recalculating the date", () => {
  assert.deepEqual(
    getForecastFocusFromCommand({
      type: "open_forecast",
      focusDate: "2026-07-27T00:15:00.000Z",
      reason: "reserve_required",
    }),
    {
      date: "2026-07-27T00:15:00.000Z",
      source: "today_main_action",
      reason: "reserve_required",
      eventId: null,
    },
  );
});

test("confirm_income_source opens the confirmation flow with the planned payload", async () => {
  let opened: unknown = null;
  const command: DecisionMainActionCommand = {
    type: "confirm_income_source",
    incomeSourceId: "salary-july",
    incomeTitle: "Зарплата",
    plannedDate: "2026-07-10",
    plannedAmount: 120000,
    status: "due_today",
  };

  const result = await executeMainActionCommand(command, {
    confirmPendingTransaction() {
      assert.fail("payment confirmation should not run for income confirmation");
    },
    openIncomeConfirmation(params) {
      opened = params;
    },
    openMoneySetup() {
      assert.fail("money setup should not open for income confirmation");
    },
    openQuickAdd() {
      assert.fail("quick add should not open for income confirmation");
    },
    navigateToTab() {
      assert.fail("navigation should not run for income confirmation");
    },
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(opened, {
    type: "confirm_income_source",
    incomeSourceId: "salary-july",
    incomeTitle: "Зарплата",
    plannedDate: "2026-07-10",
    plannedAmount: 120000,
    status: "due_today",
  });
  assert.equal(getMainActionButtonLabel(command, "ru"), "Получил");
});

test("unknown command is safely rejected and cannot cause a money mutation", async () => {
  let mutationCount = 0;
  const command = { type: "mystery" } as unknown as DecisionMainActionCommand;
  const result = await executeMainActionCommand(command, {
    confirmPendingTransaction() {
      mutationCount += 1;
      return true;
    },
    openIncomeConfirmation() {
      mutationCount += 1;
    },
    openMoneySetup() {
      mutationCount += 1;
    },
    openQuickAdd() {
      mutationCount += 1;
    },
    navigateToTab() {
      mutationCount += 1;
    },
  });

  assert.deepEqual(result, { ok: false, error: "unsupported_command" });
  assert.equal(mutationCount, 0);
});

test("no command does not produce an artificial CTA label", () => {
  assert.equal(getMainActionButtonLabel({ type: "none" }, "ru"), null);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  getCountableDailySafeSpent,
  isCountableDailySafeExpense,
  resolveDailySafeSpending,
  type DailySafeSpendingSnapshot,
} from "@/lib/daily-safe-spending";
import type { DecisionAllowed } from "@/lib/decision-core/types";
import type { Transaction } from "@/types";

function makeAllowed(partial?: Partial<DecisionAllowed>): DecisionAllowed {
  return {
    text: "Можно потратить сегодня до 34 418 ₽ без риска для прогноза.",
    hasRestPermission: true,
    status: "available",
    amount: 34418,
    horizonDate: "2026-08-03",
    reason: "Это сумма сверх обязательств и резерва.",
    confidence: "confirmed",
    ...partial,
  };
}

function makeTx(partial?: Partial<Transaction>): Transaction {
  return {
    id: "tx-1",
    amount: 10000,
    type: "expense",
    categoryId: "food",
    currency: "RUB",
    note: "",
    date: "2026-07-13",
    owner: "me",
    confirmed: true,
    updatedAt: "2026-07-13T10:00:00.000Z",
    ...partial,
  };
}

function resolve(
  transactions: Transaction[],
  snapshot: DailySafeSpendingSnapshot | null = null,
  allowed?: DecisionAllowed,
  currentBalance = 50000,
) {
  return resolveDailySafeSpending({
    today: "2026-07-13",
    allowed: allowed ?? makeAllowed(),
    transactions,
    currentBalance,
    forecastHorizonMonths: 3,
    moneySetup: {
      useHouseholdBalance: false,
      updatedAt: "2026-07-13T09:00:00.000Z",
    },
    budgetMonthStartDay: 1,
    categoryBudgetsFingerprint: "budgets-v1",
    recurringFingerprint: "recurring-v1",
    debtsFingerprint: "debts-v1",
    snapshot,
  });
}

test("countable safe-spend expenses include only confirmed same-day discretionary expenses", () => {
  assert.equal(isCountableDailySafeExpense(makeTx(), "2026-07-13"), true);
  assert.equal(
    isCountableDailySafeExpense(makeTx({ confirmed: false }), "2026-07-13"),
    false,
  );
  assert.equal(
    isCountableDailySafeExpense(makeTx({ recurringId: "rent" }), "2026-07-13"),
    false,
  );
  assert.equal(
    isCountableDailySafeExpense(makeTx({ transferPairId: "pair-1" }), "2026-07-13"),
    false,
  );
  assert.equal(
    isCountableDailySafeExpense(makeTx({ type: "income" }), "2026-07-13"),
    false,
  );
});

test("daily safe-spend snapshot starts from the raw allowed amount", () => {
  const result = resolve([]);
  assert.equal(result.view.status, "available");
  assert.equal(result.view.baseAmount, 34418);
  assert.equal(result.view.spentToday, 0);
  assert.equal(result.view.remainingAmount, 34418);
  assert.equal(result.nextSnapshot?.baselineCountableSpent, 0);
});

test("remaining safe amount decreases cumulatively after today's expense", () => {
  const initial = resolve([]);
  const afterExpense = resolve(
    [makeTx({ amount: 31098, id: "expense-1" })],
    initial.nextSnapshot,
    undefined,
    18902,
  );

  assert.equal(afterExpense.view.baseAmount, 34418);
  assert.equal(afterExpense.view.spentToday, 31098);
  assert.equal(afterExpense.view.remainingAmount, 3320);
});

test("income, transfer and recurring payment do not reduce remaining safe amount", () => {
  const initial = resolve([]);
  const transactions = [
    makeTx({ id: "income", type: "income", amount: 20000 }),
    makeTx({ id: "transfer", transferPairId: "pair-1", amount: 12000 }),
    makeTx({ id: "recurring", recurringId: "rent", amount: 15000 }),
  ];
  const result = resolve(
    transactions,
    initial.nextSnapshot,
  );

  assert.equal(getCountableDailySafeSpent(transactions, "2026-07-13"), 0);
  assert.equal(result.view.spentToday, 0);
  assert.equal(result.view.remainingAmount, 34418);
});

test("restricted and unknown raw states clear the daily snapshot instead of showing stale budget", () => {
  const initial = resolve([]);
  const restricted = resolve(
    [],
    initial.nextSnapshot,
    makeAllowed({ status: "restricted", amount: 0, hasRestPermission: false }),
  );

  assert.equal(restricted.view.status, "restricted");
  assert.equal(restricted.view.remainingAmount, null);
  assert.equal(restricted.nextSnapshot, null);
  assert.equal(restricted.shouldPersist, true);
});

test("non-spending financial changes reset the daily snapshot to a new base", () => {
  const initial = resolve([]);
  const changed = resolveDailySafeSpending({
    today: "2026-07-13",
    allowed: makeAllowed({ amount: 12000 }),
    transactions: [],
    currentBalance: 65000,
    forecastHorizonMonths: 3,
    moneySetup: {
      useHouseholdBalance: false,
      updatedAt: "2026-07-13T12:00:00.000Z",
    },
    budgetMonthStartDay: 1,
    categoryBudgetsFingerprint: "budgets-v2",
    recurringFingerprint: "recurring-v1",
    debtsFingerprint: "debts-v1",
    snapshot: initial.nextSnapshot,
  });

  assert.equal(changed.view.baseAmount, 12000);
  assert.equal(changed.view.remainingAmount, 12000);
  assert.equal(changed.shouldPersist, true);
});

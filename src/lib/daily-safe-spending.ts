import type { DecisionAllowed } from "@/lib/decision-core/types";
import type { MoneySetup } from "@/lib/money-setup";
import type { Transaction } from "@/types";

export type DailySafeSpendingSnapshot = {
  date: string;
  baseAmount: number;
  baselineCountableSpent: number;
  fingerprint: string;
  updatedAt: string;
};

export type DailySafeSpendingView = {
  status: "available" | "restricted" | "unknown";
  remainingAmount: number | null;
  baseAmount: number | null;
  spentToday: number | null;
};

type ResolveDailySafeSpendingInput = {
  today: string;
  allowed: DecisionAllowed;
  transactions: Transaction[];
  currentBalance: number;
  forecastHorizonMonths: 1 | 3 | 6;
  moneySetup: Pick<MoneySetup, "useHouseholdBalance" | "updatedAt">;
  budgetMonthStartDay: number;
  categoryBudgetsFingerprint: string;
  recurringFingerprint: string;
  debtsFingerprint: string;
  snapshot: DailySafeSpendingSnapshot | null;
};

export type ResolveDailySafeSpendingResult = {
  view: DailySafeSpendingView;
  nextSnapshot: DailySafeSpendingSnapshot | null;
  shouldPersist: boolean;
};

function roundAmount(value: number): number {
  return Math.max(0, Math.round(value));
}

export function isCountableDailySafeExpense(tx: Transaction, today: string): boolean {
  return (
    tx.type === "expense" &&
    tx.date === today &&
    tx.confirmed !== false &&
    !tx.transferPairId &&
    !tx.recurringId
  );
}

export function getCountableDailySafeSpent(
  transactions: Transaction[],
  today: string,
): number {
  return roundAmount(
    transactions.reduce((sum, tx) => {
      if (!isCountableDailySafeExpense(tx, today)) return sum;
      return sum + tx.amount;
    }, 0),
  );
}

function buildDailySafeFingerprint(
  input: Omit<ResolveDailySafeSpendingInput, "allowed" | "snapshot">,
  countableSpent: number,
): string {
  const nonCountableTransactions = input.transactions
    .filter((tx) => !isCountableDailySafeExpense(tx, input.today))
    .map((tx) => [
      tx.id,
      tx.amount,
      tx.type,
      tx.date,
      tx.owner,
      tx.confirmed === false ? 0 : 1,
      tx.recurringId ?? "",
      tx.transferPairId ?? "",
      tx.updatedAt ?? "",
    ]);

  return JSON.stringify({
    today: input.today,
    currentBalanceBasis: roundAmount(input.currentBalance + countableSpent),
    forecastHorizonMonths: input.forecastHorizonMonths,
    useHouseholdBalance: input.moneySetup.useHouseholdBalance,
    moneySetupUpdatedAt: input.moneySetup.updatedAt ?? null,
    budgetMonthStartDay: input.budgetMonthStartDay,
    categoryBudgetsFingerprint: input.categoryBudgetsFingerprint,
    recurringFingerprint: input.recurringFingerprint,
    debtsFingerprint: input.debtsFingerprint,
    nonCountableTransactions,
  });
}

export function resolveDailySafeSpending(
  input: ResolveDailySafeSpendingInput,
): ResolveDailySafeSpendingResult {
  const countableSpent = getCountableDailySafeSpent(input.transactions, input.today);

  if (input.allowed.status !== "available" || input.allowed.amount == null) {
    return {
      view: {
        status: input.allowed.status ?? "unknown",
        remainingAmount: null,
        baseAmount: null,
        spentToday: null,
      },
      nextSnapshot: null,
      shouldPersist: input.snapshot != null,
    };
  }

  const fingerprint = buildDailySafeFingerprint(input, countableSpent);
  const snapshotIsValid =
    input.snapshot?.date === input.today && input.snapshot.fingerprint === fingerprint;

  const nextSnapshot =
    snapshotIsValid && input.snapshot
      ? input.snapshot
      : {
          date: input.today,
          baseAmount: roundAmount(input.allowed.amount),
          baselineCountableSpent: countableSpent,
          fingerprint,
          updatedAt: new Date().toISOString(),
        };

  const spentToday = roundAmount(countableSpent - nextSnapshot.baselineCountableSpent);
  const remainingFromBase = roundAmount(nextSnapshot.baseAmount - spentToday);
  const remainingAmount = Math.min(roundAmount(input.allowed.amount), remainingFromBase);

  return {
    view: {
      status: "available",
      remainingAmount,
      baseAmount: nextSnapshot.baseAmount,
      spentToday,
    },
    nextSnapshot,
    shouldPersist:
      !snapshotIsValid ||
      input.snapshot?.baseAmount !== nextSnapshot.baseAmount ||
      input.snapshot?.baselineCountableSpent !== nextSnapshot.baselineCountableSpent,
  };
}

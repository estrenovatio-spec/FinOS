import { getCategoryLabel } from "@/lib/categories";
import { isExpectedEventVisibleToday } from "@/lib/expected-events";
import { recurringDisplayName } from "@/lib/planning/recurring-skipped";
import { isPendingTransaction } from "@/lib/transaction-confirmed";
import type { DecisionCoreContext, DecisionTodayPayment } from "@/lib/decision-core/types";
import type { DebtItem } from "@/types/planning";

function debtPaymentKey(debtId: string, paymentDate: string): string {
  return `debt:${debtId}:${paymentDate}`;
}

function sortDebtsByStrategy(debts: DebtItem[]): DebtItem[] {
  const strategy = debts[0]?.strategy ?? "avalanche";
  return [...debts].sort((a, b) => {
    const aOverdue = a.nextPaymentDate != null;
    const bOverdue = b.nextPaymentDate != null;
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    if (strategy === "snowball") {
      if (a.balance !== b.balance) return a.balance - b.balance;
      return (b.ratePct ?? 0) - (a.ratePct ?? 0);
    }
    const aRate = a.ratePct ?? -1;
    const bRate = b.ratePct ?? -1;
    if (bRate !== aRate) return bRate - aRate;
    return a.balance - b.balance;
  });
}

export function buildTodayPayments(ctx: DecisionCoreContext): DecisionTodayPayment[] {
  const { locale, today, categories, transactions, debts, recurringTransactions } = ctx;

  const pendingExpensePayments: DecisionTodayPayment[] = transactions
    .filter(isPendingTransaction)
    .filter((transaction) => transaction.type === "expense")
    .filter((transaction) => transaction.date.slice(0, 10) <= today)
    .filter((transaction) =>
      isExpectedEventVisibleToday(
        `expense:${transaction.id}:${transaction.date.slice(0, 10)}`,
        ctx.expectedEventReminderStates,
        today,
      ),
    )
    .map((transaction) => {
      const recurringItem =
        transaction.recurringId != null
          ? recurringTransactions.find((item) => item.id === transaction.recurringId) ?? null
          : null;
      const categoryLabel = getCategoryLabel(transaction.categoryId, categories, locale);
      const title =
        (recurringItem ? recurringDisplayName(recurringItem, categoryLabel) : null) ||
        transaction.note.trim() ||
        categoryLabel;

      return {
        id: transaction.id,
        title,
        amount: transaction.amount,
        date: transaction.date.slice(0, 10),
        isOverdue: transaction.date.slice(0, 10) < today,
        source: "pending_transaction" as const,
        debtId: null,
        paymentKey: `expense:${transaction.id}:${transaction.date.slice(0, 10)}`,
        paymentSource: transaction.recurringId ? ("recurring" as const) : ("manual" as const),
        linkedEntityId: transaction.recurringId ?? transaction.id,
      };
    });

  const prioritizedDebts = sortDebtsByStrategy(
    debts
      .filter((debt) => debt.balance > 0 && debt.minPayment > 0 && debt.nextPaymentDate)
      .filter((debt) => debt.nextPaymentDate!.slice(0, 10) <= today)
      .filter((debt) =>
        isExpectedEventVisibleToday(
          debtPaymentKey(debt.id, debt.nextPaymentDate!.slice(0, 10)),
          ctx.expectedEventReminderStates,
          today,
        ),
      ),
  );
  const debtRank = new Map(prioritizedDebts.map((debt, index) => [debt.id, index]));

  const debtPayments: DecisionTodayPayment[] = prioritizedDebts
    .map((debt) => ({
      id: debtPaymentKey(debt.id, debt.nextPaymentDate!.slice(0, 10)),
      title: debt.name.trim(),
      amount: debt.minPayment,
      date: debt.nextPaymentDate!.slice(0, 10),
      isOverdue: debt.nextPaymentDate!.slice(0, 10) < today,
      source: "debt_payment" as const,
      debtId: debt.id,
      paymentKey: debtPaymentKey(debt.id, debt.nextPaymentDate!.slice(0, 10)),
      paymentSource: "debt" as const,
      linkedEntityId: debt.id,
    }));

  return [...pendingExpensePayments, ...debtPayments].sort((left, right) => {
    const leftOverdue = left.isOverdue ? 1 : 0;
    const rightOverdue = right.isOverdue ? 1 : 0;
    if (leftOverdue !== rightOverdue) return rightOverdue - leftOverdue;
    if (left.date !== right.date) return left.date.localeCompare(right.date);
    if (left.source === "debt_payment" && right.source !== "debt_payment") return -1;
    if (left.source !== "debt_payment" && right.source === "debt_payment") return 1;
    if (left.source === "debt_payment" && right.source === "debt_payment") {
      return (debtRank.get(left.debtId ?? "") ?? 0) - (debtRank.get(right.debtId ?? "") ?? 0);
    }
    return right.amount - left.amount;
  });
}

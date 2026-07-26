import type { Transaction } from "@/types";
import { resolveRecurringOccurrenceDate } from "@/lib/recurring-occurrence";

export type ConfirmPendingPaymentResult = {
  changed: boolean;
  updatedTransaction: Transaction | null;
  transactions: Transaction[];
};

export function confirmPendingPaymentById(
  transactions: Transaction[],
  paymentId: string,
  opts?: { paidAt?: string },
): ConfirmPendingPaymentResult {
  let updatedTransaction: Transaction | null = null;

  const nextTransactions = transactions.map((transaction) => {
    if (transaction.id !== paymentId) {
      return transaction;
    }

    if (transaction.confirmed !== false) {
      return transaction;
    }

    updatedTransaction = {
      ...transaction,
      date: opts?.paidAt ?? transaction.date,
      confirmed: true,
      recurringOccurrenceDate:
        transaction.recurringId != null
          ? resolveRecurringOccurrenceDate(transaction)
          : transaction.recurringOccurrenceDate ?? null,
      updatedAt: new Date().toISOString(),
    };
    return updatedTransaction;
  });

  return {
    changed: updatedTransaction != null,
    updatedTransaction,
    transactions: updatedTransaction ? nextTransactions : transactions,
  };
}

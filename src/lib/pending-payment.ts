import type { Transaction } from "@/types";

export type ConfirmPendingPaymentResult = {
  changed: boolean;
  updatedTransaction: Transaction | null;
  transactions: Transaction[];
};

export function confirmPendingPaymentById(
  transactions: Transaction[],
  paymentId: string,
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
      confirmed: true,
    };
    return updatedTransaction;
  });

  return {
    changed: updatedTransaction != null,
    updatedTransaction,
    transactions: updatedTransaction ? nextTransactions : transactions,
  };
}

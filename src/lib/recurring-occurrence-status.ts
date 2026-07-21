import type { Transaction } from "@/types";
import type { RecurringTransaction } from "@/types/planning";
import { resolveRecurringOccurrenceDate } from "@/lib/recurring-occurrence";

export type RecurringOccurrenceStatus =
  | "pending"
  | "paid"
  | "skipped"
  | "rescheduled"
  | "cancelled"
  | "overdue"
  | "upcoming"
  | "paused";

export type ResolvedRecurringOccurrenceStatus = {
  status: RecurringOccurrenceStatus;
  occurrenceDate: string;
  scheduledDate: string;
  paidAt: string | null;
  pendingTransaction: Transaction | null;
  paidTransaction: Transaction | null;
  skipped: boolean;
};

function sameOccurrenceTransaction(
  transaction: Transaction,
  recurringId: string,
  occurrenceDate: string,
): boolean {
  return (
    transaction.recurringId === recurringId &&
    resolveRecurringOccurrenceDate(transaction) === occurrenceDate
  );
}

export function resolveRecurringOccurrenceStatus(args: {
  item: RecurringTransaction;
  transactions: readonly Transaction[];
  occurrenceDate?: string | null;
  today: string;
}): ResolvedRecurringOccurrenceStatus {
  const occurrenceDate = args.occurrenceDate ?? args.item.nextRunDate;
  const matchingTransactions = args.transactions.filter((transaction) =>
    sameOccurrenceTransaction(transaction, args.item.id, occurrenceDate),
  );
  const pendingTransaction =
    matchingTransactions.find((transaction) => transaction.confirmed === false) ?? null;
  const paidTransaction =
    [...matchingTransactions]
      .filter((transaction) => transaction.confirmed !== false)
      .sort((left, right) => right.date.localeCompare(left.date))[0] ?? null;
  const skipped = (args.item.skippedDates ?? []).includes(occurrenceDate);
  const scheduledDate = pendingTransaction?.date ?? paidTransaction?.date ?? occurrenceDate;

  if (!args.item.enabled) {
    return {
      status: "paused",
      occurrenceDate,
      scheduledDate,
      paidAt: paidTransaction?.date ?? null,
      pendingTransaction,
      paidTransaction,
      skipped,
    };
  }

  if (paidTransaction) {
    return {
      status: "paid",
      occurrenceDate,
      scheduledDate,
      paidAt: paidTransaction.date,
      pendingTransaction,
      paidTransaction,
      skipped,
    };
  }

  if (pendingTransaction) {
    return {
      status:
        pendingTransaction.date.slice(0, 10) !== occurrenceDate ? "rescheduled" : "pending",
      occurrenceDate,
      scheduledDate: pendingTransaction.date.slice(0, 10),
      paidAt: null,
      pendingTransaction,
      paidTransaction: null,
      skipped,
    };
  }

  if (skipped) {
    return {
      status: "skipped",
      occurrenceDate,
      scheduledDate,
      paidAt: null,
      pendingTransaction: null,
      paidTransaction: null,
      skipped: true,
    };
  }

  if (occurrenceDate < args.today) {
    return {
      status: "overdue",
      occurrenceDate,
      scheduledDate,
      paidAt: null,
      pendingTransaction: null,
      paidTransaction: null,
      skipped: false,
    };
  }

  return {
    status: "upcoming",
    occurrenceDate,
    scheduledDate,
    paidAt: null,
    pendingTransaction: null,
    paidTransaction: null,
    skipped: false,
  };
}

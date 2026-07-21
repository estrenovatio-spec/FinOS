import { advanceRecurringDate } from "@/lib/planning/analytics";
import { getLocalTodayIsoDate } from "@/lib/format-date";
import type { ParsedTransaction } from "@/types";
import type { ExpectedPaymentCandidate } from "@/lib/expected-payment-matcher";
import type { RecurringTransaction } from "@/types/planning";

type StoreActions = {
  addTransaction: (data: ParsedTransaction, transcript?: string) => string;
  updateTransaction: (
    id: string,
    patch: {
      amount?: number;
      categoryId?: string;
      date?: string;
      confirmed?: boolean;
      recurringOccurrenceDate?: string | null;
      note?: string;
    },
  ) => void;
  deleteTransaction: (id: string) => void;
  payDebt: (
    id: string,
    amount: number,
    opts?: { paymentDate?: string; updateSchedule?: boolean },
  ) => boolean;
  updateDebt: (
    id: string,
    patch: {
      balance?: number;
      nextPaymentDate?: string | null;
    },
  ) => void;
  updateRecurring: (
    id: string,
    patch: Partial<RecurringTransaction>,
  ) => void;
};

type StoreLookups = {
  recurringTransactions: RecurringTransaction[];
  debts: Array<{
    id: string;
    balance: number;
    minPayment: number;
    nextPaymentDate: string | null;
  }>;
};

export function confirmExpectedPaymentFromInput(args: {
  candidate: ExpectedPaymentCandidate;
  actual: ParsedTransaction;
  transcript?: string;
  actions: StoreActions;
  lookups: StoreLookups;
}): boolean {
  const amount = Math.max(0, Math.round(args.actual.amount));
  if (amount <= 0) return false;
  const paymentDate = args.actual.date || args.candidate.originalDate || getLocalTodayIsoDate();

  if (args.candidate.debtId) {
    const debt = args.lookups.debts.find((item) => item.id === args.candidate.debtId) ?? null;
    const paid = args.actions.payDebt(args.candidate.debtId, amount, {
      paymentDate,
      updateSchedule: false,
    });
    if (!paid || !debt) return paid;

    const remainingBalance = Math.max(0, debt.balance - Math.min(amount, debt.balance));
    const paidInFullForOccurrence = amount >= args.candidate.amount;
    if (remainingBalance <= 0) {
      args.actions.updateDebt(args.candidate.debtId, { nextPaymentDate: null });
    } else if (paidInFullForOccurrence && debt.nextPaymentDate) {
      const nextDate = advanceRecurringDate(
        debt.nextPaymentDate,
        "monthly",
        Number.parseInt(debt.nextPaymentDate.slice(8, 10), 10) || 1,
        1,
      );
      args.actions.updateDebt(args.candidate.debtId, { nextPaymentDate: nextDate });
    } else if (paymentDate !== args.candidate.originalDate) {
      args.actions.updateDebt(args.candidate.debtId, { nextPaymentDate: paymentDate });
    }
    return true;
  }

  if (args.candidate.transactionId) {
    const remaining = Math.max(0, args.candidate.amount - amount);
    if (remaining <= 0) {
      args.actions.updateTransaction(args.candidate.transactionId, {
        amount,
        date: paymentDate,
        confirmed: true,
        recurringOccurrenceDate: args.candidate.originalDate,
        note: args.actual.note,
        categoryId: args.actual.categoryId,
      });
      return true;
    }

    args.actions.updateTransaction(args.candidate.transactionId, {
      amount: remaining,
      date: paymentDate,
      confirmed: false,
      recurringOccurrenceDate: args.candidate.originalDate,
    });
    args.actions.addTransaction(
      {
        ...args.actual,
        amount,
        confirmed: true,
        recurringId: args.candidate.recurringId,
        recurringOccurrenceDate: args.candidate.originalDate,
      },
      args.transcript,
    );
    if (args.candidate.recurringId) {
      const recurringItem =
        args.lookups.recurringTransactions.find((item) => item.id === args.candidate.recurringId) ??
        null;
      if (recurringItem) {
        const nextDate = advanceRecurringDate(
          args.candidate.originalDate,
          recurringItem.frequency,
          recurringItem.dayOfMonth,
          recurringItem.intervalMonths ?? 1,
        );
        args.actions.updateRecurring(recurringItem.id, { nextRunDate: nextDate });
      }
    }
    return true;
  }

  if (args.candidate.recurringId) {
    const recurringItem =
      args.lookups.recurringTransactions.find((item) => item.id === args.candidate.recurringId) ??
      null;
    if (!recurringItem) return false;

    const remaining = Math.max(0, args.candidate.amount - amount);
    args.actions.addTransaction(
      {
        ...args.actual,
        amount,
        categoryId: recurringItem.categoryId,
        owner: recurringItem.owner,
        confirmed: true,
        recurringId: recurringItem.id,
        recurringOccurrenceDate: args.candidate.originalDate,
      },
      args.transcript,
    );
    if (remaining > 0) {
      args.actions.addTransaction(
        {
          amount: remaining,
          type: "expense",
          categoryId: recurringItem.categoryId,
          currency: "RUB",
          note: recurringItem.note || args.candidate.title,
          date: paymentDate,
          owner: recurringItem.owner,
          confirmed: false,
          recurringId: recurringItem.id,
          recurringOccurrenceDate: args.candidate.originalDate,
        },
        recurringItem.note || args.candidate.title,
      );
    }
    const nextDate = advanceRecurringDate(
      args.candidate.originalDate,
      recurringItem.frequency,
      recurringItem.dayOfMonth,
      recurringItem.intervalMonths ?? 1,
    );
    args.actions.updateRecurring(recurringItem.id, { nextRunDate: nextDate });
    return true;
  }

  return false;
}

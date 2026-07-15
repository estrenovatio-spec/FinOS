import { getCategoryLabel } from "@/lib/categories";
import { isExpectedEventVisibleToday } from "@/lib/expected-events";
import { isPendingTransaction } from "@/lib/transaction-confirmed";
import type { DecisionCoreContext, DecisionTodayPayment } from "@/lib/decision-core/types";

export function buildTodayPayments(ctx: DecisionCoreContext): DecisionTodayPayment[] {
  const { locale, today, categories, transactions } = ctx;

  return transactions
    .filter(isPendingTransaction)
    .filter((transaction) => transaction.type === "expense")
    .filter((transaction) => transaction.date.slice(0, 10) === today)
    .filter((transaction) =>
      isExpectedEventVisibleToday(
        `expense:${transaction.id}:${transaction.date.slice(0, 10)}`,
        ctx.expectedEventReminderStates,
        today,
      ),
    )
    .map((transaction) => ({
      id: transaction.id,
      title:
        transaction.note.trim() || getCategoryLabel(transaction.categoryId, categories, locale),
      amount: transaction.amount,
      date: transaction.date.slice(0, 10),
      isOverdue: false,
      source: "pending_transaction" as const,
    }))
    .sort((left, right) => right.amount - left.amount);
}

import type { Transaction } from "@/types";

export type FutureOperationGroup = "planned" | "due" | "paid";

export type PlanningRecurringCardGroupInput = {
  paid: boolean;
  resolvedStatus: "pending" | "paid" | "skipped" | "rescheduled" | "cancelled" | "overdue" | "upcoming" | "paused";
  scheduledDate: string;
};

export function resolveFutureOneTimeTransactionGroup(
  transaction: Pick<Transaction, "confirmed" | "date">,
  today: string,
): FutureOperationGroup {
  if (transaction.confirmed !== false) {
    return "paid";
  }

  return transaction.date.slice(0, 10) > today ? "planned" : "due";
}

export function resolveFutureRecurringOperationGroup(
  card: PlanningRecurringCardGroupInput,
  today: string,
): FutureOperationGroup {
  if (card.paid || card.resolvedStatus === "paid") {
    return "paid";
  }

  return card.scheduledDate > today ? "planned" : "due";
}

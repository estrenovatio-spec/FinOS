import type { Transaction } from "@/types";

export type FutureOperationGroup = "planned" | "due" | "paid";

export type PlannedFutureOperationsSplit<T> = {
  currentMonth: T[];
  laterMonths: Array<{
    monthKey: string;
    items: T[];
  }>;
};

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

export function splitPlannedFutureOperationsByMonth<T extends { sortDate: string }>(
  items: T[],
  today: string,
): PlannedFutureOperationsSplit<T> {
  const currentMonthKey = today.slice(0, 7);
  const currentMonth: T[] = [];
  const laterMonthBuckets = new Map<string, T[]>();

  for (const item of items) {
    const monthKey = item.sortDate.slice(0, 7);
    if (monthKey === currentMonthKey) {
      currentMonth.push(item);
      continue;
    }

    const bucket = laterMonthBuckets.get(monthKey);
    if (bucket) {
      bucket.push(item);
      continue;
    }

    laterMonthBuckets.set(monthKey, [item]);
  }

  return {
    currentMonth,
    laterMonths: [...laterMonthBuckets.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([monthKey, monthItems]) => ({
        monthKey,
        items: monthItems,
      })),
  };
}

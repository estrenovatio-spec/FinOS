import { advanceRecurringDate, todayIso } from "@/lib/planning/analytics";
import { recurringDisplayName } from "@/lib/planning/recurring-skipped";
import type { ParsedTransaction } from "@/types";
import type { RecurringTransaction } from "@/types/planning";

export function getDueRecurringItems(items: RecurringTransaction[]): RecurringTransaction[] {
  const today = todayIso();
  return items.filter(
    (r) => r.enabled && r.nextRunDate <= today && (!r.endDate || r.nextRunDate <= r.endDate),
  );
}

export function recurringToParsedTransaction(
  item: RecurringTransaction,
  runDate: string,
  categoryLabel = "",
): ParsedTransaction {
  const name = recurringDisplayName(item, categoryLabel);
  return {
    amount: item.amount,
    type: item.type,
    categoryId: item.categoryId,
    currency: "RUB",
    note: name ? `${name} (регулярно)` : "Регулярный платёж",
    date: runDate,
    owner: item.owner,
  };
}

export function nextRunAfterProcessing(item: RecurringTransaction, today: string): string {
  let next = item.nextRunDate;
  while (next <= today && (!item.endDate || next <= item.endDate)) {
    next = advanceRecurringDate(
      next,
      item.frequency,
      item.dayOfMonth,
      item.intervalMonths ?? 1,
    );
  }
  return next;
}

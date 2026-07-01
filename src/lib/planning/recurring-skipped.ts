import type { RecurringTransaction } from "@/types/planning";

export function recurringDisplayName(
  item: RecurringTransaction,
  categoryLabel: string,
): string {
  const name = item.note?.trim();
  return name || categoryLabel;
}

export function appendSkippedDate(existing: readonly string[] | undefined, date: string): string[] {
  const set = new Set(existing ?? []);
  set.add(date);
  return [...set].sort((a, b) => b.localeCompare(a));
}

export function skippedPaymentCount(item: RecurringTransaction): number {
  return item.skippedDates?.length ?? 0;
}

export function skippedPaymentTotal(item: RecurringTransaction): number {
  return skippedPaymentCount(item) * item.amount;
}

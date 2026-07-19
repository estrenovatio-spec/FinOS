import type { Transaction } from "@/types";
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

function weekBucket(dateIso: string): string {
  const date = new Date(`${dateIso}T12:00:00`);
  const weekday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - weekday);
  return date.toISOString().slice(0, 10);
}

function occurrenceBucket(item: RecurringTransaction, dateIso: string): string {
  if (item.frequency === "weekly") {
    return `weekly:${weekBucket(dateIso)}`;
  }
  if (item.frequency === "yearly") {
    return `yearly:${dateIso.slice(0, 4)}`;
  }
  return `monthly:${dateIso.slice(0, 7)}`;
}

export function hasConfirmedRecurringOccurrenceInBucket(
  item: RecurringTransaction,
  dateIso: string,
  transactions: readonly Transaction[],
): boolean {
  const bucket = occurrenceBucket(item, dateIso);
  return transactions.some(
    (tx) =>
      tx.recurringId === item.id &&
      tx.confirmed !== false &&
      occurrenceBucket(item, tx.date) === bucket,
  );
}

export function effectiveSkippedDates(
  item: RecurringTransaction,
  transactions: readonly Transaction[],
): string[] {
  const uniqueDates = [...new Set(item.skippedDates ?? [])];
  return uniqueDates
    .filter((dateIso) => !hasConfirmedRecurringOccurrenceInBucket(item, dateIso, transactions))
    .sort((a, b) => b.localeCompare(a));
}

export function sanitizeRecurringSkippedDates(
  item: RecurringTransaction,
  transactions: readonly Transaction[],
): RecurringTransaction {
  const skippedDates = effectiveSkippedDates(item, transactions);
  const current = item.skippedDates ?? [];
  const unchanged =
    current.length === skippedDates.length &&
    current.every((date, index) => date === skippedDates[index]);
  if (unchanged) {
    return item;
  }
  return {
    ...item,
    skippedDates,
  };
}

export function sanitizeRecurringTransactionsSkippedDates(
  recurringTransactions: readonly RecurringTransaction[],
  transactions: readonly Transaction[],
): RecurringTransaction[] {
  return recurringTransactions.map((item) => sanitizeRecurringSkippedDates(item, transactions));
}

export function skippedPaymentCount(item: RecurringTransaction): number {
  return item.skippedDates?.length ?? 0;
}

export function skippedPaymentTotal(item: RecurringTransaction): number {
  return skippedPaymentCount(item) * item.amount;
}

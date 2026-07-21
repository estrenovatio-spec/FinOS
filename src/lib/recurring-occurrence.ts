import type { Transaction } from "@/types";
import type { RecurringTransaction } from "@/types/planning";

type RecurringLikeTransaction = Pick<
  Transaction,
  "id" | "type" | "date" | "confirmed" | "recurringId" | "recurringOccurrenceDate" | "updatedAt"
>;

function normalizedIsoDate(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

export function resolveRecurringOccurrenceDate(
  tx: Pick<Transaction, "date" | "recurringOccurrenceDate">,
): string {
  return (
    normalizedIsoDate(tx.recurringOccurrenceDate) ??
    normalizedIsoDate(tx.date.slice(0, 10)) ??
    tx.date.slice(0, 10)
  );
}

export function buildRecurringOccurrenceKey(
  recurringId: string,
  occurrenceDate: string,
  type: Transaction["type"],
): string {
  return `${recurringId}:${occurrenceDate}:${type}`;
}

export function buildRecurringOccurrenceKeyForTransaction(
  tx: Pick<Transaction, "type" | "recurringId" | "recurringOccurrenceDate" | "date">,
): string | null {
  if (!tx.recurringId) return null;
  return buildRecurringOccurrenceKey(
    tx.recurringId,
    resolveRecurringOccurrenceDate(tx),
    tx.type,
  );
}

function recurringTransactionTime(tx: RecurringLikeTransaction): number {
  const updated = tx.updatedAt ? Date.parse(tx.updatedAt) : NaN;
  if (!Number.isNaN(updated)) return updated;
  const dated = Date.parse(`${tx.date}T12:00:00`);
  return Number.isNaN(dated) ? 0 : dated;
}

export function repairRecurringLinkedTransactions(
  transactions: readonly Transaction[],
  recurringTransactions: readonly RecurringTransaction[] = [],
): Transaction[] {
  if (transactions.length === 0) return [...transactions];

  const recurringIds = new Set(recurringTransactions.map((item) => item.id));
  const byKey = new Map<string, Transaction>();
  const passthrough: Transaction[] = [];

  for (const rawTransaction of transactions) {
    if (!rawTransaction.recurringId) {
      passthrough.push(rawTransaction);
      continue;
    }

    const recurringOccurrenceDate = resolveRecurringOccurrenceDate(rawTransaction);
    const normalized: Transaction = {
      ...rawTransaction,
      recurringOccurrenceDate,
    };
    const recurringId = normalized.recurringId ?? rawTransaction.recurringId;
    if (!recurringId) {
      passthrough.push(normalized);
      continue;
    }

    const key = buildRecurringOccurrenceKey(
      recurringId,
      recurringOccurrenceDate,
      normalized.type,
    );
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, normalized);
      continue;
    }

    const existingConfirmed = existing.confirmed !== false;
    const nextConfirmed = normalized.confirmed !== false;
    if (existingConfirmed !== nextConfirmed) {
      byKey.set(key, nextConfirmed ? normalized : existing);
      continue;
    }

    if (recurringTransactionTime(normalized) >= recurringTransactionTime(existing)) {
      byKey.set(key, normalized);
    }
  }

  const recurringResults = [...byKey.values()].filter((transaction) => {
    if (transaction.confirmed === false) {
      const key = buildRecurringOccurrenceKeyForTransaction(transaction);
      if (!key) return true;
      const canonical = byKey.get(key);
      if (!canonical) return true;
      if (canonical.id !== transaction.id && canonical.confirmed !== false) {
        return false;
      }
    }
    return true;
  });

  const activeRecurringIds = recurringIds;
  return [...passthrough, ...recurringResults].map((transaction) => {
    if (
      transaction.recurringId &&
      !activeRecurringIds.has(transaction.recurringId) &&
      transaction.recurringOccurrenceDate == null
    ) {
      return {
        ...transaction,
        recurringOccurrenceDate: resolveRecurringOccurrenceDate(transaction),
      };
    }
    return transaction;
  });
}

export function isTransactionForRecurringOccurrence(
  tx: Pick<Transaction, "type" | "recurringId" | "recurringOccurrenceDate" | "date">,
  recurringId: string,
  occurrenceDate: string,
  type: Transaction["type"],
): boolean {
  if (tx.recurringId !== recurringId || tx.type !== type) return false;
  return resolveRecurringOccurrenceDate(tx) === occurrenceDate;
}

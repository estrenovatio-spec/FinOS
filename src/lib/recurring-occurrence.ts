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

function recurringDebugEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FINOS_DEBUG_RECURRING_DUPES === "1";
}

function logRecurringDuplicate(stage: string, args: {
  key: string;
  existing: Transaction;
  next: Transaction;
  recurringItem?: RecurringTransaction | null;
}): void {
  if (!recurringDebugEnabled()) return;
  console.info("[recurring-duplicate-debug]", {
    stage,
    key: args.key,
    recurringId: args.existing.recurringId ?? args.next.recurringId ?? null,
    occurrenceDate:
      args.existing.recurringOccurrenceDate ??
      args.next.recurringOccurrenceDate ??
      args.existing.date.slice(0, 10),
    recurringNextRunDate: args.recurringItem?.nextRunDate ?? null,
    existing: {
      id: args.existing.id,
      recurringId: args.existing.recurringId ?? null,
      recurringOccurrenceDate: args.existing.recurringOccurrenceDate ?? null,
      date: args.existing.date,
      confirmed: args.existing.confirmed ?? true,
      type: args.existing.type,
      amount: args.existing.amount,
      note: args.existing.note,
      updatedAt: args.existing.updatedAt ?? null,
    },
    next: {
      id: args.next.id,
      recurringId: args.next.recurringId ?? null,
      recurringOccurrenceDate: args.next.recurringOccurrenceDate ?? null,
      date: args.next.date,
      confirmed: args.next.confirmed ?? true,
      type: args.next.type,
      amount: args.next.amount,
      note: args.next.note,
      updatedAt: args.next.updatedAt ?? null,
    },
  });
}

export function repairRecurringLinkedTransactions(
  transactions: readonly Transaction[],
  recurringTransactions: readonly RecurringTransaction[] = [],
): Transaction[] {
  if (transactions.length === 0) return [...transactions];

  const recurringIds = new Set(recurringTransactions.map((item) => item.id));
  const recurringById = new Map(recurringTransactions.map((item) => [item.id, item]));
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
    const recurringItem = recurringById.get(recurringId);
    logRecurringDuplicate("duplicate_detected", {
      key,
      existing,
      next: normalized,
      recurringItem,
    });

    const existingConfirmed = existing.confirmed !== false;
    const nextConfirmed = normalized.confirmed !== false;
    if (existingConfirmed !== nextConfirmed) {
      logRecurringDuplicate("confirmed_priority", {
        key,
        existing,
        next: normalized,
        recurringItem,
      });
      byKey.set(key, nextConfirmed ? normalized : existing);
      continue;
    }

    if (!existingConfirmed && recurringId) {
      const currentSeriesDate = recurringItem?.nextRunDate ?? null;
      if (currentSeriesDate) {
        const existingMatchesSeries = existing.date.slice(0, 10) === currentSeriesDate;
        const nextMatchesSeries = normalized.date.slice(0, 10) === currentSeriesDate;
        if (existingMatchesSeries !== nextMatchesSeries) {
          logRecurringDuplicate("series_date_priority", {
            key,
            existing,
            next: normalized,
            recurringItem,
          });
          byKey.set(key, nextMatchesSeries ? normalized : existing);
          continue;
        }
      }
    }

    if (recurringTransactionTime(normalized) >= recurringTransactionTime(existing)) {
      logRecurringDuplicate("updated_at_priority", {
        key,
        existing,
        next: normalized,
        recurringItem,
      });
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

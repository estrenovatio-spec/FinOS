import { getCategoryLabel } from "@/lib/categories";
import { daysInclusiveUntilDate } from "@/lib/format-date";
import { advanceRecurringDate } from "@/lib/planning/analytics";
import { recurringDisplayName } from "@/lib/planning/recurring-skipped";
import { extractIncomeSourceIdFromTransactionNote } from "@/lib/transaction-note";
import { isPendingTransaction } from "@/lib/transaction-confirmed";
import type {
  BalanceForecast,
  DecisionCoreContext,
  ForecastEvent,
} from "@/lib/decision-core/types";
import type { RecurringTransaction, DebtItem } from "@/types/planning";
import type { Transaction } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDay(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.slice(0, 10);
}

function isoToDate(value: string): Date | null {
  const day = isoDay(value);
  if (!day) return null;
  const date = new Date(`${day}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(iso: string, days: number): string {
  const date = isoToDate(iso);
  if (!date) return iso;
  const next = new Date(date.getTime() + days * DAY_MS);
  const y = next.getFullYear();
  const mo = String(next.getMonth() + 1).padStart(2, "0");
  const d = String(next.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function sortEvents(left: ForecastEvent, right: ForecastEvent) {
  if (left.date !== right.date) return left.date.localeCompare(right.date);
  if (left.amount !== right.amount) return left.amount - right.amount;
  return left.id.localeCompare(right.id);
}

function normalizeRecurringMatchText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .trim();
}

function hasRecurringNameOverlap(
  transactionNote: string | null | undefined,
  recurringName: string,
): boolean {
  if (!recurringName) return false;
  const txWords = new Set(
    normalizeRecurringMatchText(transactionNote).split(" ").filter(Boolean),
  );
  if (txWords.size === 0) return false;

  return recurringName
    .split(" ")
    .filter((word) => word.length >= 3)
    .some((word) => txWords.has(word));
}

function hasMatchingActualTransaction(
  transactions: Transaction[],
  item: RecurringTransaction,
  runDate: string,
): boolean {
  const expectedAmount = Math.round(item.amount);
  const expectedOwner = item.owner ?? "me";
  const recurringName = normalizeRecurringMatchText(item.note);

  return transactions.some((tx) => {
    if (
      tx.date !== runDate ||
      tx.type !== item.type ||
      (tx.owner ?? "me") !== expectedOwner ||
      Math.round(tx.amount) !== expectedAmount
    ) {
      return false;
    }

    if (tx.recurringId != null) {
      return tx.recurringId === item.id;
    }

    if (tx.categoryId !== item.categoryId) {
      return false;
    }

    if (recurringName) {
      return hasRecurringNameOverlap(tx.note, recurringName);
    }

    return false;
  });
}

function buildIncomeEvents(ctx: DecisionCoreContext): ForecastEvent[] {
  return ctx.resolvedIncomeSources
    .filter(
      (
        source,
      ): source is typeof source & {
        status: Exclude<typeof source.status, "received">;
      } => source.status !== "received",
    )
    .map((source) => {
      const effectiveDate =
        source.status === "overdue_unconfirmed"
          ? ctx.today
          : source.expectedDate!.slice(0, 10);
      return {
        id: `income-source-${source.id}-${effectiveDate}`,
        title: source.label,
        amount: source.expectedAmount ?? 0,
        date: effectiveDate,
        balanceAfter: 0,
        source: "income_source" as const,
        incomeSourceId: source.id,
        plannedIncomeStatus: source.status,
        plannedDate: source.expectedDate?.slice(0, 10) ?? effectiveDate,
      };
    });
}

function buildConfirmedFutureTransactionEvents(ctx: DecisionCoreContext): ForecastEvent[] {
  return ctx.confirmedTransactions
    .filter((transaction) => transaction.date.slice(0, 10) > ctx.today)
    .map((transaction) => ({
      id: transaction.id,
      title:
        transaction.note.trim() ||
        getCategoryLabel(transaction.categoryId, ctx.categories, ctx.locale),
      amount: transaction.type === "income" ? transaction.amount : -transaction.amount,
      date: transaction.date.slice(0, 10),
      balanceAfter: 0,
      source: "confirmed_transaction" as const,
      incomeSourceId: extractIncomeSourceIdFromTransactionNote(transaction.note),
      plannedIncomeStatus: null,
      plannedDate: null,
    }));
}

function buildPendingTransactionEvents(ctx: DecisionCoreContext): ForecastEvent[] {
  return ctx.transactions
    .filter(isPendingTransaction)
    .filter((transaction) => transaction.date.slice(0, 10) >= ctx.today)
    .map((transaction) => ({
      id: transaction.id,
      title: getCategoryLabel(transaction.categoryId, ctx.categories, ctx.locale),
      amount: transaction.type === "income" ? transaction.amount : -transaction.amount,
      date: transaction.date.slice(0, 10),
      balanceAfter: 0,
      source: "pending_transaction" as const,
      incomeSourceId: null,
      plannedIncomeStatus: null,
      plannedDate: null,
    }));
}

function recurringEventTitle(ctx: DecisionCoreContext, item: RecurringTransaction) {
  const category = getCategoryLabel(item.categoryId, ctx.categories, ctx.locale);
  return recurringDisplayName(item, category);
}

function buildRecurringForecastEvents(
  ctx: DecisionCoreContext,
  horizonEndDate: string,
): ForecastEvent[] {
  const events: ForecastEvent[] = [];

  for (const item of ctx.recurringTransactions) {
    if (!item.enabled || !item.nextRunDate) continue;

    let runDate = item.nextRunDate.slice(0, 10);
    while (runDate <= horizonEndDate) {
      const skipped = (item.skippedDates ?? []).includes(runDate);
      const hasActual = hasMatchingActualTransaction(ctx.transactions, item, runDate);

      if (!skipped && !hasActual) {
        events.push({
          id: `recurring-${item.id}-${runDate}`,
          title: recurringEventTitle(ctx, item),
          amount: item.type === "income" ? item.amount : -item.amount,
          date: runDate,
          balanceAfter: 0,
          source: "recurring",
          incomeSourceId: null,
          plannedIncomeStatus: null,
          plannedDate: null,
        });
      }

      const nextRunDate = advanceRecurringDate(
        runDate,
        item.frequency,
        item.dayOfMonth,
        item.intervalMonths ?? 1,
      );
      if (nextRunDate === runDate) break;
      runDate = nextRunDate;
    }
  }

  return events;
}

function buildDebtEvents(ctx: DecisionCoreContext, horizonEndDate: string): ForecastEvent[] {
  return ctx.debts
    .filter((item) => item.nextPaymentDate && item.minPayment > 0)
    .filter((item) => item.nextPaymentDate!.slice(0, 10) >= ctx.today)
    .filter((item) => item.nextPaymentDate!.slice(0, 10) <= horizonEndDate)
    .map((item: DebtItem) => ({
      id: `debt-${item.id}-${item.nextPaymentDate!.slice(0, 10)}`,
      title: item.name.trim(),
      amount: -item.minPayment,
      date: item.nextPaymentDate!.slice(0, 10),
      balanceAfter: 0,
      source: "debt_payment" as const,
      incomeSourceId: null,
      plannedIncomeStatus: null,
      plannedDate: null,
    }));
}

export function buildForecastLine(ctx: DecisionCoreContext): BalanceForecast {
  const incomeEvents = buildIncomeEvents(ctx);
  const configuredNextIncomeDate = incomeEvents[0]?.date ?? null;
  const daysToIncome = configuredNextIncomeDate
    ? (daysInclusiveUntilDate(configuredNextIncomeDate, ctx.today) ?? 1)
    : 30;
  const horizonEndDate = addDays(ctx.today, Math.max(21, daysToIncome + 21));

  const events = [
    ...incomeEvents,
    ...buildConfirmedFutureTransactionEvents(ctx),
    ...buildPendingTransactionEvents(ctx),
    ...buildRecurringForecastEvents(ctx, horizonEndDate),
    ...buildDebtEvents(ctx, horizonEndDate),
  ]
    .filter((event) => event.date >= ctx.today)
    .sort(sortEvents);

  let balance = ctx.availableNow;
  let minBalance = balance;
  let minBalanceDate: string | null = null;
  let firstDeficitDate: string | null = balance < 0 ? ctx.today : null;

  const eventsWithBalance = events.map((event) => {
    balance += event.amount;

    if (balance < minBalance) {
      minBalance = balance;
      minBalanceDate = event.date;
    }

    if (!firstDeficitDate && balance < 0) {
      firstDeficitDate = event.date;
    }

    return {
      ...event,
      balanceAfter: balance,
    };
  });

  const nextIncomeDate =
    eventsWithBalance.find((event) => event.amount > 0)?.date ?? configuredNextIncomeDate;

  return {
    startBalance: ctx.availableNow,
    minBalance,
    minBalanceDate,
    firstDeficitDate,
    nextIncomeDate,
    horizonEndDate,
    events: eventsWithBalance,
  };
}

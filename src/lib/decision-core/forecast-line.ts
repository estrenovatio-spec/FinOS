import { getCategoryLabel } from "@/lib/categories";
import {
  getCurrentBudgetPeriod,
  isDateInBudgetPeriod,
  type BudgetPeriod,
} from "@/lib/budget-period";
import { buildForecastDays } from "@/lib/decision-core/forecast-days";
import { advanceRecurringDate } from "@/lib/planning/analytics";
import { recurringDisplayName } from "@/lib/planning/recurring-skipped";
import {
  extractIncomeOccurrenceDateFromTransactionNote,
  extractIncomeSourceIdFromTransactionNote,
} from "@/lib/transaction-note";
import { isPendingTransaction } from "@/lib/transaction-confirmed";
import type {
  BalanceForecast,
  DecisionCoreContext,
  ForecastEvent,
} from "@/lib/decision-core/types";
import type { RecurringTransaction, DebtItem } from "@/types/planning";
import type { Transaction } from "@/types";

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

function addMonths(iso: string, months: 1 | 3 | 6): string {
  const date = isoToDate(iso);
  if (!date) return iso;
  const startDay = date.getDate();
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  if (next.getDate() !== startDay) {
    next.setDate(0);
  }
  const y = next.getFullYear();
  const mo = String(next.getMonth() + 1).padStart(2, "0");
  const d = String(next.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function addDays(iso: string, days: number): string {
  const date = isoToDate(iso);
  if (!date) return iso;
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function sortEvents(left: ForecastEvent, right: ForecastEvent) {
  if (left.date !== right.date) return left.date.localeCompare(right.date);
  if (left.amount !== right.amount) return left.amount - right.amount;
  return left.id.localeCompare(right.id);
}

function hasMatchingActualTransaction(
  transactions: Transaction[],
  item: RecurringTransaction,
  runDate: string,
): boolean {
  return transactions.some((tx) => {
    return tx.date.slice(0, 10) === runDate && tx.recurringId === item.id;
  });
}

function isWithinRecurringEndDate(item: RecurringTransaction, runDate: string): boolean {
  return !item.endDate || runDate <= item.endDate;
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
        id: `income-source-${source.occurrenceId}`,
        title: source.label,
        amount: source.expectedAmount ?? 0,
        date: effectiveDate,
        balanceAfter: 0,
        source: "income_source" as const,
        incomeSourceId: source.id,
        incomeOccurrenceId: source.occurrenceId,
        incomeOccurrenceDate: source.occurrenceDate,
        plannedIncomeStatus: source.status,
        plannedDate: source.occurrenceDate,
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
      incomeOccurrenceId:
        extractIncomeSourceIdFromTransactionNote(transaction.note) &&
        extractIncomeOccurrenceDateFromTransactionNote(transaction.note)
          ? `income-${extractIncomeSourceIdFromTransactionNote(transaction.note)}-${extractIncomeOccurrenceDateFromTransactionNote(transaction.note)}`
          : null,
      incomeOccurrenceDate: extractIncomeOccurrenceDateFromTransactionNote(transaction.note),
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
      incomeOccurrenceId: null,
      incomeOccurrenceDate: null,
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
    while (runDate <= horizonEndDate && isWithinRecurringEndDate(item, runDate)) {
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
          recurringId: item.id,
          incomeSourceId: null,
          incomeOccurrenceId: null,
          incomeOccurrenceDate: null,
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

function buildFutureBudgetPeriods(
  ctx: DecisionCoreContext,
  horizonEndDate: string,
): BudgetPeriod[] {
  const periods: BudgetPeriod[] = [];
  let anchor = new Date(`${ctx.today}T12:00:00`);

  while (true) {
    const period = getCurrentBudgetPeriod(ctx.budgetMonthStartDay, anchor);
    if (period.from > horizonEndDate) break;
    periods.push(period);
    anchor = new Date(`${addDays(period.to, 1)}T12:00:00`);
  }

  return periods;
}

function enumeratePeriodDays(period: BudgetPeriod): string[] {
  const days: string[] = [];
  let cursor = period.from;
  while (cursor <= period.to) {
    days.push(cursor);
    if (cursor === period.to) break;
    cursor = addDays(cursor, 1);
  }
  return days;
}

function buildDistributedAmounts(days: string[], totalAmount: number): Array<{
  date: string;
  amount: number;
}> {
  if (days.length === 0 || totalAmount <= 0) return [];
  const baseAmount = Math.floor(totalAmount / days.length);
  let assigned = 0;

  return days.map((date, index) => {
    const isLastDay = index === days.length - 1;
    const amount = isLastDay ? totalAmount - assigned : baseAmount;
    assigned += amount;
    return { date, amount };
  });
}

function intersectsRange(
  day: string,
  from: string,
  to: string,
): boolean {
  return day >= from && day <= to;
}

function recurringOccurrencesInPeriod(
  item: RecurringTransaction,
  period: BudgetPeriod,
): string[] {
  const dates: string[] = [];
  if (!item.enabled || !item.nextRunDate) return dates;

  let runDate = item.nextRunDate.slice(0, 10);
  while (runDate <= period.to && isWithinRecurringEndDate(item, runDate)) {
    if (runDate >= period.from && !(item.skippedDates ?? []).includes(runDate)) {
      dates.push(runDate);
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

  return dates;
}

function spentForCategoryInPeriod(
  ctx: DecisionCoreContext,
  categoryId: string,
  period: BudgetPeriod,
): number {
  return ctx.transactions
    .filter(
      (transaction) =>
        transaction.type === "expense" &&
        transaction.categoryId === categoryId &&
        isDateInBudgetPeriod(transaction.date.slice(0, 10), period),
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

function requiredRecurringReservedForCategoryInPeriod(
  ctx: DecisionCoreContext,
  categoryId: string,
  period: BudgetPeriod,
): number {
  const requiredRecurringIds = new Set(ctx.moneySetup.requiredRecurringIds);

  return ctx.recurringTransactions
    .filter(
      (item) =>
        requiredRecurringIds.has(item.id) &&
        item.enabled &&
        item.type === "expense" &&
        item.categoryId === categoryId,
    )
    .reduce((sum, item) => {
      return (
        sum +
        recurringOccurrencesInPeriod(item, period).reduce((occurrenceSum, runDate) => {
          const materialized = hasMatchingActualTransaction(ctx.transactions, item, runDate);
          return materialized ? occurrenceSum : occurrenceSum + item.amount;
        }, 0)
      );
    }, 0);
}

function buildFutureEssentialBudgetEvents(
  ctx: DecisionCoreContext,
  horizonEndDate: string,
): ForecastEvent[] {
  const essentialIds = [...new Set(ctx.moneySetup.essentialCategoryIds)];
  if (essentialIds.length === 0) return [];

  const budgetsByCategory = new Map(
    ctx.categoryBudgets.map((item) => [item.categoryId, item] as const),
  );
  const periods = buildFutureBudgetPeriods(ctx, horizonEndDate);
  const dailyEvents = new Map<
    string,
    {
      amount: number;
      items: Map<string, { title: string; amount: number }>;
      budgetPeriodFrom: string;
      budgetPeriodTo: string;
    }
  >();

  for (const period of periods) {
    const allocationPeriodDays = enumeratePeriodDays(
      period.from <= ctx.today && period.to >= ctx.today
        ? { ...period, from: ctx.today }
        : period,
    );
    if (allocationPeriodDays.length === 0) continue;

    const visibleFrom = period.from <= ctx.today && period.to >= ctx.today ? ctx.today : period.from;
    const visibleTo = period.to <= horizonEndDate ? period.to : horizonEndDate;
    if (visibleFrom > visibleTo) continue;

    for (const categoryId of essentialIds) {
      const budget = budgetsByCategory.get(categoryId);
      if (!budget || !Number.isFinite(budget.monthlyLimit) || budget.monthlyLimit <= 0) {
        continue;
      }

      const spent = spentForCategoryInPeriod(ctx, categoryId, period);
      const recurringReserved = requiredRecurringReservedForCategoryInPeriod(
        ctx,
        categoryId,
        period,
      );
      const remainingAmount = Math.max(0, budget.monthlyLimit - spent - recurringReserved);
      if (remainingAmount <= 0) continue;

      const distributedAmounts = buildDistributedAmounts(allocationPeriodDays, remainingAmount);
      const categoryTitle = getCategoryLabel(categoryId, ctx.categories, ctx.locale);

      for (const allocation of distributedAmounts) {
        if (!intersectsRange(allocation.date, visibleFrom, visibleTo) || allocation.amount <= 0) {
          continue;
        }

        const existingDay = dailyEvents.get(allocation.date) ?? {
          amount: 0,
          items: new Map<string, { title: string; amount: number }>(),
          budgetPeriodFrom: period.from,
          budgetPeriodTo: period.to,
        };
        existingDay.amount += allocation.amount;

        const existingItem = existingDay.items.get(categoryId);
        existingDay.items.set(categoryId, {
          title: categoryTitle,
          amount: (existingItem?.amount ?? 0) + allocation.amount,
        });
        dailyEvents.set(allocation.date, existingDay);
      }
    }
  }

  return [...dailyEvents.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, entry]) => ({
        id: `essential-budget-${date}`,
        title:
          ctx.locale === "ru"
            ? "Плановые повседневные траты"
            : "Planned everyday spending",
        amount: -entry.amount,
        date,
        balanceAfter: 0,
        source: "essential_budget" as const,
        recurringId: null,
        incomeSourceId: null,
        incomeOccurrenceId: null,
        incomeOccurrenceDate: null,
      plannedIncomeStatus: null,
      plannedDate: null,
      budgetPeriodFrom: entry.budgetPeriodFrom,
      budgetPeriodTo: entry.budgetPeriodTo,
      budgetReserveItems: [...entry.items.entries()].map(([categoryId, item]) => ({
        categoryId,
        title: item.title,
        amount: item.amount,
      })),
    }));
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
      recurringId: null,
      incomeSourceId: null,
      incomeOccurrenceId: null,
      incomeOccurrenceDate: null,
      plannedIncomeStatus: null,
      plannedDate: null,
    }));
}

export function buildForecastLine(ctx: DecisionCoreContext): BalanceForecast {
  const incomeEvents = buildIncomeEvents(ctx);
  const configuredNextIncomeDate = incomeEvents[0]?.date ?? null;
  const horizonEndDate = addMonths(ctx.today, ctx.forecastHorizonMonths);

  const events = [
    ...incomeEvents,
    ...buildConfirmedFutureTransactionEvents(ctx),
    ...buildPendingTransactionEvents(ctx),
    ...buildRecurringForecastEvents(ctx, horizonEndDate),
    ...buildDebtEvents(ctx, horizonEndDate),
    ...buildFutureEssentialBudgetEvents(ctx, horizonEndDate),
  ]
    .filter((event) => event.date >= ctx.today && event.date <= horizonEndDate)
    .sort(sortEvents);

  let balance = ctx.availableNow;

  const eventsWithBalance = events.map((event) => {
    balance += event.amount;

    return {
      ...event,
      balanceAfter: balance,
    };
  });

  const days = buildForecastDays(ctx.availableNow, eventsWithBalance);
  let minBalance = ctx.availableNow;
  let minBalanceDate: string | null = null;
  let firstDeficitDate: string | null = ctx.availableNow < 0 ? ctx.today : null;

  for (const day of days) {
    if (day.endBalance < minBalance) {
      minBalance = day.endBalance;
      minBalanceDate = day.date;
    }

    if (!firstDeficitDate && day.endBalance < 0) {
      firstDeficitDate = day.date;
    }
  }

  const nextIncomeDate =
    eventsWithBalance.find((event) => event.amount > 0)?.date ?? configuredNextIncomeDate;

  return {
    startBalance: ctx.availableNow,
    minBalance,
    minBalanceDate,
    firstDeficitDate,
    nextIncomeDate,
    horizonEndDate,
    horizonMonths: ctx.forecastHorizonMonths,
    events: eventsWithBalance,
    days,
  };
}

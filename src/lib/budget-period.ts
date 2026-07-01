import { formatMonthYearLong, formatTransactionDate } from "@/lib/format-date";
import type { Locale } from "@/types";

export interface BudgetPeriod {
  from: string;
  to: string;
  monthStartDay: number;
}

export function clampMonthStartDay(day: number): number {
  if (!Number.isFinite(day)) return 1;
  return Math.min(28, Math.max(1, Math.round(day)));
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Текущий бюджетный период: с monthStartDay прошлого/этого месяца до дня перед следующим стартом */
export function getCurrentBudgetPeriod(monthStartDay: number, ref = new Date()): BudgetPeriod {
  const startDay = clampMonthStartDay(monthStartDay);
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const d = ref.getDate();

  if (startDay === 1) {
    const periodStart = new Date(y, m, 1);
    const periodEnd = new Date(y, m + 1, 0);
    return { from: toIsoDate(periodStart), to: toIsoDate(periodEnd), monthStartDay: 1 };
  }

  const periodStart =
    d >= startDay ? new Date(y, m, startDay) : new Date(y, m - 1, startDay);

  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  periodEnd.setDate(periodEnd.getDate() - 1);

  return { from: toIsoDate(periodStart), to: toIsoDate(periodEnd), monthStartDay: startDay };
}

/** Предыдущий отчётный месяц (бюджетный период до текущего) */
export function getPreviousBudgetPeriod(monthStartDay: number, ref = new Date()): BudgetPeriod {
  const current = getCurrentBudgetPeriod(monthStartDay, ref);
  const anchor = new Date(`${current.from}T12:00:00`);
  anchor.setDate(anchor.getDate() - 1);
  return getCurrentBudgetPeriod(monthStartDay, anchor);
}

export function isDateInBudgetPeriod(
  dateIso: string,
  period: BudgetPeriod,
): boolean {
  return dateIso >= period.from && dateIso <= period.to;
}

export function formatBudgetPeriodLabel(period: BudgetPeriod, locale: Locale): string {
  if (period.monthStartDay === 1) {
    return formatMonthYearLong(period.from, locale);
  }
  return `${formatTransactionDate(period.from, locale)} — ${formatTransactionDate(period.to, locale)}`;
}

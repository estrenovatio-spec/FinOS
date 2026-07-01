import { roundMoneyUp } from "@/lib/format-money";
import { getCurrentBudgetPeriod, isDateInBudgetPeriod } from "@/lib/budget-period";
import type { Transaction } from "@/types";
import type { SavingsGoal } from "@/types/planning";
import { EMERGENCY_GOAL_ID } from "@/types/planning";

/** @deprecated use getCurrentBudgetPeriod */
export function currentMonthPrefix(): string {
  return new Date().toISOString().slice(0, 7);
}

export function monthSpentByCategory(
  transactions: Transaction[],
  categoryId: string,
  monthStartDay = 1,
): number {
  const period = getCurrentBudgetPeriod(monthStartDay);
  return transactions
    .filter(
      (tx) =>
        tx.type === "expense" &&
        tx.categoryId === categoryId &&
        isDateInBudgetPeriod(tx.date, period),
    )
    .reduce((s, tx) => s + tx.amount, 0);
}

/** Средний месячный расход за последние 90 дней */
export function avgMonthlyExpenses(transactions: Transaction[], days = 90): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const total = transactions
    .filter((tx) => tx.type === "expense" && new Date(tx.date) >= cutoff)
    .reduce((s, tx) => s + tx.amount, 0);
  return roundMoneyUp(total / Math.max(1, days / 30));
}

export function emergencyTargetAmount(
  transactions: Transaction[],
  months: number,
): number {
  return roundMoneyUp(avgMonthlyExpenses(transactions) * months);
}

export function resolveGoalTarget(goal: SavingsGoal, transactions: Transaction[]): number {
  if (goal.kind === "emergency" && goal.emergencyMonths) {
    return emergencyTargetAmount(transactions, goal.emergencyMonths);
  }
  return goal.targetAmount;
}

export function goalProgressPercent(goal: SavingsGoal, transactions: Transaction[]): number {
  const target = resolveGoalTarget(goal, transactions);
  if (target <= 0) return 0;
  return Math.min(100, Math.round((goal.savedAmount / target) * 100));
}

/** Сколько полных календарных месяцев осталось до срока (минимум 1). */
export function monthsUntilDeadline(deadline: string, fromDate: Date = new Date()): number {
  const end = new Date(`${deadline}T12:00:00`);
  const from = new Date(
    fromDate.getFullYear(),
    fromDate.getMonth(),
    fromDate.getDate(),
    12,
    0,
    0,
  );
  if (Number.isNaN(end.getTime())) return 1;
  if (end.getTime() <= from.getTime()) return 1;

  let months =
    (end.getFullYear() - from.getFullYear()) * 12 + (end.getMonth() - from.getMonth());
  if (end.getDate() < from.getDate()) months -= 1;
  return Math.max(1, months);
}

/** Для сравнения «на счёте» vs «с инвестированием» — в интерфейсе процент не показываем. */
const GROWTH_ANNUAL_RATE = 0.17;

export interface GoalMonthlyPlans {
  months: number;
  /** Копить в месяц, если деньги просто лежат на счёте */
  onAccount: number;
  /** Копить в месяц, если откладывать с ростом (аннуитет) */
  ifInvested: number;
}

function computeGrowthMonthlyPayment(
  targetAmount: number,
  savedAmount: number,
  months: number,
): number | null {
  const r = GROWTH_ANNUAL_RATE / 12;
  const target = roundMoneyUp(targetAmount);
  const saved = roundMoneyUp(savedAmount);
  const n = Math.max(1, months);
  const growth = Math.pow(1 + r, n);
  const fvSaved = saved * growth;
  const gap = target - fvSaved;
  if (gap <= 0) return null;
  if (r <= 0) return roundMoneyUp(gap / n);
  const payment = (gap * r) / (growth - 1);
  return roundMoneyUp(Math.max(payment, 0));
}

/** Два плана в месяц: без роста и с инвестированием. */
export function resolveGoalMonthlyPlans(
  targetAmount: number,
  savedAmount: number,
  deadline: string | null,
  fromDate?: Date,
): GoalMonthlyPlans | null {
  if (!deadline || targetAmount <= 0) return null;
  const months = monthsUntilDeadline(deadline, fromDate);
  const remaining = Math.max(0, roundMoneyUp(targetAmount) - roundMoneyUp(savedAmount));
  const onAccount =
    remaining <= 0 ? null : roundMoneyUp(remaining / months);
  const ifInvested = computeGrowthMonthlyPayment(targetAmount, savedAmount, months);
  if (onAccount == null && ifInvested == null) return null;
  return {
    months,
    onAccount: onAccount ?? ifInvested!,
    ifInvested: ifInvested ?? onAccount!,
  };
}

/** Основной план для хранения в БД — «на счёте». */
export function computeGoalMonthlyContribution(
  targetAmount: number,
  savedAmount: number,
  deadline: string | null,
  fromDate?: Date,
): number | null {
  return resolveGoalMonthlyPlans(targetAmount, savedAmount, deadline, fromDate)?.onAccount ?? null;
}

export function resolveGoalMonthlyContribution(goal: SavingsGoal): number | null {
  return computeGoalMonthlyContribution(goal.targetAmount, goal.savedAmount, goal.deadline);
}

export function applyGoalMonthlyToGoal(goal: SavingsGoal): SavingsGoal {
  return {
    ...goal,
    monthlyContribution: computeGoalMonthlyContribution(
      goal.targetAmount,
      goal.savedAmount,
      goal.deadline,
    ),
  };
}

export function budgetUsagePercent(spent: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.round((spent / limit) * 100);
}

export function advanceRecurringDate(
  dateIso: string,
  frequency: "weekly" | "monthly" | "yearly",
  dayOfMonth: number | null,
  intervalMonths = 1,
): string {
  const d = new Date(`${dateIso}T12:00:00`);
  if (frequency === "weekly") {
    d.setDate(d.getDate() + 7);
  } else if (frequency === "monthly") {
    const targetMonth = d.getMonth() + Math.max(1, Math.min(60, Math.round(intervalMonths)));
    const targetDay = dayOfMonth ?? d.getDate();
    d.setDate(1);
    d.setMonth(targetMonth);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(targetDay, lastDay));
  } else {
    d.setFullYear(d.getFullYear() + 1);
  }
  return d.toISOString().slice(0, 10);
}

export function defaultEmergencyGoal(emergencyMonths = 6): SavingsGoal {
  return {
    id: EMERGENCY_GOAL_ID,
    name: "Подушка безопасности",
    targetAmount: 0,
    savedAmount: 0,
    deadline: null,
    monthlyContribution: null,
    kind: "emergency",
    emergencyMonths,
  };
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

import type { Transaction } from "@/types";

const envMinDays = Number(process.env.NEXT_PUBLIC_AI_RECOMMENDATIONS_MIN_DAYS);
export const AI_RECOMMENDATIONS_MIN_DAYS =
  Number.isFinite(envMinDays) && envMinDays > 0 ? envMinDays : 30;

export interface BudgetSummary {
  daysTracked: number;
  transactionCount: number;
  totalIncome: number;
  totalExpense: number;
  periodNet?: number;
  goalAllocated?: number;
  balance: number;
  expenseByCategory: { category: string; amount: number; sharePercent: number }[];
  incomeByCategory: { category: string; amount: number }[];
  monthlyExpenses: { month: string; amount: number }[];
  firstDate: string | null;
  lastDate: string | null;
  currency: string;
}

function parseDate(date: string): Date {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export function getTrackingStartDate(
  trackingStartedAt: string | null,
  transactions: Transaction[],
): Date | null {
  if (trackingStartedAt) return new Date(trackingStartedAt);
  if (transactions.length === 0) return null;
  const dates = transactions.map((tx) => parseDate(tx.date).getTime());
  return new Date(Math.min(...dates));
}

export function getDaysTracked(
  trackingStartedAt: string | null,
  transactions: Transaction[],
): number {
  const start = getTrackingStartDate(trackingStartedAt, transactions);
  if (!start) return 0;
  const diff = Date.now() - start.getTime();
  return Math.max(1, Math.floor(diff / (24 * 60 * 60 * 1000)) + 1);
}

export function buildBudgetSummary(
  transactions: Transaction[],
  trackingStartedAt: string | null,
  resolveCategoryLabel: (categoryId: string) => string = (id) => id,
): BudgetSummary {
  const expenses = transactions.filter((tx) => tx.type === "expense");
  const incomes = transactions.filter((tx) => tx.type === "income");
  const totalExpense = expenses.reduce((s, tx) => s + tx.amount, 0);
  const totalIncome = incomes.reduce((s, tx) => s + tx.amount, 0);
  const toGoals = incomes.reduce((s, tx) => {
    const g = tx.goalAmount;
    return s + (g != null && g > 0 ? g : 0);
  }, 0);

  const expenseMap = new Map<string, number>();
  expenses.forEach((tx) => {
    const label = resolveCategoryLabel(tx.categoryId);
    expenseMap.set(label, (expenseMap.get(label) ?? 0) + tx.amount);
  });

  const expenseByCategory = Array.from(expenseMap.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      sharePercent: totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const incomeMap = new Map<string, number>();
  incomes.forEach((tx) => {
    const label = resolveCategoryLabel(tx.categoryId);
    incomeMap.set(label, (incomeMap.get(label) ?? 0) + tx.amount);
  });

  const incomeByCategory = Array.from(incomeMap.entries()).map(([category, amount]) => ({
    category,
    amount,
  }));

  const monthMap = new Map<string, number>();
  expenses.forEach((tx) => {
    const d = parseDate(tx.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthMap.set(key, (monthMap.get(key) ?? 0) + tx.amount);
  });

  const monthlyExpenses = Array.from(monthMap.entries())
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const dates = transactions.map((tx) => parseDate(tx.date).getTime());
  const firstDate =
    dates.length > 0 ? new Date(Math.min(...dates)).toISOString().slice(0, 10) : null;
  const lastDate =
    dates.length > 0 ? new Date(Math.max(...dates)).toISOString().slice(0, 10) : null;

  const currency = "RUB";

  return {
    daysTracked: getDaysTracked(trackingStartedAt, transactions),
    transactionCount: transactions.length,
    totalIncome,
    totalExpense,
    periodNet: totalIncome - totalExpense,
    goalAllocated: toGoals,
    balance: totalIncome - toGoals - totalExpense,
    expenseByCategory,
    incomeByCategory,
    monthlyExpenses,
    firstDate,
    lastDate,
    currency,
  };
}

export function isEligibleForAiRecommendations(
  trackingStartedAt: string | null,
  transactions: Transaction[],
): boolean {
  return getDaysTracked(trackingStartedAt, transactions) >= AI_RECOMMENDATIONS_MIN_DAYS;
}

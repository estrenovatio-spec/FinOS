import {
  daysInclusiveUntilDate,
  getLocalTodayIsoDate,
} from "@/lib/format-date";
import { resolveMoneySetupIncomeSources, type MoneySetup } from "@/lib/money-setup";
import type { CategoryDefinition, Transaction } from "@/types";
import type { CategoryBudget, RecurringTransaction } from "@/types/planning";

export type SafeSpendingStatus =
  | "ready"
  | "missing_income"
  | "unconfirmed_income"
  | "missing_balance"
  | "missing_required_expenses"
  | "missing_essential_budgets"
  | "invalid_period"
  | "not_enough_data";

export type SafeSpendingResult = {
  status: SafeSpendingStatus;
  safeToday: number | null;
  daysUntilIncome: number | null;
  nextIncomeDate: string | null;
  expectedIncomeAmount: number | null;
  requiredFixedUntilIncome: number;
  essentialReserveUntilIncome: number;
  essentialReserveBreakdown: {
    categoryId: string;
    monthlyLimit: number;
    reserveUntilIncome: number;
    dailyReserve: number;
  }[];
  availableForDailySpending: number | null;
  reasons: string[];
  debug?: Record<string, unknown>;
};

export type CalculateSafeSpendingInput = {
  availableNow: number;
  moneySetup: MoneySetup;
  confirmedTransactions: Transaction[];
  recurringTransactions: RecurringTransaction[];
  categoryBudgets: CategoryBudget[];
  categories: CategoryDefinition[];
  today?: string;
};

function startOfDayMs(iso: string): number | null {
  if (typeof iso !== "string" || !iso.trim()) return null;
  const ms = new Date(`${iso.slice(0, 10)}T12:00:00`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isIsoWithinInclusive(date: string, from: string, to: string): boolean {
  const day = date.slice(0, 10);
  return day >= from.slice(0, 10) && day <= to.slice(0, 10);
}

function pickNearestIncome(
  moneySetup: MoneySetup,
  confirmedTransactions: Transaction[],
  today: string,
  reasons: string[],
): {
  nextIncomeDate: string | null;
  expectedIncomeAmount: number | null;
  hasOverdueUnconfirmed: boolean;
  debug: Record<string, unknown>;
} {
  const resolved = resolveMoneySetupIncomeSources({
    moneySetup,
    confirmedTransactions,
    today,
  });
  if (resolved.length > 0) {
    const dated = resolved.filter(
      (source) => source.status === "scheduled" || source.status === "due_today",
    );
    const overdue = resolved.filter((source) => source.status === "overdue_unconfirmed");

    if (dated.length === 0) {
      if (overdue.length > 0) {
        reasons.push("income_sources_present_but_unconfirmed_after_due_date");
      } else {
        reasons.push("income_sources_present_but_no_future_income_date");
      }
      const latestOverdue = [...overdue].sort((left, right) =>
        (right.expectedDate ?? "").localeCompare(left.expectedDate ?? ""),
      )[0];
      return {
        nextIncomeDate: latestOverdue?.expectedDate ?? null,
        expectedIncomeAmount: latestOverdue?.expectedAmount ?? null,
        hasOverdueUnconfirmed: overdue.length > 0,
        debug: {
          incomeMode: "sources",
          incomeSourcesCount: resolved.length,
          usableIncomeSources: 0,
          overdueIncomeSourceIds: overdue.map((source) => source.id),
        },
      };
    }

    dated.sort((a, b) => a.expectedDate!.localeCompare(b.expectedDate!));
    const nearestDate = dated[0]!.expectedDate!;
    const sameDay = dated.filter(
      (source) => source.expectedDate === nearestDate,
    );
    const expectedIncomeAmount = sameDay.reduce(
      (sum, source) => sum + (source.expectedAmount ?? 0),
      0,
    );

    return {
      nextIncomeDate: nearestDate,
      expectedIncomeAmount,
      hasOverdueUnconfirmed: overdue.length > 0,
      debug: {
        incomeMode: "sources",
        incomeSourcesCount: resolved.length,
        usableIncomeSources: dated.length,
        matchedIncomeSourceIds: sameDay.map((source) => source.id),
        overdueIncomeSourceIds: overdue.map((source) => source.id),
      },
    };
  }

  return {
    nextIncomeDate: moneySetup.nextIncomeDate,
    expectedIncomeAmount: moneySetup.expectedIncomeAmount,
    hasOverdueUnconfirmed:
      Boolean(moneySetup.nextIncomeDate) &&
      moneySetup.nextIncomeDate!.slice(0, 10) <= today,
    debug: {
      incomeMode: "legacy",
      incomeSourcesCount: 0,
    },
  };
}

function buildResult(
  base: Omit<SafeSpendingResult, "status">,
  status: SafeSpendingStatus,
): SafeSpendingResult {
  return {
    ...base,
    status,
  };
}

export function calculateSafeSpending(
  input: CalculateSafeSpendingInput,
): SafeSpendingResult {
  const reasons: string[] = [];
  const today = (input.today ?? getLocalTodayIsoDate()).slice(0, 10);
  const debug: Record<string, unknown> = {
    today,
    availableNow: input.availableNow,
    recurringExpenseMode: "all_active_expenses",
    essentialCategoryIds: input.moneySetup.essentialCategoryIds,
  };

  const income = pickNearestIncome(
    input.moneySetup,
    input.confirmedTransactions,
    today,
    reasons,
  );
  const nextIncomeDate = income.nextIncomeDate;
  const expectedIncomeAmount = income.expectedIncomeAmount;
  Object.assign(debug, income.debug);

  const base: Omit<SafeSpendingResult, "status"> = {
    safeToday: null,
    daysUntilIncome: null,
    nextIncomeDate,
    expectedIncomeAmount,
    requiredFixedUntilIncome: 0,
    essentialReserveUntilIncome: 0,
    essentialReserveBreakdown: [],
    availableForDailySpending: null,
    reasons,
    debug,
  };

  if (!nextIncomeDate) {
    reasons.push("missing_next_income_date");
    return buildResult(
      base,
      income.hasOverdueUnconfirmed ? "unconfirmed_income" : "missing_income",
    );
  }

  const todayMs = startOfDayMs(today);
  const nextIncomeMs = startOfDayMs(nextIncomeDate);
  if (todayMs == null || nextIncomeMs == null) {
    reasons.push("invalid_income_period_date");
    return buildResult(base, "invalid_period");
  }
  if (nextIncomeDate < today) {
    reasons.push("next_income_date_must_be_after_today");
    return buildResult(base, "unconfirmed_income");
  }

  const daysUntilIncome =
    nextIncomeDate === today ? 1 : daysInclusiveUntilDate(nextIncomeDate, today);
  if (daysUntilIncome == null) {
    reasons.push("invalid_income_period_date");
    return buildResult(base, "invalid_period");
  }
  base.daysUntilIncome = daysUntilIncome;
  debug.daysUntilIncome = daysUntilIncome;

  if (!Number.isFinite(input.availableNow) || input.availableNow <= 0) {
    reasons.push("available_now_must_be_positive");
    return buildResult(base, "missing_balance");
  }

  let requiredFixedUntilIncome = 0;
  for (const item of input.recurringTransactions) {
    if (!item.enabled) continue;
    if (item.type !== "expense") continue;
    if (!item.nextRunDate || startOfDayMs(item.nextRunDate) == null) {
      reasons.push(`recurring_expense_missing_next_run_date:${item.id}`);
      continue;
    }
    if (!isIsoWithinInclusive(item.nextRunDate, today, nextIncomeDate)) continue;
    requiredFixedUntilIncome += item.amount;
  }

  base.requiredFixedUntilIncome = requiredFixedUntilIncome;
  debug.requiredFixedUntilIncome = requiredFixedUntilIncome;

  const essentialIds = [...new Set(input.moneySetup.essentialCategoryIds)];
  if (essentialIds.length > 0) {
    const budgetsByCategory = new Map(
      input.categoryBudgets.map((item) => [item.categoryId, item] as const),
    );
    const categoryIds = new Set(
      input.categories.map((category) => category.id),
    );
    let missingEssentialBudget = false;
    let essentialReserveUntilIncome = 0;
    const essentialReserveBreakdown: SafeSpendingResult["essentialReserveBreakdown"] =
      [];

    for (const categoryId of essentialIds) {
      if (!categoryIds.has(categoryId)) {
        reasons.push(`essential_category_missing:${categoryId}`);
      }
      const budget = budgetsByCategory.get(categoryId);
      if (!budget) {
        reasons.push(`missing_budget_for_essential_category:${categoryId}`);
        missingEssentialBudget = true;
        continue;
      }
      if (!Number.isFinite(budget.monthlyLimit) || budget.monthlyLimit <= 0) {
        reasons.push(`invalid_budget_for_essential_category:${categoryId}`);
        missingEssentialBudget = true;
        continue;
      }
      const dailyReserve = budget.monthlyLimit / 30;
      const reserveUntilIncome = dailyReserve * daysUntilIncome;
      essentialReserveUntilIncome += reserveUntilIncome;
      essentialReserveBreakdown.push({
        categoryId,
        monthlyLimit: budget.monthlyLimit,
        reserveUntilIncome,
        dailyReserve,
      });
    }

    base.essentialReserveUntilIncome = essentialReserveUntilIncome;
    base.essentialReserveBreakdown = essentialReserveBreakdown.sort(
      (left, right) => right.reserveUntilIncome - left.reserveUntilIncome,
    );
    debug.essentialReserveUntilIncome = essentialReserveUntilIncome;

    if (missingEssentialBudget) {
      return buildResult(base, "missing_essential_budgets");
    }
  } else {
    base.essentialReserveUntilIncome = 0;
    base.essentialReserveBreakdown = [];
    debug.essentialReserveUntilIncome = 0;
  }

  const availableForDailySpending =
    input.availableNow -
    requiredFixedUntilIncome -
    base.essentialReserveUntilIncome;
  const safeToday = Math.max(
    0,
    Math.floor(availableForDailySpending / daysUntilIncome),
  );

  base.availableForDailySpending = availableForDailySpending;
  base.safeToday = safeToday;
  debug.availableForDailySpending = availableForDailySpending;
  debug.safeToday = safeToday;

  if (!Number.isFinite(availableForDailySpending)) {
    reasons.push("available_for_daily_spending_invalid");
    return buildResult(base, "not_enough_data");
  }

  return buildResult(base, "ready");
}

import { getCurrentBudgetPeriod, isDateInBudgetPeriod } from "@/lib/budget-period";
import type { DecisionCoreContext } from "@/lib/decision-core/types";

export type EssentialBudgetReserveItem = {
  categoryId: string;
  monthlyLimit: number;
  spent: number;
  remaining: number;
};

export type EssentialBudgetReserve = {
  totalRemaining: number;
  periodFrom: string;
  periodTo: string;
  items: EssentialBudgetReserveItem[];
};

export function buildEssentialBudgetReserve(
  ctx: Pick<
    DecisionCoreContext,
    "today" | "budgetMonthStartDay" | "moneySetup" | "categoryBudgets" | "confirmedTransactions"
  >,
): EssentialBudgetReserve {
  const period = getCurrentBudgetPeriod(
    ctx.budgetMonthStartDay,
    new Date(`${ctx.today}T12:00:00`),
  );
  const essentialIds = [...new Set(ctx.moneySetup.essentialCategoryIds)];
  const budgetsByCategory = new Map(
    ctx.categoryBudgets.map((item) => [item.categoryId, item] as const),
  );

  const items = essentialIds
    .map((categoryId) => {
      const budget = budgetsByCategory.get(categoryId);
      if (!budget || !Number.isFinite(budget.monthlyLimit) || budget.monthlyLimit <= 0) {
        return null;
      }

      const spent = ctx.confirmedTransactions
        .filter(
          (transaction) =>
            transaction.type === "expense" &&
            transaction.categoryId === categoryId &&
            isDateInBudgetPeriod(transaction.date.slice(0, 10), period),
        )
        .reduce((sum, transaction) => sum + transaction.amount, 0);

      const remaining = Math.max(0, budget.monthlyLimit - spent);

      return {
        categoryId,
        monthlyLimit: budget.monthlyLimit,
        spent,
        remaining,
      };
    })
    .filter((item): item is EssentialBudgetReserveItem => item != null)
    .sort((left, right) => right.remaining - left.remaining);

  return {
    totalRemaining: items.reduce((sum, item) => sum + item.remaining, 0),
    periodFrom: period.from,
    periodTo: period.to,
    items,
  };
}

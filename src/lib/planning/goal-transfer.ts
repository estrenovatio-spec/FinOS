import { normalizeAppCurrency } from "@/lib/app-currency";
import { roundMoneyUp } from "@/lib/format-money";
import type { ParsedTransaction, BudgetOwner } from "@/types";
import type { SavingsGoal } from "@/types/planning";

/** Категория расхода «перевод в копилку» — уменьшает баланс. */
export const GOAL_JAR_CATEGORY_ID = "goal_jar";

export function buildGoalDepositTransaction(
  goal: SavingsGoal,
  amount: number,
  owner: BudgetOwner = "me",
  date = new Date().toISOString().slice(0, 10),
): ParsedTransaction {
  const amt = roundMoneyUp(amount);
  return {
    amount: amt,
    type: "expense",
    categoryId: GOAL_JAR_CATEGORY_ID,
    currency: normalizeAppCurrency(),
    note: `→ ${goal.name}`,
    date,
    owner,
    goalId: goal.id,
    goalAmount: amt,
  };
}

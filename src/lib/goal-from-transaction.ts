import { roundMoneyUp } from "@/lib/format-money";
import { applyGoalMonthlyToGoal } from "@/lib/planning/analytics";
import type { SavingsGoal } from "@/types/planning";

export function normalizeGoalAmount(amount: number | null | undefined): number {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return 0;
  return roundMoneyUp(amount);
}

export function applyGoalDelta(
  goals: SavingsGoal[],
  goalId: string,
  delta: number,
): SavingsGoal[] {
  if (!delta) return goals;
  const now = new Date().toISOString();
  return goals.map((g) => {
    if (g.id !== goalId) return g;
    const next = roundMoneyUp(Math.max(0, g.savedAmount + delta));
    return applyGoalMonthlyToGoal({ ...g, savedAmount: next, updatedAt: now });
  });
}

export function revertTransactionGoal(
  goals: SavingsGoal[],
  goalId: string | null | undefined,
  goalAmount: number | null | undefined,
): SavingsGoal[] {
  const amt = normalizeGoalAmount(goalAmount);
  if (!goalId || !amt) return goals;
  return applyGoalDelta(goals, goalId, -amt);
}

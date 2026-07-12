import type { DecisionCoreContext, ForecastEvent } from "@/lib/decision-core/types";

export function getReserveFloor(ctx: DecisionCoreContext): number {
  return Math.ceil(
    Math.max(
      ctx.essentialBudgetReserve.totalRemaining,
      Math.max(ctx.forecast.startBalance * 0.25, 1000),
    ),
  );
}

export function findConstraintEvent(ctx: DecisionCoreContext): ForecastEvent | null {
  if (ctx.forecast.firstDeficitDate) {
    return (
      ctx.forecast.events.find(
        (event) => event.date === ctx.forecast.firstDeficitDate && event.balanceAfter < 0,
      ) ?? null
    );
  }

  const reserveFloor = getReserveFloor(ctx);
  return (
    ctx.forecast.events.find(
      (event) => event.amount < 0 && event.balanceAfter <= reserveFloor,
    ) ?? null
  );
}

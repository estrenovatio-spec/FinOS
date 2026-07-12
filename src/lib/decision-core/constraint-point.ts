import type { DecisionCoreContext, ForecastEvent } from "@/lib/decision-core/types";

export function getRequiredFloor(ctx: DecisionCoreContext): number {
  return Math.ceil(ctx.essentialBudgetReserve.totalRemaining);
}

export type ConstraintPoint = {
  event: ForecastEvent;
  date: string;
  eventId: string;
  eventTitle: string;
  eventAmount: number;
  balanceAfter: number;
  kind: "deficit" | "reserve";
  requiredFloor: number;
};

export function getConstraintPoint(ctx: DecisionCoreContext): ConstraintPoint | null {
  if (ctx.forecast.firstDeficitDate) {
    const event =
      ctx.forecast.events.find(
        (entry) => entry.date === ctx.forecast.firstDeficitDate && entry.balanceAfter < 0,
      ) ?? null;
    return event
      ? {
          event,
          date: event.date,
          eventId: event.id,
          eventTitle: event.title,
          eventAmount: event.amount,
          balanceAfter: event.balanceAfter,
          kind: "deficit",
          requiredFloor: getRequiredFloor(ctx),
        }
      : null;
  }

  const requiredFloor = getRequiredFloor(ctx);
  if (requiredFloor <= 0) return null;

  const event =
    ctx.forecast.events.find(
      (entry) => entry.amount < 0 && entry.balanceAfter <= requiredFloor,
    ) ?? null;
  return event
    ? {
        event,
        date: event.date,
        eventId: event.id,
        eventTitle: event.title,
        eventAmount: event.amount,
        balanceAfter: event.balanceAfter,
        kind: "reserve",
        requiredFloor,
      }
    : null;
}

export function findConstraintEvent(ctx: DecisionCoreContext): ForecastEvent | null {
  return getConstraintPoint(ctx)?.event ?? null;
}

export function getConstraintDate(ctx: DecisionCoreContext): string | null {
  return getConstraintPoint(ctx)?.event.date ?? null;
}

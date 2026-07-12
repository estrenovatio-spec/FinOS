import {
  getForecastDays,
  pickConstraintEventForDay,
} from "@/lib/decision-core/forecast-days";
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
  const days = getForecastDays(ctx.forecast);
  const requiredFloor = getRequiredFloor(ctx);

  for (const day of days) {
    if (day.endBalance < 0) {
      const event = pickConstraintEventForDay(day);
      if (!event) return null;
      return {
        event,
        date: day.date,
        eventId: event.id,
        eventTitle: event.title,
        eventAmount: event.amount,
        balanceAfter: day.endBalance,
        kind: "deficit",
        requiredFloor,
      };
    }
  }

  if (requiredFloor <= 0) return null;

  for (const day of days) {
    if (day.endBalance <= requiredFloor) {
      const event = pickConstraintEventForDay(day);
      if (!event) return null;
      return {
        event,
        date: day.date,
        eventId: event.id,
        eventTitle: event.title,
        eventAmount: event.amount,
        balanceAfter: day.endBalance,
        kind: "reserve",
        requiredFloor,
      };
    }
  }

  return null;
}

export function findConstraintEvent(ctx: DecisionCoreContext): ForecastEvent | null {
  return getConstraintPoint(ctx)?.event ?? null;
}

export function getConstraintDate(ctx: DecisionCoreContext): string | null {
  return getConstraintPoint(ctx)?.date ?? null;
}

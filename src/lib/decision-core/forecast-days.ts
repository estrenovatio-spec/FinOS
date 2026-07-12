import { normalizeIsoDate } from "@/lib/format-date";
import type {
  BalanceForecast,
  ForecastDay,
  ForecastEvent,
} from "@/lib/decision-core/types";

function sortEvents(left: ForecastEvent, right: ForecastEvent) {
  if (left.date !== right.date) return left.date.localeCompare(right.date);
  if (left.amount !== right.amount) return left.amount - right.amount;
  return left.id.localeCompare(right.id);
}

function sortDays(left: ForecastDay, right: ForecastDay) {
  return left.date.localeCompare(right.date);
}

export function buildForecastDays(
  startBalance: number,
  events: ForecastEvent[],
): ForecastDay[] {
  const normalizedEvents = [...events]
    .map((event) => ({
      ...event,
      date: normalizeIsoDate(event.date) ?? event.date,
    }))
    .sort(sortEvents);

  const grouped = new Map<string, ForecastEvent[]>();
  for (const event of normalizedEvents) {
    const existing = grouped.get(event.date);
    if (existing) {
      existing.push(event);
      continue;
    }
    grouped.set(event.date, [event]);
  }

  let runningStartBalance = startBalance;
  const days = [...grouped.entries()]
    .map(([date, dayEvents]) => {
      const incomeTotal = dayEvents
        .filter((event) => event.amount > 0)
        .reduce((sum, event) => sum + event.amount, 0);
      const expenseTotal = Math.abs(
        dayEvents
          .filter((event) => event.amount < 0)
          .reduce((sum, event) => sum + event.amount, 0),
      );
      const netChange = dayEvents.reduce((sum, event) => sum + event.amount, 0);
      const day: ForecastDay = {
        date,
        events: dayEvents,
        incomeTotal,
        expenseTotal,
        netChange,
        startBalance: runningStartBalance,
        endBalance: runningStartBalance + netChange,
      };
      runningStartBalance = day.endBalance;
      return day;
    })
    .sort(sortDays);

  return days;
}

export function getForecastDays(forecast: BalanceForecast): ForecastDay[] {
  return forecast.days ?? buildForecastDays(forecast.startBalance, forecast.events);
}

export function pickConstraintEventForDay(day: ForecastDay): ForecastEvent | null {
  const expenses = day.events
    .filter((event) => event.amount < 0)
    .sort((left, right) => {
      const byAmount = Math.abs(right.amount) - Math.abs(left.amount);
      if (byAmount !== 0) return byAmount;
      return left.id.localeCompare(right.id);
    });
  if (expenses.length > 0) return expenses[0] ?? null;

  const incomes = day.events
    .filter((event) => event.amount > 0)
    .sort((left, right) => {
      const byAmount = Math.abs(right.amount) - Math.abs(left.amount);
      if (byAmount !== 0) return byAmount;
      return left.id.localeCompare(right.id);
    });
  return incomes[0] ?? day.events[0] ?? null;
}

export function findForecastDayByDate(
  forecast: BalanceForecast,
  date: string,
): ForecastDay | null {
  return getForecastDays(forecast).find((day) => day.date === date) ?? null;
}

import { formatMonthYearLong } from "@/lib/format-date";
import { getForecastDays } from "@/lib/decision-core/forecast-days";
import type { BalanceForecast, ForecastDay } from "@/lib/decision-core/types";
import type { Locale } from "@/types";

type ForecastCalendarGoal = {
  id: string;
  name: string;
  deadline: string;
};

export type ForecastCalendarDayEntry = {
  date: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isDeficit: boolean;
  hasEvents: boolean;
  incomeTotal: number;
  expenseTotal: number;
  startBalance: number | null;
  endBalance: number | null;
  eventsCount: number;
  goals: ForecastCalendarGoal[];
};

export type ForecastCalendarMonth = {
  key: string;
  label: string;
  days: ForecastCalendarDayEntry[];
};

function parseIsoDateParts(date: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function isoFromParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function firstDayOfMonth(key: string): string {
  return `${key}-01`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function addMonths(date: string, delta: number): string {
  const parts = parseIsoDateParts(date);
  if (!parts) return date;
  const base = new Date(parts.year, parts.month - 1 + delta, 1, 12, 0, 0, 0);
  return isoFromParts(base.getFullYear(), base.getMonth() + 1, 1);
}

function enumerateMonthKeys(startDate: string, endDate: string): string[] {
  const keys: string[] = [];
  let current = firstDayOfMonth(startDate.slice(0, 7));
  const endKey = monthKey(endDate);
  while (monthKey(current) <= endKey) {
    keys.push(monthKey(current));
    current = addMonths(current, 1);
  }
  return keys;
}

function mondayFirstWeekdayIndex(date: string): number {
  const parts = parseIsoDateParts(date);
  if (!parts) return 0;
  const weekday = new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0).getDay();
  return weekday === 0 ? 6 : weekday - 1;
}

export function buildForecastCalendarMonths({
  forecast,
  startDate,
  locale,
  goals = [],
}: {
  forecast: BalanceForecast;
  startDate: string;
  locale: Locale;
  goals?: ForecastCalendarGoal[];
}): ForecastCalendarMonth[] {
  const forecastDays = new Map<string, ForecastDay>(
    getForecastDays(forecast).map((day) => [day.date, day]),
  );
  const goalsByDate = new Map<string, ForecastCalendarGoal[]>();
  for (const goal of goals) {
    const existing = goalsByDate.get(goal.deadline);
    if (existing) {
      existing.push(goal);
    } else {
      goalsByDate.set(goal.deadline, [goal]);
    }
  }

  return enumerateMonthKeys(startDate, forecast.horizonEndDate).map((key) => {
    const [yearRaw, monthRaw] = key.split("-");
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const totalDays = daysInMonth(year, month);
    const leadingSlots = mondayFirstWeekdayIndex(`${key}-01`);
    const days: ForecastCalendarDayEntry[] = [];

    for (let index = 0; index < leadingSlots; index += 1) {
      days.push({
        date: `${key}-pad-${index}`,
        dayNumber: 0,
        isCurrentMonth: false,
        isDeficit: false,
        hasEvents: false,
        incomeTotal: 0,
        expenseTotal: 0,
        startBalance: null,
        endBalance: null,
        eventsCount: 0,
        goals: [],
      });
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const date = isoFromParts(year, month, day);
      const forecastDay = forecastDays.get(date) ?? null;
      const goalItems = goalsByDate.get(date) ?? [];
      days.push({
        date,
        dayNumber: day,
        isCurrentMonth: true,
        isDeficit: (forecastDay?.endBalance ?? 0) < 0,
        hasEvents: forecastDay != null,
        incomeTotal: forecastDay?.incomeTotal ?? 0,
        expenseTotal: forecastDay?.expenseTotal ?? 0,
        startBalance: forecastDay?.startBalance ?? null,
        endBalance: forecastDay?.endBalance ?? null,
        eventsCount: forecastDay?.events.length ?? 0,
        goals: goalItems,
      });
    }

    return {
      key,
      label: formatMonthYearLong(`${key}-15`, locale),
      days,
    };
  });
}

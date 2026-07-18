import {
  isoDateToLocalMiddayMs,
  normalizeIsoDate,
} from "@/lib/format-date";
import type { BalanceForecast, ForecastEvent } from "@/lib/decision-core/types";
import { getForecastDays as getDecisionForecastDays } from "@/lib/decision-core/forecast-days";

export type ForecastFocus = {
  date: string;
  source: "today_main_action";
  reason: "current_deficit" | "future_deficit" | "reserve_required";
  eventId?: string | null;
};

export type ForecastDateGroup = {
  date: string;
  events: ForecastEvent[];
  balanceAfter: number;
  totalDelta: number;
};

export type ForecastFocusResolution = {
  focusDate: string | null;
  selectedDate: string | null;
  selectedEventId: string | null;
  exactMatch: boolean;
  outOfHorizon: boolean;
};

export type ForecastCalendarNavigationTarget = {
  targetMonthKey: string | null;
  selectedDate: string | null;
};

function sortGroups(left: ForecastDateGroup, right: ForecastDateGroup) {
  return left.date.localeCompare(right.date);
}

export function groupForecastEventsByDate(
  forecast: BalanceForecast,
): ForecastDateGroup[] {
  return getDecisionForecastDays(forecast)
    .map((day) => ({
      date: day.date,
      events: day.events,
      balanceAfter: day.endBalance,
      totalDelta: day.netChange,
    }))
    .sort(sortGroups);
}

export function resolveForecastFocus(
  forecast: BalanceForecast,
  focus: ForecastFocus | null,
): ForecastFocusResolution {
  const focusDate = normalizeIsoDate(focus?.date);
  if (!focusDate) {
    return {
      focusDate: null,
      selectedDate: null,
      selectedEventId: null,
      exactMatch: false,
      outOfHorizon: false,
    };
  }

  const normalizedToday = normalizeIsoDate(
    forecast.events[0]?.date ?? forecast.horizonEndDate,
  );
  const focusMs = isoDateToLocalMiddayMs(focusDate);
  const horizonMs = isoDateToLocalMiddayMs(forecast.horizonEndDate);
  const startMs = normalizedToday ? isoDateToLocalMiddayMs(normalizedToday) : null;
  if (
    focusMs == null ||
    horizonMs == null ||
    (startMs != null && focusMs > horizonMs) ||
    (startMs != null && focusMs < startMs && forecast.events.length === 0)
  ) {
    return {
      focusDate,
      selectedDate: null,
      selectedEventId: null,
      exactMatch: false,
      outOfHorizon: true,
    };
  }

  const groups = groupForecastEventsByDate(forecast);
  const exact = groups.find((group) => group.date === focusDate);
  if (exact) {
    return {
      focusDate,
      selectedDate: exact.date,
      selectedEventId:
        focus?.eventId && exact.events.some((event) => event.id === focus.eventId)
          ? focus.eventId
          : null,
      exactMatch: true,
      outOfHorizon: false,
    };
  }

  if (groups.length === 0) {
    return {
      focusDate,
      selectedDate: null,
      selectedEventId: null,
      exactMatch: false,
      outOfHorizon: false,
    };
  }

  const nearest = [...groups]
    .map((group) => ({
      date: group.date,
      distance: Math.abs(
        (isoDateToLocalMiddayMs(group.date) ?? Number.MAX_SAFE_INTEGER) -
          (focusMs ?? 0),
      ),
    }))
    .sort((left, right) => {
      if (left.distance !== right.distance) return left.distance - right.distance;
      return left.date.localeCompare(right.date);
    })[0];

  return {
    focusDate,
    selectedDate: nearest?.date ?? null,
    selectedEventId: null,
    exactMatch: false,
    outOfHorizon: false,
  };
}

export function resolveForecastCalendarNavigationTarget(args: {
  forecast: BalanceForecast;
  focus: ForecastFocus | null;
  todayIso: string;
}): ForecastCalendarNavigationTarget {
  const todayIso = normalizeIsoDate(args.todayIso);
  const currentMonthKey = todayIso?.slice(0, 7) ?? null;
  const focusDate = normalizeIsoDate(args.focus?.date);

  if (!focusDate) {
    return {
      targetMonthKey: currentMonthKey,
      selectedDate: null,
    };
  }

  if (todayIso && focusDate < todayIso) {
    const nearestRiskDate = normalizeIsoDate(args.forecast.firstDeficitDate);
    return {
      targetMonthKey: currentMonthKey,
      selectedDate:
        nearestRiskDate &&
        nearestRiskDate >= todayIso &&
        nearestRiskDate.slice(0, 7) === currentMonthKey
          ? nearestRiskDate
          : null,
    };
  }

  const resolution = resolveForecastFocus(args.forecast, args.focus);
  return {
    targetMonthKey:
      resolution.selectedDate?.slice(0, 7) ??
      focusDate.slice(0, 7) ??
      currentMonthKey,
    selectedDate: resolution.selectedDate,
  };
}

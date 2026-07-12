import {
  isoDateToLocalMiddayMs,
  normalizeIsoDate,
} from "@/lib/format-date";
import type { BalanceForecast, ForecastEvent } from "@/lib/decision-core/types";

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

function sortGroups(left: ForecastDateGroup, right: ForecastDateGroup) {
  return left.date.localeCompare(right.date);
}

export function groupForecastEventsByDate(
  forecast: BalanceForecast,
): ForecastDateGroup[] {
  const grouped = new Map<string, ForecastDateGroup>();

  for (const event of forecast.events) {
    const date = normalizeIsoDate(event.date);
    if (!date) continue;

    const existing = grouped.get(date);
    if (existing) {
      existing.events.push(event);
      existing.totalDelta += event.amount;
      existing.balanceAfter = event.balanceAfter;
      continue;
    }

    grouped.set(date, {
      date,
      events: [event],
      balanceAfter: event.balanceAfter,
      totalDelta: event.amount,
    });
  }

  return [...grouped.values()].sort(sortGroups);
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

import { formatTransactionDate } from "@/lib/format-date";
import {
  groupForecastEventsByDate,
  resolveForecastFocus,
  type ForecastFocus,
} from "@/lib/forecast-focus";
import { formatMoney } from "@/lib/format-money";
import type {
  BalanceForecast,
  DecisionConstraintExplanation,
} from "@/lib/decision-core/types";
import type { Locale } from "@/types";

export type FocusedForecastView = {
  selectedDate: string | null;
  selectedEventId: string | null;
  exactMatch: boolean;
  outOfHorizon: boolean;
  message: string | null;
  contextTitle: string | null;
  contextSummary: string | null;
  contextDetail: string | null;
  contextBalance: string | null;
};

function focusReasonText(focus: ForecastFocus, locale: Locale): string {
  switch (focus.reason) {
    case "current_deficit":
      return locale === "ru"
        ? "Деньги уже проседают. Ниже видно, что именно происходит дальше."
        : "The deficit has already started. The forecast below shows what happens next.";
    case "future_deficit":
      return locale === "ru"
        ? "На этой дате денег по прогнозу уже может не хватить."
        : "This is the date where the forecast turns negative.";
    case "reserve_required":
      return locale === "ru"
        ? "Здесь видно, почему эти деньги лучше заранее не тратить."
        : "This is where the reserve becomes necessary.";
  }
}

export function buildFocusedForecastView(
  forecast: BalanceForecast,
  focus: ForecastFocus | null,
  locale: Locale,
  explanation?: DecisionConstraintExplanation | null,
): FocusedForecastView {
  const groups = groupForecastEventsByDate(forecast);
  const resolution = resolveForecastFocus(forecast, focus);
  const hasVisibleFocusContext =
    Boolean(focus) && resolution.exactMatch && !resolution.outOfHorizon;
  const selectedDate = hasVisibleFocusContext ? resolution.selectedDate : null;
  const selectedGroup =
    groups.find((group) => group.date === selectedDate) ?? null;

  const message = (() => {
    if (!focus || !hasVisibleFocusContext) return null;
    return focusReasonText(focus, locale);
  })();

  return {
    selectedDate,
    selectedEventId: hasVisibleFocusContext ? resolution.selectedEventId : null,
    exactMatch: hasVisibleFocusContext ? resolution.exactMatch : false,
    outOfHorizon: resolution.outOfHorizon,
    message,
    contextTitle:
      selectedGroup == null
        ? null
        : explanation && explanation.date === selectedGroup.date
          ? explanation.title
          : locale === "ru"
            ? `Почему FIN OS показывает именно ${formatTransactionDate(selectedGroup.date, locale)}`
            : `Why FIN OS brought you to ${formatTransactionDate(selectedGroup.date, locale)}`,
    contextSummary:
      selectedGroup == null
        ? null
        : explanation && explanation.date === selectedGroup.date
          ? explanation.summary
          : null,
    contextDetail:
      selectedGroup == null
        ? null
        : explanation && explanation.date === selectedGroup.date
          ? explanation.detail
          : null,
    contextBalance:
      selectedGroup == null
        ? null
        : `${formatMoney(selectedGroup.balanceAfter, locale)} ${locale === "ru" ? "₽" : "RUB"}`,
  };
}

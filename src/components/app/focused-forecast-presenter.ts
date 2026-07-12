import { formatTransactionDate } from "@/lib/format-date";
import {
  groupForecastEventsByDate,
  resolveForecastFocus,
  type ForecastFocus,
} from "@/lib/forecast-focus";
import { formatMoney } from "@/lib/format-money";
import type { BalanceForecast } from "@/lib/decision-core/types";
import type { Locale } from "@/types";

export type FocusedForecastView = {
  selectedDate: string | null;
  selectedEventId: string | null;
  exactMatch: boolean;
  outOfHorizon: boolean;
  message: string | null;
  contextTitle: string | null;
  contextBalance: string | null;
  contextDeficit: string | null;
};

function focusReasonText(focus: ForecastFocus, locale: Locale): string {
  switch (focus.reason) {
    case "current_deficit":
      return locale === "ru"
        ? "Дефицит уже начался. Ниже показано, как прогноз развивается дальше."
        : "The deficit has already started. The forecast below shows what happens next.";
    case "future_deficit":
      return locale === "ru"
        ? "Это дата, на которой прогноз уходит в минус."
        : "This is the date where the forecast turns negative.";
    case "reserve_required":
      return locale === "ru"
        ? "Здесь становится видно, почему резерв нужен заранее."
        : "This is where the reserve becomes necessary.";
  }
}

export function buildFocusedForecastView(
  forecast: BalanceForecast,
  focus: ForecastFocus | null,
  locale: Locale,
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
        : locale === "ru"
          ? `Почему FIN OS привёл вас на ${formatTransactionDate(selectedGroup.date, locale)}`
          : `Why FIN OS brought you to ${formatTransactionDate(selectedGroup.date, locale)}`,
    contextBalance:
      selectedGroup == null
        ? null
        : `${formatMoney(selectedGroup.balanceAfter, locale)} ${locale === "ru" ? "₽" : "RUB"}`,
    contextDeficit:
      selectedGroup == null || selectedGroup.balanceAfter >= 0
        ? null
        : locale === "ru"
          ? `После этих операций: −${formatMoney(Math.abs(selectedGroup.balanceAfter), locale)} ₽`
          : `After these events: −${formatMoney(Math.abs(selectedGroup.balanceAfter), locale)} RUB`,
  };
}

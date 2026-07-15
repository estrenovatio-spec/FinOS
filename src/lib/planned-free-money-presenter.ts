import { formatHumanDateLong } from "@/lib/format-date";
import { formatMoney } from "@/lib/format-money";
import type { PlannedFreeMoneyView } from "@/lib/free-money";
import type { Locale } from "@/types";

export type PlannedFreeMoneySummary = {
  label: string;
  subtitle: string | null;
  value: string;
  caption: string;
};

export function formatPlannedFreeMoneyAmount(
  amount: number | null | undefined,
  locale: Locale,
): string {
  if (amount == null || !Number.isFinite(amount)) {
    return locale === "ru" ? "0 ₽" : "0 RUB";
  }
  return `${formatMoney(amount, locale)} ${locale === "ru" ? "₽" : "RUB"}`;
}

export function buildPlannedFreeMoneySummary(
  locale: Locale,
  plannedFreeMoney?: PlannedFreeMoneyView,
): PlannedFreeMoneySummary | null {
  if (!plannedFreeMoney || plannedFreeMoney.amount == null || !plannedFreeMoney.periodEndDate) {
    return null;
  }

  return {
    label: locale === "ru" ? "Можно потратить" : "Available to spend",
    subtitle:
      locale === "ru"
        ? `до ${formatHumanDateLong(plannedFreeMoney.periodEndDate, locale)}`
        : `until ${formatHumanDateLong(plannedFreeMoney.periodEndDate, locale)}`,
    value: formatPlannedFreeMoneyAmount(plannedFreeMoney.amount, locale),
    caption:
      locale === "ru"
        ? plannedFreeMoney.includesUnconfirmedIncome
          ? "После обязательных платежей и базовых расходов, если ожидаемые доходы придут по плану. Поступление ещё не подтверждено."
          : "После обязательных платежей и базовых расходов, если ожидаемые доходы придут по плану."
        : plannedFreeMoney.includesUnconfirmedIncome
          ? "After all payments and planned spending, if recurring income arrives as planned. The income is not confirmed yet."
          : "After all payments and planned spending, if recurring income arrives as planned.",
  };
}

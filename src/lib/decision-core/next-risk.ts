import { daysInclusiveUntilDate } from "@/lib/format-date";
import type { DecisionCoreContext, DecisionNextRisk } from "@/lib/decision-core/types";

function formatRiskDistance(daysAway: number, locale: DecisionCoreContext["locale"]): string {
  if (daysAway <= 0) return locale === "ru" ? "сегодня" : "today";
  if (locale === "en") return `in ${daysAway} day${daysAway === 1 ? "" : "s"}`;
  if (daysAway % 10 === 1 && daysAway % 100 !== 11) return `через ${daysAway} день`;
  if (
    daysAway % 10 >= 2 &&
    daysAway % 10 <= 4 &&
    (daysAway % 100 < 12 || daysAway % 100 > 14)
  ) {
    return `через ${daysAway} дня`;
  }
  return `через ${daysAway} дней`;
}

export function buildNextRisk(ctx: DecisionCoreContext): DecisionNextRisk | null {
  const { locale, today, forecast } = ctx;

  const nearest = forecast.events
    .filter((event) => event.amount < 0)
    .map((event) => ({
      eventId: event.id,
      eventSource: event.source,
      kind: event.source === "debt_payment" ? ("debt" as const) : ("payment" as const),
      title: event.title,
      amount: Math.abs(event.amount),
      date: event.date,
      daysAway: Math.max(0, (daysInclusiveUntilDate(event.date, today) ?? 1) - 1),
      balanceAfter: event.balanceAfter,
    }))
    .sort((left, right) => {
      if (left.daysAway !== right.daysAway) return left.daysAway - right.daysAway;
      if (left.balanceAfter !== right.balanceAfter) return left.balanceAfter - right.balanceAfter;
      return right.amount - left.amount;
    })[0];

  if (!nearest) return null;

  return {
    ...nearest,
    label: formatRiskDistance(nearest.daysAway, locale),
    note:
      locale === "ru"
        ? nearest.balanceAfter < 0
          ? "После этого события прогноз уходит в минус."
          : "После этого события запас денег становится минимальным."
        : nearest.balanceAfter < 0
          ? "This event turns the forecast negative."
          : "This event leaves the smallest cash buffer.",
  };
}

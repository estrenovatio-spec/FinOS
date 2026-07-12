import { daysInclusiveUntilDate } from "@/lib/format-date";
import { findConstraintEvent } from "@/lib/decision-core/constraint-point";
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
  const { locale, today } = ctx;
  const constrained = findConstraintEvent(ctx);

  if (!constrained) return null;

  const nearest = {
    eventId: constrained.id,
    eventSource: constrained.source,
    kind: constrained.source === "debt_payment" ? ("debt" as const) : ("payment" as const),
    title: constrained.title,
    amount: Math.abs(constrained.amount),
    date: constrained.date,
    daysAway: Math.max(0, (daysInclusiveUntilDate(constrained.date, today) ?? 1) - 1),
    balanceAfter: constrained.balanceAfter,
  };

  return {
    ...nearest,
    label: formatRiskDistance(nearest.daysAway, locale),
    note:
      locale === "ru"
        ? nearest.balanceAfter < 0
          ? "После этого события прогноз уходит в минус."
          : "После этого события свободный запас денег заканчивается."
        : nearest.balanceAfter < 0
          ? "This event turns the forecast negative."
          : "This event uses up the free cash buffer.",
  };
}

import type {
  DecisionCoreContext,
  ForecastConfidence,
} from "@/lib/decision-core/types";

export type ForecastConfidenceDetails = {
  confidence: ForecastConfidence;
  note: string | null;
};

function formatDate(iso: string, locale: DecisionCoreContext["locale"]): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  if (!year || !month || !day) return iso;
  return locale === "ru" ? `${Number(day)}.${month}.${year}` : `${month}/${day}/${year}`;
}

export function getForecastConfidence(
  ctx: DecisionCoreContext,
  horizonDate: string | null | undefined,
): ForecastConfidenceDetails {
  const unresolved = ctx.resolvedIncomeSources
    .filter((source) => source.status !== "received")
    .filter((source) => {
      const date = source.expectedDate?.slice(0, 10);
      if (!date) return false;
      if (!horizonDate) return true;
      if (source.status === "overdue_unconfirmed") return true;
      return date <= horizonDate.slice(0, 10);
    })
    .sort((left, right) => {
      const leftRank = left.status === "overdue_unconfirmed" ? 0 : 1;
      const rightRank = right.status === "overdue_unconfirmed" ? 0 : 1;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return (left.expectedDate ?? "").localeCompare(right.expectedDate ?? "");
    });

  const candidate = unresolved[0];
  if (!candidate || !candidate.expectedDate) {
    return { confidence: "confirmed", note: null };
  }

  if (candidate.status === "overdue_unconfirmed") {
    return {
      confidence: "uncertain",
      note:
        ctx.locale === "ru"
          ? `Прогноз зависит от неподтверждённого дохода ${formatDate(candidate.expectedDate, ctx.locale)}.`
          : `The forecast depends on the unconfirmed income planned for ${formatDate(candidate.expectedDate, ctx.locale)}.`,
    };
  }

  return {
    confidence: "planned",
    note:
      ctx.locale === "ru"
        ? `С учётом ожидаемого дохода ${formatDate(candidate.expectedDate, ctx.locale)}.`
        : `Including the expected income on ${formatDate(candidate.expectedDate, ctx.locale)}.`,
  };
}

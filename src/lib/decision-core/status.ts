import type {
  BalanceForecast,
  DecisionNextRisk,
  DecisionSafeUntil,
  DecisionStatus,
  DecisionTodayPayment,
} from "@/lib/decision-core/types";

type StatusInput = {
  locale: "ru" | "en";
  safeUntil: DecisionSafeUntil;
  todayPayments: DecisionTodayPayment[];
  nextRisk: DecisionNextRisk | null;
  confirmedTransactionsCount: number;
  forecast: BalanceForecast;
  requiredFloor: number;
  hasOverduePayments: boolean;
};

export function buildStatus(input: StatusInput): DecisionStatus {
  const {
    locale,
    safeUntil,
    todayPayments,
    nextRisk,
    confirmedTransactionsCount,
    forecast,
    requiredFloor,
    hasOverduePayments,
  } = input;

  let key: DecisionStatus["key"] = "calm";
  let note: string | undefined;
  if (
    hasOverduePayments ||
    todayPayments.length > 0 ||
    forecast.startBalance <= 0 ||
    (safeUntil.isReady && forecast.firstDeficitDate != null)
  ) {
    key = "action";
    note =
      locale === "ru"
        ? "Есть обязательное действие, которое влияет на прогноз уже сейчас."
        : "There is an immediate action affecting the forecast.";
  } else if (
    !safeUntil.isReady ||
    (requiredFloor > 0 && forecast.minBalance <= requiredFloor) ||
    (nextRisk && nextRisk.daysAway <= 7 && requiredFloor > 0) ||
    (confirmedTransactionsCount === 0 && !safeUntil.isReady && forecast.events.length === 0)
  ) {
    key = "risk";
    note =
      locale === "ru"
        ? "Прогноз пока уязвим или недостаточно надёжен."
        : "The forecast is vulnerable or not reliable enough yet.";
  } else {
    note =
      locale === "ru"
        ? "На известном горизонте прогноза критического риска нет."
        : "There is no critical risk on the known forecast horizon.";
  }

  return {
    key,
    title:
      key === "calm"
        ? locale === "ru"
          ? "Всё спокойно"
          : "Everything is calm"
        : key === "risk"
          ? locale === "ru"
            ? "Есть риск"
            : "There is a risk"
          : locale === "ru"
            ? "Требуется действие"
            : "Action is needed",
    toneClassName:
      key === "calm"
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
        : key === "risk"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-700"
          : "border-rose-500/30 bg-rose-500/10 text-rose-700",
    note,
  };
}

import type {
  DecisionNextRisk,
  DecisionPeaceIndex,
  DecisionSafeUntil,
  DecisionStatus,
  DecisionTodayPayment,
} from "@/lib/decision-core/types";

type PeaceIndexInput = {
  locale: "ru" | "en";
  status: DecisionStatus;
  safeUntil: DecisionSafeUntil;
  todayPayments: DecisionTodayPayment[];
  nextRisk: DecisionNextRisk | null;
};

export function buildPeaceIndex(input: PeaceIndexInput): DecisionPeaceIndex {
  const { locale, status, nextRisk, todayPayments } = input;

  let value = status.key === "calm" ? 84 : status.key === "risk" ? 62 : 38;
  if (nextRisk) {
    value -= Math.min(12, Math.max(0, 8 - nextRisk.daysAway));
  }
  if (todayPayments.length > 0) {
    value -= Math.min(10, todayPayments.length * 3);
  }
  value = Math.max(18, Math.min(95, value));

  return {
    value,
    note:
      locale === "ru"
        ? "Временная оценка учитывает просадку прогноза и близость риска."
        : "Temporary estimate reflects forecast stress and risk proximity.",
  };
}

import type {
  DecisionAvoid,
  DecisionCoreContext,
  DecisionNextRisk,
  PrimaryDecision,
} from "@/lib/decision-core/types";

export function buildAvoid(
  decision: PrimaryDecision,
  ctx: DecisionCoreContext,
  nextRisk: DecisionNextRisk | null,
): DecisionAvoid {
  switch (decision.type) {
    case "overdue_payment":
    case "payment_today":
      return {
        text:
          ctx.locale === "ru"
            ? "Не откладывать обязательный платёж ради необязательных трат."
            : "Do not postpone the required payment for discretionary spending.",
        reason:
          ctx.locale === "ru"
            ? "Сначала нужно закрыть обязательный платёж."
            : "The required payment comes first.",
      };
    case "current_deficit":
    case "future_deficit":
      return {
        text:
          ctx.locale === "ru"
            ? "Не делать новых необязательных покупок, пока дефицит не закрыт."
            : "Avoid any new non-essential purchases until the deficit is covered.",
        reason:
          ctx.locale === "ru"
            ? "Каждая лишняя трата ухудшает дефицит."
            : "Every extra expense worsens the deficit.",
      };
    case "reserve_required":
      return {
        text:
          ctx.locale === "ru"
            ? "Не тратить резерв, который нужен до ближайшего риска."
            : "Do not spend the reserve needed before the next risk.",
        reason: nextRisk?.note ?? null,
      };
    case "missing_data":
      return {
        text:
          ctx.locale === "ru"
            ? "Не планировать крупные траты, пока прогноз не станет надёжнее."
            : "Do not plan major spending until the forecast becomes more reliable.",
        reason:
          ctx.locale === "ru"
            ? "Сейчас системе не хватает части ключевых данных."
            : "The system is still missing part of the key data.",
      };
    case "no_urgent_action":
      return { text: null, reason: null };
  }
}

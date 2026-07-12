import { formatMoney } from "@/lib/format-money";
import { getForecastConfidence } from "@/lib/decision-core/forecast-confidence";
import { getConstraintDate } from "@/lib/decision-core/constraint-point";
import type {
  DecisionAllowed,
  DecisionCoreContext,
  PrimaryDecision,
} from "@/lib/decision-core/types";

function rub(amount: number, locale: "ru" | "en") {
  return `${formatMoney(amount, locale)} ${locale === "ru" ? "₽" : "RUB"}`;
}

export function buildAllowed(
  decision: PrimaryDecision,
  ctx: DecisionCoreContext,
): DecisionAllowed {
  const horizonDate = getConstraintDate(ctx) ?? ctx.forecast.horizonEndDate;
  const confidence = getForecastConfidence(ctx, horizonDate);
  const hasKnownIncomeHorizon = Boolean(horizonDate);
  const essentialReserve = ctx.essentialBudgetReserve.totalRemaining;
  const discretionaryAmount = Math.max(
    0,
    Math.round(ctx.forecast.minBalance - essentialReserve),
  );

  switch (decision.type) {
    case "overdue_payment":
    case "payment_today":
    case "overdue_income_confirmation":
    case "income_due_today":
    case "current_deficit":
    case "future_deficit":
      return {
        text:
          ctx.locale === "ru"
            ? "Сегодня лучше ограничиться обязательным."
            : "Today is best kept to essentials only.",
        hasRestPermission: false,
        status: "restricted",
        amount: 0,
        horizonDate: horizonDate ?? null,
        confidence: confidence.confidence,
        confidenceNote: confidence.note,
        reason:
          ctx.locale === "ru"
            ? "Необязательные траты нарушат обязательные платежи или приведут к дефициту."
            : "Discretionary spending would break obligations or trigger a deficit.",
      };
    case "reserve_required":
      return {
        text:
          ctx.locale === "ru"
            ? "Можно прожить день спокойно, если не трогать резерв до ближайшего обязательства."
            : "You can have a calm day if you do not touch the reserve before the next obligation.",
        hasRestPermission: true,
        status: "restricted",
        amount: 0,
        horizonDate: decision.dueDate,
        confidence: confidence.confidence,
        confidenceNote: confidence.note,
        reason:
          ctx.locale === "ru"
            ? "Свободная сумма сегодня уже нужна как резерв под ближайшую ограничивающую точку."
            : "Today's free cash is already needed for the next limiting point.",
      };
    case "missing_data":
      return {
        text:
          ctx.locale === "ru"
            ? "Можно прожить день спокойно, но без новых трат, пока не уточните базовые данные."
            : "You can keep the day calm, but avoid new spending until the basics are filled in.",
        hasRestPermission: true,
        status: "unknown",
        amount: null,
        horizonDate: null,
        confidence: "uncertain",
        confidenceNote: null,
        reason:
          ctx.locale === "ru"
            ? "Нельзя надёжно посчитать безопасную сумму без ключевых данных."
            : "A safe discretionary amount cannot be calculated reliably without key data.",
      };
    case "no_urgent_action":
      if (!hasKnownIncomeHorizon) {
        return {
          text:
            ctx.locale === "ru"
              ? "Сегодня можно жить спокойно, но безопасную сумму трат пока лучше не обещать."
              : "Today can stay calm, but it is better not to promise a safe spending amount yet.",
          hasRestPermission: true,
          status: "unknown",
          amount: null,
          horizonDate: null,
          reason:
            ctx.locale === "ru"
              ? confidence.note ?? "У прогноза нет подтверждённого горизонта следующего дохода."
              : "The forecast has no confirmed next-income horizon.",
          confidence: confidence.confidence,
          confidenceNote: confidence.note,
        };
      }

      if (
        ctx.forecast.startBalance <= 0 ||
        ctx.forecast.minBalance <= 0 ||
        discretionaryAmount <= 0
      ) {
        return {
          text:
            ctx.locale === "ru"
              ? "Сегодня лучше не добавлять необязательные траты."
              : "It is better not to add discretionary spending today.",
          hasRestPermission: false,
          status: "restricted",
          amount: 0,
          horizonDate,
          confidence: confidence.confidence,
          confidenceNote: confidence.note,
          reason:
            ctx.locale === "ru"
              ? "Свободного остатка сверх обязательств не остаётся."
              : "There is no free balance left above obligations.",
        };
      }

      return {
        text:
          ctx.locale === "ru"
            ? `Можно потратить сегодня до ${rub(discretionaryAmount, ctx.locale)} без риска для прогноза.`
            : `You can spend up to ${rub(discretionaryAmount, ctx.locale)} today without breaking the forecast.`,
        hasRestPermission: true,
        status: "available",
        amount: discretionaryAmount,
        horizonDate,
        confidence: confidence.confidence,
        confidenceNote: confidence.note,
        reason:
          ctx.locale === "ru"
            ? essentialReserve > 0
              ? "Это сумма сверх обязательных платежей и оставшихся обязательных лимитов до конца текущего горизонта прогноза."
              : "Это сумма необязательных расходов сверх обязательств и минимального резерва до конца текущего горизонта прогноза."
            : essentialReserve > 0
              ? "This is the amount above required payments and the remaining essential category limits until the end of the current forecast horizon."
              : "This is discretionary spending above obligations and the minimum reserve until the end of the current forecast horizon.",
      };
  }
}

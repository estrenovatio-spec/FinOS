import { calculateSafeSpending } from "@/lib/safe-spending";
import { daysInclusiveUntilDate } from "@/lib/format-date";
import { getForecastConfidence } from "@/lib/decision-core/forecast-confidence";
import { getConstraintPoint } from "@/lib/decision-core/constraint-point";
import type { DecisionCoreContext, DecisionCoreState, DecisionSafeUntil } from "@/lib/decision-core/types";

const MONTHS_RU = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
] as const;

const MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function formatDayMonth(iso: string, locale: DecisionCoreState["locale"]): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return iso;
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (locale === "en") return `${MONTHS_EN[monthIndex]} ${day}`;
  return `${day} ${MONTHS_RU[monthIndex]}`;
}

function formatHorizonLabel(
  months: 1 | 3 | 6,
  locale: DecisionCoreState["locale"],
): string {
  if (locale === "en") {
    return months === 1 ? "1 month" : `${months} months`;
  }

  if (months === 1) return "1 месяц";
  if (months >= 2 && months <= 4) return `${months} месяца`;
  return `${months} месяцев`;
}

export function calculateDecisionSafeSpending(state: DecisionCoreState) {
  return calculateSafeSpending({
    availableNow: state.moneySetup.useHouseholdBalance ? state.balances.all : state.balances.me,
    moneySetup: state.moneySetup,
    confirmedTransactions: state.transactions.filter((transaction) => transaction.confirmed !== false),
    recurringTransactions: state.recurringTransactions,
    categoryBudgets: state.categoryBudgets,
    categories: state.categories,
    today: state.today,
  });
}

export function buildSafeUntil(ctx: DecisionCoreContext): DecisionSafeUntil {
  const { locale, moneySetup, safeSpending, forecast } = ctx;
  const constraintPoint = getConstraintPoint(ctx);
  const confidence = getForecastConfidence(
    ctx,
    constraintPoint?.date ?? forecast.horizonEndDate,
  );
  const nextIncomeEvent =
    forecast.events.find((event) => event.amount > 0) ?? null;
  const nextIncomeDate = nextIncomeEvent?.date ?? forecast.nextIncomeDate;
  const nextIncomeTitle = nextIncomeEvent?.title ?? null;
  const nextIncomeAmount = nextIncomeEvent?.amount ?? null;
  const horizonMonths = forecast.horizonMonths ?? ctx.forecastHorizonMonths;

  if (!Number.isFinite(ctx.availableNow) || ctx.availableNow <= 0) {
    return {
      status: "constraint_found",
      title: locale === "ru" ? "Дефицит уже начался" : "Deficit already started",
      note:
        locale === "ru"
          ? "Прогнозная линия уже стартует ниже безопасного уровня."
          : "The forecast line already starts below a safe level.",
      isReady: true,
      needsSetup: false,
      rawStatus: "missing_balance",
      safeToday: 0,
      nextIncomeDate,
      nextIncomeTitle,
      nextIncomeAmount,
      horizonEndDate: forecast.horizonEndDate,
      horizonMonths,
      confidence: "uncertain",
      confidenceNote: null,
    };
  }

  if (!forecast.nextIncomeDate && safeSpending.status === "missing_income") {
    return {
      status: "unknown",
      title: locale === "ru" ? "Доход не указан" : "Income is missing",
      note:
        locale === "ru"
          ? "Без даты ближайшего дохода прогноз нельзя считать надёжным."
          : "Without the next income date the forecast is not reliable enough.",
      isReady: false,
      needsSetup: true,
      rawStatus: "missing_income",
      safeToday: null,
      nextIncomeDate: null,
      nextIncomeTitle: null,
      nextIncomeAmount: null,
      horizonEndDate: forecast.horizonEndDate,
      horizonMonths,
      confidence: "uncertain",
      confidenceNote: null,
    };
  }

  if (!forecast.nextIncomeDate && safeSpending.status === "unconfirmed_income") {
    return {
      status: "unknown",
      title: locale === "ru" ? "Доход не подтверждён" : "Income is not confirmed",
      note:
        locale === "ru"
          ? "Плановая дата дохода уже наступила, но поступление не записано, поэтому прогноз его не учитывает."
          : "The planned income date has already arrived, but the receipt was not recorded, so the forecast does not count it.",
      isReady: false,
      needsSetup: true,
      rawStatus: "unconfirmed_income",
      safeToday: null,
      nextIncomeDate: null,
      nextIncomeTitle: null,
      nextIncomeAmount: null,
      horizonEndDate: forecast.horizonEndDate,
      horizonMonths,
      confidence: "uncertain",
      confidenceNote: null,
    };
  }

  if (constraintPoint?.kind === "deficit") {
    const deficitDays = Math.max(
      0,
      (daysInclusiveUntilDate(constraintPoint.event.date, ctx.today) ?? 1) - 1,
    );

    return {
      status: "constraint_found",
      title:
        locale === "ru"
          ? `Дефицит через ${deficitDays} ${deficitDays === 1 ? "день" : deficitDays >= 2 && deficitDays <= 4 ? "дня" : "дней"}`
          : `Deficit in ${deficitDays} day${deficitDays === 1 ? "" : "s"}`,
      note:
        locale === "ru"
          ? `По прогнозной линии баланс уйдёт в минус ${formatDayMonth(constraintPoint.event.date, locale)}.`
          : `The forecast balance turns negative on ${formatDayMonth(constraintPoint.event.date, locale)}.`,
      isReady: true,
      needsSetup: false,
      rawStatus: "ready",
      safeToday: 0,
      nextIncomeDate,
      nextIncomeTitle,
      nextIncomeAmount,
      horizonEndDate: forecast.horizonEndDate,
      horizonMonths,
      confidence: confidence.confidence,
      confidenceNote: confidence.note,
    };
  }

  if (constraintPoint?.kind === "reserve") {
    return {
      status: "constraint_found",
      title:
        locale === "ru"
          ? `До ${formatDayMonth(constraintPoint.event.date, locale)}`
          : `Until ${formatDayMonth(constraintPoint.event.date, locale)}`,
      note:
        locale === "ru"
          ? confidence.note
            ? `После этой даты свободных денег почти не останется. ${confidence.note}`
            : `После этой даты свободных денег почти не останется.`
          : `This is the first limiting point on the forecast line: after it the balance drops to the required floor.`,
      isReady: true,
      needsSetup: false,
      rawStatus: "ready",
      safeToday: Math.max(0, forecast.minBalance - constraintPoint.requiredFloor),
      nextIncomeDate,
      nextIncomeTitle,
      nextIncomeAmount,
      horizonEndDate: forecast.horizonEndDate,
      horizonMonths,
      confidence: confidence.confidence,
      confidenceNote: confidence.note,
    };
  }

  if (forecast.horizonEndDate) {
    return {
      status: "no_risk_in_horizon",
      title:
        locale === "ru"
          ? `На ближайшие ${formatHorizonLabel(horizonMonths, locale)} всё спокойно`
          : `All calm for the next ${formatHorizonLabel(horizonMonths, locale)}`,
      note:
        locale === "ru"
          ? `До ${formatDayMonth(forecast.horizonEndDate, locale)} дефицита не ожидается.${confidence.note ? ` ${confidence.note}` : ""}`
          : `No deficit is expected until ${formatDayMonth(forecast.horizonEndDate, locale)}.${confidence.note ? ` ${confidence.note}` : ""}`,
      isReady: true,
      needsSetup: false,
      rawStatus: "ready",
      safeToday: Math.max(0, forecast.minBalance),
      nextIncomeDate,
      nextIncomeTitle,
      nextIncomeAmount,
      horizonEndDate: forecast.horizonEndDate,
      horizonMonths,
      confidence: confidence.confidence,
      confidenceNote: confidence.note,
    };
  }

  if (safeSpending.status === "ready" && safeSpending.availableForDailySpending != null) {
    if (safeSpending.availableForDailySpending <= 0) {
      return {
        status: "constraint_found",
        title: locale === "ru" ? "Дефицит уже начался" : "Deficit already started",
        note:
          locale === "ru"
            ? "Сегодня лучше ограничиться только обязательным."
            : "Today is best kept to essentials only.",
        isReady: true,
        needsSetup: false,
        rawStatus: safeSpending.status,
        safeToday: safeSpending.safeToday,
        nextIncomeDate: safeSpending.nextIncomeDate,
        nextIncomeTitle,
        nextIncomeAmount,
        horizonEndDate: forecast.horizonEndDate,
        horizonMonths,
        confidence: confidence.confidence,
        confidenceNote: confidence.note,
      };
    }
  }

  if (safeSpending.nextIncomeDate || moneySetup.nextIncomeDate) {
    return {
      status: "unknown",
      title: locale === "ru" ? "До следующего дохода" : "Until the next income",
      note:
        locale === "ru"
          ? "Точной оценки пока нет, но период уже понятен."
          : "The period is known, but the estimate is still rough.",
      isReady: false,
      needsSetup: true,
      rawStatus: safeSpending.status,
      safeToday: safeSpending.safeToday,
      nextIncomeDate: safeSpending.nextIncomeDate,
      nextIncomeTitle,
      nextIncomeAmount,
      horizonEndDate: forecast.horizonEndDate,
      horizonMonths,
      confidence: confidence.confidence,
      confidenceNote: confidence.note,
    };
  }

  return {
    status: "unknown",
    title:
      locale === "ru"
        ? "Нужно уточнить финансовую базу"
        : "Financial base needs setup",
    note:
      locale === "ru"
        ? "Добавьте дату дохода и обязательные платежи."
        : "Add the next income date and required payments.",
    isReady: false,
    needsSetup: true,
    rawStatus: safeSpending.status,
    safeToday: safeSpending.safeToday,
    nextIncomeDate: safeSpending.nextIncomeDate,
    nextIncomeTitle,
    nextIncomeAmount,
    horizonEndDate: forecast.horizonEndDate,
    horizonMonths,
    confidence: "uncertain",
    confidenceNote: null,
  };
}

import { calculateSafeSpending } from "@/lib/safe-spending";
import { daysInclusiveUntilDate } from "@/lib/format-date";
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

  if (!Number.isFinite(ctx.availableNow) || ctx.availableNow <= 0) {
    return {
      title: locale === "ru" ? "Дефицит уже начался" : "Deficit already started",
      note:
        locale === "ru"
          ? "Прогнозная линия уже стартует ниже безопасного уровня."
          : "The forecast line already starts below a safe level.",
      isReady: true,
      needsSetup: false,
      rawStatus: "missing_balance",
      safeToday: 0,
      nextIncomeDate: forecast.nextIncomeDate,
    };
  }

  if (!forecast.nextIncomeDate && safeSpending.status === "missing_income") {
    return {
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
    };
  }

  if (!forecast.nextIncomeDate && safeSpending.status === "unconfirmed_income") {
    return {
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
    };
  }

  if (forecast.firstDeficitDate) {
    const deficitDays = Math.max(
      0,
      (daysInclusiveUntilDate(forecast.firstDeficitDate, ctx.today) ?? 1) - 1,
    );

    return {
      title:
        locale === "ru"
          ? `Дефицит через ${deficitDays} ${deficitDays === 1 ? "день" : deficitDays >= 2 && deficitDays <= 4 ? "дня" : "дней"}`
          : `Deficit in ${deficitDays} day${deficitDays === 1 ? "" : "s"}`,
      note:
        locale === "ru"
          ? `По прогнозной линии баланс уйдёт в минус ${formatDayMonth(forecast.firstDeficitDate, locale)}.`
          : `The forecast balance turns negative on ${formatDayMonth(forecast.firstDeficitDate, locale)}.`,
      isReady: true,
      needsSetup: false,
      rawStatus: "ready",
      safeToday: 0,
      nextIncomeDate: forecast.nextIncomeDate,
    };
  }

  if (forecast.nextIncomeDate) {
    return {
      title:
        locale === "ru"
          ? `До ${formatDayMonth(forecast.nextIncomeDate, locale)}`
          : `Until ${formatDayMonth(forecast.nextIncomeDate, locale)}`,
      note:
        locale === "ru"
          ? "Расчёт теперь опирается на прогнозную линию баланса до ближайшего дохода."
          : "This now uses the forecast balance line until the next income.",
      isReady: true,
      needsSetup: false,
      rawStatus: "ready",
      safeToday: Math.max(0, forecast.minBalance),
      nextIncomeDate: forecast.nextIncomeDate,
    };
  }

  if (safeSpending.status === "ready" && safeSpending.availableForDailySpending != null) {
    if (safeSpending.availableForDailySpending <= 0) {
      return {
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
      };
    }

    if (safeSpending.nextIncomeDate) {
      return {
        title:
          locale === "ru"
            ? `До ${formatDayMonth(safeSpending.nextIncomeDate, locale)}`
            : `Until ${formatDayMonth(safeSpending.nextIncomeDate, locale)}`,
        note:
          locale === "ru"
            ? "Расчёт опирается на ближайший доход."
            : "This is based on the next expected income.",
        isReady: true,
        needsSetup: false,
        rawStatus: safeSpending.status,
        safeToday: safeSpending.safeToday,
        nextIncomeDate: safeSpending.nextIncomeDate,
      };
    }
  }

  if (safeSpending.nextIncomeDate || moneySetup.nextIncomeDate) {
    return {
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
    };
  }

  return {
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
  };
}

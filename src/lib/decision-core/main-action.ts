import { daysInclusiveUntilDate } from "@/lib/format-date";
import { formatMoney } from "@/lib/format-money";
import { findForecastDayByDate, pickConstraintEventForDay } from "@/lib/decision-core/forecast-days";
import type {
  DecisionCoreContext,
  DecisionMainAction,
  DecisionNextRisk,
  PrimaryDecision,
} from "@/lib/decision-core/types";

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

function formatDayMonth(iso: string, locale: "ru" | "en"): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return iso;
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (locale === "en") return `${MONTHS_EN[monthIndex]} ${day}`;
  return `${day} ${MONTHS_RU[monthIndex]}`;
}

function rub(amount: number, locale: "ru" | "en") {
  return `${formatMoney(amount, locale)} ${locale === "ru" ? "₽" : "RUB"}`;
}

function nextRiskReason(ctx: DecisionCoreContext, nextRisk: DecisionNextRisk | null) {
  if (!nextRisk) return undefined;
  return (
    nextRisk.note ??
    (ctx.locale === "ru"
      ? "Это ближайший риск на прогнозной линии."
      : "This is the nearest risk on the forecast line.")
  );
}

function findFirstDeficitEventId(ctx: DecisionCoreContext, riskDate: string): string | null {
  const day = findForecastDayByDate(ctx.forecast, riskDate);
  return day ? (pickConstraintEventForDay(day)?.id ?? null) : null;
}

export function buildMainAction(
  decision: PrimaryDecision,
  ctx: DecisionCoreContext,
  nextRisk: DecisionNextRisk | null,
): DecisionMainAction {
  const { locale, forecast, confirmedTransactions } = ctx;

  switch (decision.type) {
    case "overdue_income_confirmation":
      return {
        type: "resolve_income_delay",
        title:
          locale === "ru"
            ? "Доход ещё не пришёл"
            : "Income has not arrived yet",
        text:
          locale === "ru"
            ? `${decision.title} ожидался на ${formatDayMonth(decision.dueDate, locale)}: ${rub(decision.amount, locale)}.`
            : `${decision.title} was expected on ${formatDayMonth(decision.dueDate, locale)}: ${rub(decision.amount, locale)}.`,
        description:
          locale === "ru"
            ? `Ожидался ${formatDayMonth(decision.dueDate, locale)}.`
            : `It was expected on ${formatDayMonth(decision.dueDate, locale)}.`,
        reason:
          locale === "ru"
            ? "Если деньги уже пришли, отметьте это. Если нет, перенесите дату или отмените только это ожидание."
            : "If the money has arrived, confirm it. Otherwise move the date or cancel only this expected occurrence.",
        amount: decision.amount,
        dueDate: decision.dueDate,
        relatedEntityId: decision.incomeSourceId,
        priority: "high",
        command: {
          type: "confirm_income_source",
          incomeSourceId: decision.incomeSourceId,
          incomeTitle: decision.title,
          plannedDate: decision.dueDate,
          plannedAmount: decision.amount,
          status: "overdue_unconfirmed",
        },
      };
    case "income_due_today":
      return {
        type: "confirm_income",
        title:
          locale === "ru"
            ? "Сегодня ожидается доход"
            : "Income is expected today",
        text:
          locale === "ru"
            ? `${decision.title} должен прийти сегодня: ${rub(decision.amount, locale)}.`
            : `Confirm the ${decision.title} receipt — ${rub(decision.amount, locale)}.`,
        description:
          locale === "ru"
            ? decision.title
            : decision.title,
        reason:
          locale === "ru"
            ? "Когда деньги придут, отметьте это. Если не придут, можно перенести дату или отменить только это ожидание."
            : "The forecast already includes this income as planned, but the current balance does not.",
        amount: decision.amount,
        dueDate: decision.dueDate,
        relatedEntityId: decision.incomeSourceId,
        priority: "high",
        command: {
          type: "confirm_income_source",
          incomeSourceId: decision.incomeSourceId,
          incomeTitle: decision.title,
          plannedDate: decision.dueDate,
          plannedAmount: decision.amount,
          status: "due_today",
        },
      };
    case "overdue_payment":
      return {
        type: "pay_overdue",
        title:
          locale === "ru"
            ? `Оплатите ${decision.title.toLowerCase()}`
            : `Pay ${decision.title}`,
        text:
          locale === "ru"
            ? `Оплатите ${decision.title.toLowerCase()} — ${rub(decision.amount, locale)}.`
            : `Pay ${decision.title} — ${rub(decision.amount, locale)}.`,
        description:
          locale === "ru"
            ? `Просрочено с ${formatDayMonth(decision.dueDate, locale)}.`
            : `This payment has been overdue since ${formatDayMonth(decision.dueDate, locale)}.`,
        reason:
          locale === "ru"
            ? "Просроченный обязательный платёж имеет высший приоритет."
            : "An overdue required payment has the highest priority.",
        amount: decision.amount,
        dueDate: decision.dueDate,
        relatedEntityId: decision.paymentId,
        priority: "critical",
        command: {
          type: "confirm_payment",
          paymentId: decision.paymentId,
        },
      };
    case "payment_today":
      return {
        type: "pay_today",
        title:
          locale === "ru"
            ? `Оплатите ${decision.title.toLowerCase()}`
            : `Pay ${decision.title}`,
        text:
          locale === "ru"
            ? `Оплатите ${decision.title.toLowerCase()} — ${rub(decision.amount, locale)} сегодня.`
            : `Pay ${decision.title} — ${rub(decision.amount, locale)} today.`,
        description:
          locale === "ru"
            ? "Срок — сегодня."
            : "Due today.",
        reason:
          locale === "ru"
            ? "На сегодня есть обязательный платёж."
            : "There is a required payment due today.",
        amount: decision.amount,
        dueDate: decision.dueDate,
        relatedEntityId: decision.paymentId,
        priority: "high",
        command: {
          type: "confirm_payment",
          paymentId: decision.paymentId,
        },
      };
    case "current_deficit":
      return {
        type: "cover_deficit",
        title:
          locale === "ru"
            ? "Закройте дефицит"
            : "Cover the deficit",
        text:
          locale === "ru"
            ? `Нужно закрыть дефицит ${rub(decision.amount, locale)}.`
            : `You need to cover a ${rub(decision.amount, locale)} deficit.`,
        description:
          locale === "ru"
            ? "Баланс уже ушёл в минус или делает это сегодня."
            : "The balance is already negative or turns negative today.",
        reason:
          locale === "ru"
            ? "Пока дефицит не закрыт, остальные рекомендации вторичны."
            : "Until the deficit is covered, every other recommendation is secondary.",
        amount: decision.amount,
        dueDate: ctx.today,
        priority: "critical",
        command: {
          type: "open_forecast",
          focusDate: forecast.firstDeficitDate ?? ctx.today,
          reason: "current_deficit",
          eventId: forecast.firstDeficitDate
            ? findFirstDeficitEventId(ctx, forecast.firstDeficitDate)
            : null,
        },
      };
    case "future_deficit": {
      const daysUntilDeficit = Math.max(
        0,
        (daysInclusiveUntilDate(decision.riskDate, ctx.today) ?? 1) - 1,
      );
      return {
        type: "cover_deficit",
        title:
          locale === "ru"
            ? "Подготовьте резерв"
            : "Prepare a buffer",
        text:
          locale === "ru"
            ? `Найдите или высвободите ${rub(decision.amount, locale)} до ${formatDayMonth(decision.riskDate, locale)}.`
            : `Find or free up ${rub(decision.amount, locale)} by ${formatDayMonth(decision.riskDate, locale)}.`,
        description:
          locale === "ru"
            ? `${formatDayMonth(decision.riskDate, locale)} возможен дефицит.`
            : `Without this, the forecast turns negative in ${daysUntilDeficit} day${daysUntilDeficit === 1 ? "" : "s"}.`,
        reason: nextRiskReason(ctx, nextRisk),
        amount: decision.amount,
        dueDate: decision.riskDate,
        relatedEntityId: decision.title ?? null,
        priority: "high",
        command: {
          type: "open_forecast",
          focusDate: decision.riskDate,
          reason: "future_deficit",
          eventId:
            nextRisk?.date === decision.riskDate
              ? (nextRisk.eventId ?? findFirstDeficitEventId(ctx, decision.riskDate))
              : findFirstDeficitEventId(ctx, decision.riskDate),
        },
      };
    }
    case "reserve_required":
      return {
        type: "reserve_for_risk",
        title:
          locale === "ru"
            ? "Сохраните резерв"
            : "Keep the reserve",
        text:
          locale === "ru"
            ? decision.amount > 0
              ? `Сохраните минимум ${rub(decision.amount, locale)} до ${formatDayMonth(decision.dueDate, locale)}.`
              : `Не добавляйте новые траты до ${formatDayMonth(decision.dueDate, locale)}.`
            : decision.amount > 0
              ? `Keep at least ${rub(decision.amount, locale)} until ${formatDayMonth(decision.dueDate, locale)}.`
              : `Do not add new spending before ${formatDayMonth(decision.dueDate, locale)}.`,
        description:
          locale === "ru"
            ? `До ${formatDayMonth(decision.dueDate, locale)} запас денег станет минимальным.`
            : "This is the nearest point where your cash buffer becomes minimal.",
        reason: nextRiskReason(ctx, nextRisk),
        amount: decision.amount > 0 ? decision.amount : null,
        dueDate: decision.dueDate,
        relatedEntityId: decision.title ?? null,
        priority: "medium",
        command: {
          type: "open_forecast",
          focusDate: decision.dueDate,
          reason: "reserve_required",
          eventId: nextRisk?.date === decision.dueDate ? (nextRisk.eventId ?? null) : null,
        },
      };
    case "missing_data": {
      const missingBalance = decision.missing.includes("balance");
      const missingIncome = decision.missing.includes("income");
      const missingExpenses =
        decision.missing.includes("required_expenses") ||
        decision.missing.includes("essential_budgets");

      if (missingBalance) {
        return {
          type: "complete_balance_setup",
          title:
            locale === "ru"
              ? "Укажите, сколько денег сейчас"
              : "Set your current balance",
          text:
            locale === "ru"
              ? "Укажите текущий остаток."
              : "Enter your current balance.",
          description:
            locale === "ru"
              ? "Это отправная точка для прогноза."
              : "This is the starting point for the forecast.",
          reason:
            locale === "ru"
              ? "Без текущего остатка нельзя честно посчитать, сколько денег у вас сейчас."
              : "Without the current balance, the app cannot honestly calculate what you have right now.",
          priority: "high",
          command: {
            type: "open_money_setup",
            scope: "balance",
          },
        };
      }

      if (missingIncome) {
        return {
          type: "complete_income_setup",
          title: locale === "ru" ? "Добавьте ближайший доход" : "Add the next income",
          text:
            locale === "ru"
              ? "Добавьте дату и сумму ближайшего дохода."
              : "Add the date and amount of the next income.",
          description:
            locale === "ru"
              ? "Без этого прогноз не может честно ответить, на сколько хватит денег."
              : "Without it, the forecast cannot honestly say how long your money lasts.",
          reason:
            locale === "ru"
              ? "Сейчас системе не хватает ключевых данных о поступлениях."
              : "The system is missing essential income data.",
          priority: "high",
          command: {
            type: "open_money_setup",
            scope: "income",
          },
        };
      }

      if (missingExpenses) {
        const missingRequiredExpenses = decision.missing.includes("required_expenses");
        const missingEssentialBudgets = decision.missing.includes("essential_budgets");
        return {
          type: "complete_required_expenses_setup",
          title:
            missingRequiredExpenses
              ? locale === "ru"
                ? "Добавьте обязательные платежи"
                : "Add required payments"
              : locale === "ru"
                ? "Настройте базовые траты"
                : "Set essential spending",
          text:
            missingRequiredExpenses && missingEssentialBudgets
              ? locale === "ru"
                ? "Добавьте обязательные платежи и базовые категории расходов."
                : "Add required payments and essential spending categories."
              : missingRequiredExpenses
                ? locale === "ru"
                  ? "Добавьте обязательные платежи, чтобы прогноз не пропускал фиксированные расходы."
                  : "Add required payments so the forecast does not miss fixed expenses."
                : locale === "ru"
                  ? "Отметьте базовые категории расходов и их лимиты."
                  : "Mark essential spending categories and their limits.",
          description:
            locale === "ru"
              ? "Иначе прогноз может показывать ложную уверенность."
              : "Otherwise the forecast may show false confidence.",
          reason:
            missingRequiredExpenses
              ? locale === "ru"
                ? "Сейчас не хватает данных об обязательных расходах."
                : "Required expense data is incomplete."
              : locale === "ru"
                ? "Сейчас не хватает данных о базовых тратах периода."
                : "Essential spending data for this period is incomplete.",
          priority: "medium",
          command: {
            type: "open_money_setup",
            scope: missingRequiredExpenses ? "required_expenses" : "essential_budgets",
          },
        };
      }

      return {
        type: "add_first_entry",
        title:
          locale === "ru"
            ? "Добавьте первую операцию"
            : "Add the first entry",
        text:
          locale === "ru"
            ? "Добавьте стартовый остаток, доход или обязательный платёж."
            : "Add your starting balance, income, or a required payment.",
        description:
          locale === "ru"
            ? "Пока данных мало, поэтому решение дня ненадёжно."
            : "There is not enough data yet for a reliable daily decision.",
        reason:
          locale === "ru"
            ? "Без истории приложение не должно притворяться уверенным."
            : "Without history the app should not pretend to be confident.",
        priority: "medium",
        command: {
          type: "add_transaction",
        },
      };
    }
    case "no_urgent_action": {
      const freeToday = Math.max(0, Math.round(forecast.minBalance));
      const dueDate = nextRisk?.date ?? forecast.horizonEndDate ?? null;
      return {
        type: "hold",
        title:
          locale === "ru"
            ? "Срочных действий нет"
            : "No urgent action",
        text:
          locale === "ru"
            ? freeToday > 0
              ? `Сегодня обязательных действий нет. Сохраните резерв ${rub(freeToday, locale)} до следующего значимого события.`
              : "Сегодня обязательных действий нет. Просто не добавляйте новые обязательства."
            : freeToday > 0
              ? `There are no urgent actions today. Keep a ${rub(freeToday, locale)} buffer until the next important event.`
              : "There are no urgent actions today. Just avoid taking on new obligations.",
        description:
          locale === "ru"
            ? "Прогноз остаётся устойчивым на известном горизонте."
            : "The forecast remains stable on the known horizon.",
        reason:
          confirmedTransactions.length === 0
            ? locale === "ru"
              ? "Пока истории мало, но известных срочных рисков система не видит."
              : "History is still limited, but the system sees no known urgent risks."
            : locale === "ru"
              ? "Система не нашла обязательного шага сильнее, чем сохранение резерва."
              : "The system found no action more important than preserving your buffer.",
        amount: freeToday > 0 ? freeToday : null,
        dueDate,
        priority: "low",
        command: {
          type: "none",
        },
      };
    }
  }
}

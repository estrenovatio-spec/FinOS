import { getMainActionButtonLabel } from "@/components/today/main-action-resolver";
import { formatIsoDate } from "@/lib/format-date";
import type { MoneySetup } from "@/lib/money-setup";
import type {
  DecisionCoreResult,
  DecisionMainAction,
  DecisionTodayPayment,
} from "@/lib/decision-core/types";
import { formatMoney } from "@/lib/format-money";
import type { FreeMoneyView, PlannedFreeMoneyView } from "@/lib/free-money";
import type { Locale } from "@/types";

type TodayStatusTone = "calm" | "risk" | "action" | "setup";

export type TodayHeroView = {
  statusLabel: string;
  tone: TodayStatusTone;
  title: string;
  amount: string | null;
  due: string | null;
  reason: string | null;
  ctaLabel: string | null;
  isEmptyState: boolean;
};

export type TodayOverviewItem = {
  id: string;
  label: string;
  value: string;
  subtitle?: string | null;
  caption?: string | null;
  actionLabel?: string | null;
  actionKey?: "edit_current_balance" | null;
  layout?: "default" | "wide";
  details?: Array<{
    label: string;
    value: string;
    tone?: "positive" | "negative" | "neutral" | "total";
  }> | null;
};

export type TodayPaymentsView = {
  title: string;
  items: DecisionTodayPayment[];
};

export type TodaySecondaryInsightView = {
  title: string;
  value: string;
  caption?: string | null;
};

export type TodayScreenView = {
  hero: TodayHeroView;
  overviewTitle: string;
  overviewItems: TodayOverviewItem[];
  payments: TodayPaymentsView | null;
  avoid: TodaySecondaryInsightView | null;
  peaceIndex: TodaySecondaryInsightView | null;
  hiddenPrimaryPaymentId: string | null;
  showQuickAddHint: boolean;
};

type TodayPresentationInput = {
  decision: DecisionCoreResult;
  locale: Locale;
  transactionCount: number;
  moneySetup: MoneySetup;
  balances: {
    all: number;
    me: number;
    partner: number;
  };
  freeMoney?: FreeMoneyView;
  plannedFreeMoney?: PlannedFreeMoneyView;
};

function formatDayMonth(iso: string | null | undefined, locale: Locale): string | null {
  return iso ? formatIsoDate(iso, locale) : null;
}

function rub(amount: number | null | undefined, locale: Locale): string | null {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
  return `${formatMoney(amount, locale)} ${locale === "ru" ? "₽" : "RUB"}`;
}

function moneyValue(amount: number | null | undefined, locale: Locale): string | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  return `${formatMoney(amount, locale)} ${locale === "ru" ? "₽" : "RUB"}`;
}

function hasAnyMoneySetup(setup: MoneySetup): boolean {
  return Boolean(
    setup.nextIncomeDate ||
      setup.expectedIncomeAmount ||
      setup.incomeSources.length > 0 ||
      setup.requiredRecurringIds.length > 0 ||
      setup.hasNoRequiredFixedExpenses ||
      setup.essentialCategoryIds.length > 0,
  );
}

export function isTodayZeroState(input: TodayPresentationInput): boolean {
  const { decision, transactionCount, moneySetup, balances } = input;
  return (
    transactionCount === 0 &&
    !decision.hasHistory &&
    !hasAnyMoneySetup(moneySetup) &&
    balances.all <= 0 &&
    balances.me <= 0 &&
    balances.partner <= 0
  );
}

function getHeroStatusLabel(
  decision: DecisionCoreResult,
  locale: Locale,
  emptyState: boolean,
): { label: string; tone: TodayStatusTone } {
  if (emptyState) {
    return {
      label: locale === "ru" ? "Нужен старт" : "Needs setup",
      tone: "setup",
    };
  }

  if (decision.mainAction.type === "complete_income_setup") {
    return {
      label: locale === "ru" ? "Нужны данные" : "Data needed",
      tone: "setup",
    };
  }

  if (decision.status.key === "calm") {
    return {
      label: locale === "ru" ? "Всё спокойно" : "All calm",
      tone: "calm",
    };
  }

  if (decision.status.key === "risk") {
    return {
      label: locale === "ru" ? "Есть риск" : "There is risk",
      tone: "risk",
    };
  }

  return {
    label: locale === "ru" ? "Требует внимания" : "Needs action",
    tone: "action",
  };
}

function buildHeroTitle(mainAction: DecisionMainAction, locale: Locale): string {
  switch (mainAction.type) {
    case "cover_deficit":
      if (mainAction.command.type === "open_forecast" && mainAction.command.reason === "current_deficit") {
        return locale === "ru"
          ? "Сейчас денег не хватает"
          : "You do not have enough money right now";
      }
      return mainAction.dueDate
        ? locale === "ru"
          ? `${formatDayMonth(mainAction.dueDate, locale)} денег может не хватить`
          : `Money may run short on ${formatDayMonth(mainAction.dueDate, locale)}`
        : locale === "ru"
          ? "Сейчас денег не хватает"
          : "You do not have enough money right now";
    case "reserve_for_risk":
      return locale === "ru" ? "Лучше оставить" : "Better to keep";
    case "confirm_income":
      return locale === "ru" ? "Сегодня ожидается доход" : "Income is expected today";
    case "resolve_income_delay":
      return locale === "ru" ? "Доход не подтверждён" : "Income is not confirmed";
    case "complete_balance_setup":
      return locale === "ru" ? "Укажите, сколько денег сейчас" : "Set your current balance";
    case "complete_required_expenses_setup":
      return mainAction.title;
    case "hold":
      return locale === "ru" ? "Сегодня всё спокойно" : "Today is calm";
    default:
      return mainAction.title;
  }
}

function buildHeroSafeUntilDue(decision: DecisionCoreResult, locale: Locale): string | null {
  const title = decision.safeUntil.title?.trim();
  if (!title) return null;

  if (decision.safeUntil.status === "no_risk_in_horizon") {
    if (locale === "ru") {
      return title;
    }
    return title;
  }

  if (locale === "ru") {
    if (title.startsWith("До ")) {
      return decision.safeUntil.confidence === "confirmed"
        ? `Денег хватает до ${title.slice(3)}`
        : `По плану денег хватает до ${title.slice(3)}`;
    }
    return title;
  }

  if (title.startsWith("Until ")) {
    return `Your money lasts until ${title.slice(6)}`;
  }

  return title;
}

function buildHeroDue(decision: DecisionCoreResult, locale: Locale): string | null {
  const { mainAction } = decision;
  switch (mainAction.type) {
    case "pay_overdue":
      return mainAction.dueDate
        ? locale === "ru"
          ? `Просрочено с ${formatDayMonth(mainAction.dueDate, locale)}`
          : `Overdue since ${formatDayMonth(mainAction.dueDate, locale)}`
        : null;
    case "pay_today":
      return locale === "ru" ? "Срок — сегодня" : "Due today";
    case "cover_deficit":
      if (!mainAction.dueDate) {
        return locale === "ru"
          ? null
          : null;
      }
      return null;
    case "reserve_for_risk":
      return mainAction.dueDate
        ? locale === "ru"
          ? `До ${formatDayMonth(mainAction.dueDate, locale)}`
          : `Until ${formatDayMonth(mainAction.dueDate, locale)}`
        : null;
    case "confirm_income":
      return mainAction.description ?? null;
    case "resolve_income_delay":
      return mainAction.dueDate
        ? locale === "ru"
          ? `Ожидался ${formatDayMonth(mainAction.dueDate, locale)}`
          : `Was expected on ${formatDayMonth(mainAction.dueDate, locale)}`
        : null;
    case "hold":
      return buildHeroSafeUntilDue(decision, locale);
    default:
      return null;
  }
}

function buildHeroReason(
  decision: DecisionCoreResult,
  locale: Locale,
  currentBalanceKnown: boolean,
): string | null {
  const { mainAction } = decision;
  switch (mainAction.type) {
    case "pay_overdue":
      return locale === "ru"
        ? "Этот платёж уже должен был быть оплачен."
        : "This payment should already have been paid.";
    case "pay_today":
      return locale === "ru"
        ? "После оплаты прогноз пересчитается автоматически."
        : "The forecast will recalculate after payment.";
    case "cover_deficit":
      if (mainAction.command.type === "open_forecast" && mainAction.command.reason === "current_deficit") {
        return locale === "ru"
          ? "Посмотрите, какие поступления и платежи влияют на остаток."
          : "See which incomes and payments are affecting your balance.";
      }
      return locale === "ru"
        ? "После ближайших платежей баланс уйдёт в минус."
        : "After the nearest payments, the balance turns negative.";
    case "reserve_for_risk":
      return decision.nextRisk?.title
        ? locale === "ru"
          ? `После ${decision.nextRisk.title.toLocaleLowerCase("ru-RU")} свободных денег почти не останется.`
          : `After ${decision.nextRisk.title}, almost no free money remains.`
        : locale === "ru"
          ? "До ближайшего обязательства эту сумму лучше не трогать."
          : "It is better not to touch this money before the next obligation.";
    case "confirm_income":
      return locale === "ru"
        ? "Прогноз уже учитывает этот доход как план, но текущий баланс его пока не включает."
        : "The forecast already counts this income as planned, but the current balance does not include it yet.";
    case "resolve_income_delay":
      return locale === "ru"
        ? "Прогноз всё ещё опирается на этот доход как на план. Подтвердите факт или измените дату."
        : "The forecast still relies on this income as planned. Confirm it or move the date.";
    case "complete_balance_setup":
      return locale === "ru"
        ? "Это отправная точка для прогноза."
        : "This is the starting point for the forecast.";
    case "complete_income_setup":
      return locale === "ru"
        ? "Без даты поступления нельзя точно сказать, сколько можно потратить."
        : "Without the next income date, the app cannot tell how much you can safely spend.";
    case "complete_required_expenses_setup":
      return mainAction.reason ?? null;
    case "add_first_entry":
      return currentBalanceKnown
        ? locale === "ru"
          ? "Добавьте доход или обязательный платёж, чтобы прогноз стал полезным."
          : "Add income or a required payment so the forecast becomes useful."
        : locale === "ru"
          ? "Сначала укажите текущий остаток."
          : "Start with your current balance.";
    case "hold":
      if (decision.safeUntil.status === "no_risk_in_horizon") {
        return decision.safeUntil.note;
      }
      return locale === "ru"
        ? "Можно спокойно заниматься обычными делами."
        : "You can go about your day calmly.";
    default:
      return mainAction.reason ?? mainAction.description ?? null;
  }
}

function getCurrentBalance(input: TodayPresentationInput): number | null {
  const currentBalance = input.moneySetup.useHouseholdBalance
    ? input.balances.all
    : input.balances.me;
  if (!Number.isFinite(currentBalance) || currentBalance === 0) return null;
  return currentBalance;
}

function buildHero(input: TodayPresentationInput): TodayHeroView {
  const { decision, locale } = input;
  const emptyState = isTodayZeroState(input);
  const status = getHeroStatusLabel(decision, locale, emptyState);
  const currentBalance = getCurrentBalance(input);

  if (emptyState) {
    return {
      statusLabel: status.label,
      tone: status.tone,
      title:
        locale === "ru"
          ? "Укажите, сколько денег сейчас"
          : "Set your current balance",
      amount: null,
      due: null,
      reason:
        locale === "ru"
          ? "Это отправная точка для прогноза."
          : "This is the starting point for the forecast.",
      ctaLabel: locale === "ru" ? "Указать остаток" : "Set balance",
      isEmptyState: true,
    };
  }

  return {
    statusLabel: status.label,
    tone: status.tone,
    title: buildHeroTitle(decision.mainAction, locale),
    amount: rub(decision.mainAction.amount ?? null, locale),
    due: buildHeroDue(decision, locale),
    reason: buildHeroReason(decision, locale, currentBalance != null),
    ctaLabel: getMainActionButtonLabel(decision.mainAction.command, locale),
    isEmptyState: false,
  };
}

function buildCurrentBalanceItem(input: TodayPresentationInput): TodayOverviewItem {
  const { locale } = input;
  const currentBalance = getCurrentBalance(input);
  return {
    id: "current-balance",
    label: locale === "ru" ? "Сейчас в кошельке" : "Available now",
    value:
      currentBalance == null
        ? locale === "ru"
          ? "Текущий остаток не указан"
          : "Current balance is not set"
        : (moneyValue(currentBalance, locale) ?? ""),
    caption:
      currentBalance == null
        ? locale === "ru"
          ? "Укажите остаток, чтобы прогноз стал честным."
          : "Add your balance so the forecast can be reliable."
        : locale === "ru"
          ? "От этой суммы строится прогноз."
          : "The forecast starts from this amount.",
    actionLabel: locale === "ru" ? "Изменить" : "Edit",
    actionKey: "edit_current_balance",
  };
}

function buildPlannedFreeMoneyItem(
  locale: Locale,
  plannedFreeMoney?: PlannedFreeMoneyView,
): TodayOverviewItem | null {
  if (!plannedFreeMoney || plannedFreeMoney.amount == null || !plannedFreeMoney.periodEndDate) {
    return null;
  }

  return {
    id: "planned-free-money",
    label: locale === "ru" ? "По плану свободно" : "Planned free money",
    subtitle:
      locale === "ru"
        ? `до ${formatDayMonth(plannedFreeMoney.periodEndDate, locale)}`
        : `until ${formatDayMonth(plannedFreeMoney.periodEndDate, locale)}`,
    value: rub(plannedFreeMoney.amount, locale) ?? (locale === "ru" ? "0 ₽" : "0 RUB"),
    caption:
      locale === "ru"
        ? plannedFreeMoney.includesUnconfirmedIncome
          ? "После всех платежей и базовых расходов, если регулярные доходы придут по плану. Поступление ещё не подтверждено."
          : "После всех платежей и базовых расходов, если регулярные доходы придут по плану."
        : plannedFreeMoney.includesUnconfirmedIncome
          ? "After all payments and planned essentials, if recurring income arrives as planned. The income is not confirmed yet."
          : "After all payments and planned essentials, if recurring income arrives as planned.",
    layout: "wide",
    details: plannedFreeMoney.breakdown
      ? [
          {
            label: locale === "ru" ? "Сейчас в кошельке" : "Available now",
            value: moneyValue(plannedFreeMoney.breakdown.currentActualBalance, locale) ?? "",
            tone: "neutral",
          },
          {
            label: locale === "ru" ? "Регулярные доходы" : "Recurring income",
            value: `+${moneyValue(plannedFreeMoney.breakdown.expectedRecurringIncome, locale) ?? ""}`,
            tone: "positive",
          },
          {
            label: locale === "ru" ? "Обязательные платежи" : "Required payments",
            value: `-${moneyValue(plannedFreeMoney.breakdown.mandatoryPayments, locale) ?? ""}`,
            tone: "negative",
          },
          {
            label: locale === "ru" ? "Плановые базовые траты" : "Planned essentials",
            value: `-${moneyValue(plannedFreeMoney.breakdown.essentialPlannedSpending, locale) ?? ""}`,
            tone: "negative",
          },
          {
            label: locale === "ru" ? "Другие обязательные расходы" : "Other required spending",
            value: `-${moneyValue(plannedFreeMoney.breakdown.otherRequiredExpenses, locale) ?? ""}`,
            tone: "negative",
          },
          {
            label: locale === "ru" ? "По плану свободно" : "Planned free money",
            value: moneyValue(plannedFreeMoney.breakdown.plannedFreeMoney, locale) ?? "",
            tone: "total",
          },
        ]
      : null,
  };
}

function isAvoidDuplicate(mainAction: DecisionMainAction, text: string | null): boolean {
  if (!text) return true;
  if (mainAction.type === "reserve_for_risk") {
    return text.toLocaleLowerCase("ru-RU").includes("резерв");
  }
  if (mainAction.type === "complete_income_setup" || mainAction.type === "complete_balance_setup") {
    return true;
  }
  return false;
}

function buildOverview(input: TodayPresentationInput): {
  items: TodayOverviewItem[];
  hiddenPrimaryPaymentId: string | null;
  payments: TodayPaymentsView | null;
} {
  const { decision, locale } = input;
  if (isTodayZeroState(input)) {
    return {
      items: [buildCurrentBalanceItem(input)],
      hiddenPrimaryPaymentId: null,
      payments: null,
    };
  }
  const hiddenPrimaryPaymentId =
    decision.mainAction.command.type === "confirm_payment"
      ? decision.mainAction.command.paymentId
      : null;

  const remainingPayments = decision.todayPayments.filter(
    (payment) => payment.id !== hiddenPrimaryPaymentId,
  );
  const paymentsToSummarize =
    remainingPayments.length > 0 ? remainingPayments : decision.todayPayments;
  const items: TodayOverviewItem[] = [buildCurrentBalanceItem(input)];

  const plannedFreeMoneyItem = buildPlannedFreeMoneyItem(locale, input.plannedFreeMoney);
  if (plannedFreeMoneyItem) {
    items.push(plannedFreeMoneyItem);
  }

  return {
    items,
    hiddenPrimaryPaymentId,
    payments:
      remainingPayments.length > 0
        ? {
            title: locale === "ru" ? "Остальные платежи сегодня" : "Other payments today",
            items: remainingPayments,
          }
        : hiddenPrimaryPaymentId
          ? null
          : decision.todayPayments.length > 0
            ? {
                title: locale === "ru" ? "Платежи сегодня" : "Payments today",
                items: decision.todayPayments,
              }
            : null,
  };
}

export function buildTodayScreenView(input: TodayPresentationInput): TodayScreenView {
  const { decision, locale } = input;
  const hero = buildHero(input);
  const overview = buildOverview(input);
  const avoid =
    decision.avoid.text && !isAvoidDuplicate(decision.mainAction, decision.avoid.text)
      ? {
          title: locale === "ru" ? "Сегодня лучше не делать" : "Better not today",
          value: decision.avoid.text,
          caption: decision.avoid.reason ?? null,
        }
      : null;
  const peaceIndex =
    hero.isEmptyState
      ? null
      : {
          title:
            locale === "ru"
              ? `Индекс спокойствия: ${decision.peaceIndex.value} из 100`
              : `Peace index: ${decision.peaceIndex.value} of 100`,
          value: decision.peaceIndex.note,
          caption: null,
        };

  return {
    hero,
    overviewTitle: locale === "ru" ? "На сегодня" : "For today",
    overviewItems: overview.items,
    payments: overview.payments,
    avoid,
    peaceIndex,
    hiddenPrimaryPaymentId: overview.hiddenPrimaryPaymentId,
    showQuickAddHint: !hero.isEmptyState,
  };
}

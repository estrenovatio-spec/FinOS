import { getMainActionButtonLabel } from "@/components/today/main-action-resolver";
import { formatHumanDateLong, formatIsoDate, isoDateToLocalMiddayMs } from "@/lib/format-date";
import type { MoneySetup } from "@/lib/money-setup";
import type {
  DecisionCoreResult,
  DecisionMainAction,
  DecisionTodayPayment,
} from "@/lib/decision-core/types";
import { formatMoney } from "@/lib/format-money";
import type { FreeMoneyView, PlannedFreeMoneyView } from "@/lib/free-money";
import { buildPlannedFreeMoneySummary } from "@/lib/planned-free-money-presenter";
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
  secondaryCtaLabel: string | null;
  isEmptyState: boolean;
};

export type TodayOverviewItem = {
  id: string;
  label: string;
  value: string;
  subtitle?: string | null;
  valueNote?: string | null;
  caption?: string | null;
  dismissibleCaption?: boolean;
  actionLabel?: string | null;
  actionKey?:
    | "edit_current_balance"
    | "add_transaction"
    | "open_financial_plan_menu"
    | null;
  actionVariant?: "ghost" | "primary" | "highlight" | null;
  secondaryActionLabel?: string | null;
  secondaryActionKey?:
    | "edit_current_balance"
    | "add_transaction"
    | "open_financial_plan_menu"
    | null;
  secondaryActionVariant?: "ghost" | "outline" | null;
  layout?: "default" | "wide";
  details?: Array<{
    label: string;
    value: string;
    tone?: "positive" | "negative" | "neutral" | "total";
  }> | null;
};

export type TodayCompactAlertView = {
  title: string;
  reason: string;
  ctaLabel: string;
};

export type TodayPaymentsView = {
  title: string;
  items: DecisionTodayPayment[];
};

export type TodayScreenView = {
  hero: TodayHeroView;
  compactAlert: TodayCompactAlertView | null;
  overviewTitle: string | null;
  overviewItems: TodayOverviewItem[];
  payments: TodayPaymentsView | null;
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

function differenceInCalendarDays(fromIso: string, toIso: string): number | null {
  const fromMs = isoDateToLocalMiddayMs(fromIso);
  const toMs = isoDateToLocalMiddayMs(toIso);
  if (fromMs == null || toMs == null) return null;
  return Math.round((toMs - fromMs) / (24 * 60 * 60 * 1000));
}

function formatRiskDayMonth(dateStr: string, locale: Locale): string {
  const full = formatHumanDateLong(dateStr, locale);
  if (locale === "ru") {
    return full.replace(/\s+\d{4}$/, "");
  }
  return full.replace(/,\s*\d{4}$/, "");
}

function hasAnyMoneySetup(setup: MoneySetup): boolean {
  return Boolean(
    setup.nextIncomeDate ||
      setup.expectedIncomeAmount ||
      setup.incomeSources.length > 0 ||
      setup.requiredRecurringIds.length > 0 ||
      setup.hasNoRequiredFixedExpenses ||
      setup.useHouseholdBalance,
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
      return locale === "ru" ? "Доход ещё не пришёл" : "Income has not arrived yet";
    case "complete_balance_setup":
      return locale === "ru" ? "Укажите, сколько денег сейчас" : "Set your current balance";
    case "complete_required_expenses_setup":
      return mainAction.title;
    case "hold":
      return locale === "ru" ? "Всё спокойно" : "All calm";
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
        ? "Мы всё ещё ждём эти деньги в плане. Если они не пришли, можно перенести дату или отменить только это ожидание."
        : "This income is still expected in the plan. If it has not arrived, move the date or cancel only this occurrence.";
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
      secondaryCtaLabel: null,
      isEmptyState: true,
    };
  }

  const showSkipAction =
    decision.mainAction.command.type === "confirm_payment" ||
    decision.mainAction.command.type === "confirm_income_source";

  return {
    statusLabel: status.label,
    tone: status.tone,
    title: buildHeroTitle(decision.mainAction, locale),
    amount:
      decision.mainAction.type === "pay_today" ||
      decision.mainAction.type === "pay_overdue" ||
      decision.mainAction.type === "confirm_income"
        ? rub(decision.mainAction.amount ?? null, locale)
        : null,
    due: buildHeroDue(decision, locale),
    reason: buildHeroReason(decision, locale, currentBalance != null),
    ctaLabel: getMainActionButtonLabel(decision.mainAction.command, locale),
    secondaryCtaLabel: showSkipAction
      ? locale === "ru"
        ? decision.mainAction.command.type === "confirm_income_source"
          ? "Не пришёл"
          : "Не оплатил"
        : decision.mainAction.command.type === "confirm_income_source"
          ? "Did not arrive"
          : "Not paid"
      : null,
    isEmptyState: false,
  };
}

export function shouldUseCompactRiskAlert(
  decision: DecisionCoreResult,
  todayIso: string,
): boolean {
  if (decision.mainAction.type !== "cover_deficit") return false;
  if (decision.mainAction.command.type !== "open_forecast") return false;
  if (decision.mainAction.command.reason === "current_deficit") return false;
  if (!decision.mainAction.dueDate) return false;

  const daysAway = differenceInCalendarDays(todayIso, decision.mainAction.dueDate);
  return daysAway != null && daysAway > 7;
}

export function buildCompactRiskAlert(
  decision: DecisionCoreResult,
  locale: Locale,
  todayIso: string,
): TodayCompactAlertView | null {
  if (!shouldUseCompactRiskAlert(decision, todayIso) || !decision.mainAction.dueDate) {
    return null;
  }

  return {
    title:
      locale === "ru"
        ? `Риск ${formatRiskDayMonth(decision.mainAction.dueDate, locale)}`
        : `Risk on ${formatRiskDayMonth(decision.mainAction.dueDate, locale)}`,
    reason:
      locale === "ru"
        ? "По текущему плану денег может не хватить."
        : "Based on the current plan, money may run short.",
    ctaLabel: locale === "ru" ? "Посмотреть прогноз →" : "View forecast →",
  };
}

function buildCurrentBalanceItem(input: TodayPresentationInput): TodayOverviewItem {
  const { locale } = input;
  const currentBalance = getCurrentBalance(input);
  return {
    id: "current-balance",
    label: locale === "ru" ? "Мои деньги сейчас" : "My money right now",
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
          ? "Это отправная точка вашего финансового плана. Здесь можно изменить баланс, доходы и обязательные платежи."
          : "This is the starting point of your financial plan. Here you can update your balance, income, and required payments.",
    dismissibleCaption: currentBalance != null,
    actionLabel: locale === "ru" ? "Настроить доходы" : "Set up income",
    actionKey: "edit_current_balance",
    actionVariant: "highlight",
  };
}

function buildPlannedFreeMoneyItem(
  input: TodayPresentationInput,
  locale: Locale,
  plannedFreeMoney?: PlannedFreeMoneyView,
): TodayOverviewItem | null {
  const summary = buildPlannedFreeMoneySummary(locale, plannedFreeMoney);
  if (!summary || !plannedFreeMoney) {
    return null;
  }
  const currentBalance = getCurrentBalance(input);
  const periodEnd = plannedFreeMoney.periodEndDate
    ? formatHumanDateLong(plannedFreeMoney.periodEndDate, locale)
    : null;
  const caption =
    currentBalance != null
      ? locale === "ru"
        ? `Баланс сейчас: ${moneyValue(currentBalance, locale)}. Учтены${plannedFreeMoney.expectedRecurringIncome > 0 || plannedFreeMoney.includesUnconfirmedIncome ? " ожидаемые доходы," : ""} платежи и лимиты.`
        : `Balance now: ${moneyValue(currentBalance, locale)}. Expected income, payments, and spending limits are included.`
      : summary.caption;

  const detailItems: TodayOverviewItem["details"] = plannedFreeMoney.breakdown
    ? [
        {
          label: locale === "ru" ? "Сейчас в кошельке" : "Available now",
          value: moneyValue(plannedFreeMoney.breakdown.currentActualBalance, locale) ?? "",
          tone: "neutral",
        },
        {
          label: locale === "ru" ? "Ожидаемые доходы" : "Expected income",
          value: `+${moneyValue(plannedFreeMoney.breakdown.expectedRecurringIncome, locale) ?? ""}`,
          tone: "positive",
        },
        {
          label: locale === "ru" ? "Регулярные платежи" : "Recurring payments",
          value: `-${moneyValue(plannedFreeMoney.breakdown.recurringPayments, locale) ?? ""}`,
          tone: "negative",
        },
        {
          label:
            locale === "ru"
              ? "Платежи по долгам"
              : "Debt payments",
          value: `-${moneyValue(plannedFreeMoney.breakdown.otherMandatoryPayments, locale) ?? ""}`,
          tone: "negative",
        },
        {
          label: locale === "ru" ? "Расходы по лимитам" : "Planned spending limits",
          value: `-${moneyValue(plannedFreeMoney.breakdown.essentialPlannedSpending, locale) ?? ""}`,
          tone: "negative",
        },
        ...(plannedFreeMoney.breakdown.otherRequiredExpenses > 0
          ? [
              {
                label:
                  locale === "ru"
                    ? "Прочие обязательные расходы"
                    : "Other required spending",
                value: `-${moneyValue(plannedFreeMoney.breakdown.otherRequiredExpenses, locale) ?? ""}`,
                tone: "negative" as const,
              },
            ]
          : []),
        {
          label: locale === "ru" ? "Останется свободно" : "Free after plan",
          value: moneyValue(plannedFreeMoney.breakdown.plannedFreeMoney, locale) ?? "",
          tone: "total",
        },
      ]
    : null;

  return {
    id: "planned-free-money",
    label: summary.label,
    subtitle: null,
    value: summary.value,
    valueNote:
      periodEnd
        ? locale === "ru"
          ? `До ${periodEnd}`
          : `Until ${periodEnd}`
        : summary.subtitle,
    caption,
    actionLabel: locale === "ru" ? "＋ Добавить операцию" : "+ Add entry",
    actionKey: "add_transaction",
    actionVariant: "primary",
    secondaryActionLabel:
      locale === "ru"
        ? "Настроить финансовый план"
        : "Set up financial plan",
    secondaryActionKey: "open_financial_plan_menu",
    secondaryActionVariant: "ghost",
    layout: "wide",
    details: detailItems,
  };
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
  const items: TodayOverviewItem[] = [];

  const plannedFreeMoneyItem = buildPlannedFreeMoneyItem(input, locale, input.plannedFreeMoney);
  if (plannedFreeMoneyItem) {
    items.push(plannedFreeMoneyItem);
  } else {
    items.push(buildCurrentBalanceItem(input));
  }

  return {
    items,
    hiddenPrimaryPaymentId,
    payments: decision.todayPayments.length > 0
      ? {
          title: locale === "ru" ? "Платежи на сегодня" : "Payments due today",
          items: decision.todayPayments,
        }
      : null,
  };
}

export function buildTodayScreenView(
  input: TodayPresentationInput,
  options?: { todayIso?: string },
): TodayScreenView {
  const { locale } = input;
  const hero = buildHero(input);
  const overview = buildOverview(input);
  const compactAlert = buildCompactRiskAlert(
    input.decision,
    locale,
    options?.todayIso ?? input.decision.mainAction.dueDate ?? "1970-01-01",
  );

  return {
    hero,
    compactAlert,
    overviewTitle: null,
    overviewItems: overview.items,
    payments: overview.payments,
    hiddenPrimaryPaymentId: overview.hiddenPrimaryPaymentId,
    showQuickAddHint: !hero.isEmptyState,
  };
}

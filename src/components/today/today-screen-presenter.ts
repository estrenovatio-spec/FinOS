import { getMainActionButtonLabel } from "@/components/today/main-action-resolver";
import type { MoneySetup } from "@/lib/money-setup";
import type { DailySafeSpendingView } from "@/lib/daily-safe-spending";
import type {
  DecisionAllowed,
  DecisionCoreResult,
  DecisionMainAction,
  DecisionTodayPayment,
} from "@/lib/decision-core/types";
import { formatMoney } from "@/lib/format-money";
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
  caption?: string | null;
  actionLabel?: string | null;
  actionKey?: "edit_current_balance" | null;
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
  dailySafeSpending?: DailySafeSpendingView;
};

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

function formatDayMonth(iso: string | null | undefined, locale: Locale): string | null {
  if (!iso) return null;
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return iso;
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (locale === "en") return `${MONTHS_EN[monthIndex]} ${day}`;
  return `${day} ${MONTHS_RU[monthIndex]}`;
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
      return locale === "ru" ? "Добавьте обязательные платежи" : "Add required payments";
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
      return locale === "ru"
        ? "Так будет понятно, какие деньги уже заняты обязательствами."
        : "This tells the app which money is already spoken for.";
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

function buildAllowedItem(
  allowed: DecisionAllowed,
  locale: Locale,
  dailySafeSpending?: DailySafeSpendingView,
): TodayOverviewItem {
  if (allowed.status === "available" && allowed.amount != null) {
    const remainingAmount =
      dailySafeSpending?.status === "available" &&
      dailySafeSpending.remainingAmount != null
        ? dailySafeSpending.remainingAmount
        : allowed.amount;
    const baseAmount =
      dailySafeSpending?.status === "available" && dailySafeSpending.baseAmount != null
        ? dailySafeSpending.baseAmount
        : allowed.amount;
    const spentToday =
      dailySafeSpending?.status === "available" && dailySafeSpending.spentToday != null
        ? dailySafeSpending.spentToday
        : 0;
    const remainingValue = rub(remainingAmount, locale) ?? "";
    const baseValue = rub(baseAmount, locale) ?? remainingValue;
    const spentCaption =
      spentToday > 0
        ? locale === "ru"
          ? `Из ${baseValue} на сегодня. Уже учтено расходов: ${rub(spentToday, locale)}.`
          : `From ${baseValue} for today. Already spent: ${rub(spentToday, locale)}.`
        : locale === "ru"
          ? `Из ${baseValue} на сегодня.`
          : `From ${baseValue} for today.`;
    return {
      id: "allowed",
      label: locale === "ru" ? "Можно потратить ещё" : "You can still spend",
      value: remainingValue,
      caption:
        locale === "ru"
          ? allowed.horizonDate
            ? `${spentCaption} ${allowed.confidence === "confirmed" ? "Остаток пересчитан" : "Остаток пока пересчитан по плану"} с учётом всех платежей до ${formatDayMonth(allowed.horizonDate, locale)}.${allowed.confidenceNote ? ` ${allowed.confidenceNote}` : ""}`
            : `${spentCaption} Сумма рассчитана с учётом известных обязательств.`
          : allowed.horizonDate
            ? `${spentCaption} Calculated with all payments until ${formatDayMonth(allowed.horizonDate, locale)}.`
            : `${spentCaption} Calculated with the known obligations.`,
    };
  }

  if (allowed.status === "restricted") {
    return {
      id: "allowed",
      label:
        locale === "ru"
          ? "Сегодня лучше не тратить лишнее"
          : "Better not to spend extra today",
      value:
        locale === "ru"
          ? "Свободные покупки лучше отложить"
          : "Free spending is better postponed",
      caption:
        locale === "ru"
          ? allowed.horizonDate
            ? `Эти деньги понадобятся до ${formatDayMonth(allowed.horizonDate, locale)}.${allowed.confidenceNote ? ` ${allowed.confidenceNote}` : ""}`
            : "Сначала разберитесь с обязательными платежами."
          : allowed.horizonDate
            ? `This money is needed until ${formatDayMonth(allowed.horizonDate, locale)}.`
            : "Handle the required payments first.",
    };
  }

  return {
    id: "allowed",
    label: locale === "ru" ? "Сколько можно потратить" : "Safe spending today",
    value: locale === "ru" ? "пока неизвестно" : "unknown for now",
    caption:
      locale === "ru"
        ? "Не хватает данных о ближайшем доходе или обязательных тратах."
        : "Key data about the next income or required spending is missing.",
  };
}

function buildNextIncomeItem(decision: DecisionCoreResult, locale: Locale): TodayOverviewItem | null {
  if (decision.mainAction.type !== "hold") return null;
  if (!decision.safeUntil.nextIncomeDate) return null;
  const amount = moneyValue(decision.safeUntil.nextIncomeAmount, locale);
  const captionParts = [
    formatDayMonth(decision.safeUntil.nextIncomeDate, locale),
    decision.safeUntil.nextIncomeTitle ?? null,
  ].filter(Boolean);

  return {
    id: "next-income",
    label: locale === "ru" ? "Ближайшее поступление" : "Next income",
    value:
      amount ??
      (locale === "ru"
        ? "Ожидается"
        : "Expected"),
    caption: captionParts.length > 0 ? captionParts.join(" · ") : null,
  };
}

function isAvoidDuplicate(mainAction: DecisionMainAction, text: string | null): boolean {
  if (!text) return true;
  if (mainAction.type === "pay_overdue" || mainAction.type === "pay_today") {
    return text.toLocaleLowerCase("ru-RU").includes("обязатель");
  }
  if (mainAction.type === "reserve_for_risk") {
    return text.toLocaleLowerCase("ru-RU").includes("резерв");
  }
  if (mainAction.type === "complete_income_setup") {
    return true;
  }
  if (mainAction.type === "complete_balance_setup") {
    return true;
  }
  return false;
}

function buildReserveItem(input: TodayPresentationInput): TodayOverviewItem | null {
  const { decision, locale } = input;
  if (decision.mainAction.type !== "reserve_for_risk" || decision.mainAction.amount == null) {
    return null;
  }

  return {
    id: "reserve",
    label:
      decision.mainAction.dueDate && locale === "ru"
        ? `Лучше оставить до ${formatDayMonth(decision.mainAction.dueDate, locale)}`
        : locale === "ru"
          ? "Лучше не тратить"
          : "Better to keep",
    value: rub(decision.mainAction.amount, locale) ?? "",
    caption:
      decision.nextRisk?.title && locale === "ru"
        ? `После ${decision.nextRisk.title.toLocaleLowerCase("ru-RU")} свободных денег почти не останется.`
        : decision.mainAction.reason ?? null,
  };
}

function buildTimingItem(input: TodayPresentationInput): TodayOverviewItem | null {
  const { decision, locale } = input;

  if (
    decision.nextRisk &&
    decision.mainAction.type !== "reserve_for_risk" &&
    !(decision.mainAction.type === "cover_deficit" && decision.mainAction.dueDate === decision.nextRisk.date) &&
    decision.mainAction.type !== "pay_today" &&
    decision.mainAction.type !== "pay_overdue"
  ) {
    return {
      id: "next-payment",
      label: locale === "ru" ? "Ближайший платёж" : "Next payment",
      value: decision.nextRisk.title,
      caption: formatDayMonth(decision.nextRisk.date, locale),
    };
  }

  if (decision.safeUntil.title) {
    const explanationCaption = decision.constraintExplanation
      ? [decision.constraintExplanation.summary, decision.constraintExplanation.detail]
          .filter(Boolean)
          .join(" ")
      : null;
    const confidenceCaption =
      !decision.constraintExplanation && decision.safeUntil.confidenceNote
        ? decision.safeUntil.confidenceNote
        : null;
    return {
      id: "safe-until",
      label:
        decision.safeUntil.status === "no_risk_in_horizon"
          ? locale === "ru"
            ? "Горизонт прогноза"
            : "Forecast horizon"
          : locale === "ru"
            ? "Денег хватит до"
            : "Money lasts until",
      value:
        decision.safeUntil.status === "no_risk_in_horizon" &&
        decision.safeUntil.horizonEndDate
          ? locale === "ru"
            ? `До ${formatDayMonth(decision.safeUntil.horizonEndDate, locale)}`
            : `Until ${formatDayMonth(decision.safeUntil.horizonEndDate, locale)}`
          : decision.safeUntil.title,
      caption:
        explanationCaption ||
        confidenceCaption ||
        (decision.safeUntil.note &&
        !decision.safeUntil.note.toLocaleLowerCase("ru-RU").includes("прогноз")
          ? decision.safeUntil.note
          : null),
    };
  }

  return null;
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

  const reserveItem = buildReserveItem(input);
  if (reserveItem) {
    items.push(reserveItem);
  }

  items.push(buildAllowedItem(decision.allowed, locale, input.dailySafeSpending));

  const nextIncomeItem = buildNextIncomeItem(decision, locale);
  if (nextIncomeItem) {
    items.push(nextIncomeItem);
  }

  const timingItem = buildTimingItem(input);
  if (timingItem) {
    items.push(timingItem);
  }

  if (paymentsToSummarize.length > 0) {
    const total = paymentsToSummarize.reduce((sum, payment) => sum + payment.amount, 0);
    items.push({
      id: "payments",
      label:
        hiddenPrimaryPaymentId && remainingPayments.length > 0
          ? locale === "ru"
            ? "Другие платежи"
            : "Other payments"
          : locale === "ru"
            ? "Платежи"
            : "Payments",
      value: rub(total, locale) ?? "",
      caption:
        paymentsToSummarize.length > 1
          ? locale === "ru"
            ? `${paymentsToSummarize.length} шт.`
            : `${paymentsToSummarize.length} items`
          : null,
    });
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

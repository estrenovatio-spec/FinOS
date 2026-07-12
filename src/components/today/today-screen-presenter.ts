import { getMainActionButtonLabel } from "@/components/today/main-action-resolver";
import type { MoneySetup } from "@/lib/money-setup";
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
      return locale === "ru" ? "Подготовьте резерв" : "Prepare a buffer";
    case "reserve_for_risk":
      return locale === "ru" ? "Сохраните резерв" : "Keep the reserve";
    default:
      return mainAction.title;
  }
}

function buildHeroDue(mainAction: DecisionMainAction, locale: Locale): string | null {
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
          ? "Баланс уже ушёл в минус"
          : "The balance is already negative";
      }
      return locale === "ru"
        ? `${formatDayMonth(mainAction.dueDate, locale)} возможен дефицит`
        : `Possible deficit on ${formatDayMonth(mainAction.dueDate, locale)}`;
    case "reserve_for_risk":
      return mainAction.dueDate
        ? locale === "ru"
          ? `До ${formatDayMonth(mainAction.dueDate, locale)}`
          : `Until ${formatDayMonth(mainAction.dueDate, locale)}`
        : null;
    case "hold":
      return mainAction.dueDate
        ? locale === "ru"
          ? `Деньги под контролем до ${formatDayMonth(mainAction.dueDate, locale)}`
          : `Money is under control until ${formatDayMonth(mainAction.dueDate, locale)}`
        : null;
    default:
      return null;
  }
}

function buildHeroReason(mainAction: DecisionMainAction): string | null {
  return mainAction.reason ?? mainAction.description ?? null;
}

function buildHero(input: TodayPresentationInput): TodayHeroView {
  const { decision, locale } = input;
  const emptyState = isTodayZeroState(input);
  const status = getHeroStatusLabel(decision, locale, emptyState);

  if (emptyState) {
    return {
      statusLabel: status.label,
      tone: status.tone,
      title:
        locale === "ru"
          ? "Настройте деньги, чтобы FIN OS сказал, что делать сегодня"
          : "Set up your money so FIN OS can tell you what to do today",
      amount: null,
      due: null,
      reason:
        locale === "ru"
          ? "Для начала добавьте текущий остаток, ближайший доход и обязательные платежи."
          : "Start with your current balance, next income, and required payments.",
      ctaLabel: locale === "ru" ? "Настроить деньги" : "Set up money",
      isEmptyState: true,
    };
  }

  return {
    statusLabel: status.label,
    tone: status.tone,
    title: buildHeroTitle(decision.mainAction, locale),
    amount: rub(decision.mainAction.amount ?? null, locale),
    due: buildHeroDue(decision.mainAction, locale),
    reason: buildHeroReason(decision.mainAction),
    ctaLabel: getMainActionButtonLabel(decision.mainAction.command, locale),
    isEmptyState: false,
  };
}

function buildAllowedItem(allowed: DecisionAllowed, locale: Locale): TodayOverviewItem {
  if (allowed.status === "available" && allowed.amount != null) {
    return {
      id: "allowed",
      label: locale === "ru" ? "Можно потратить" : "You can spend",
      value: rub(allowed.amount, locale) ?? "",
      caption: locale === "ru" ? "сегодня" : "today",
    };
  }

  if (allowed.status === "restricted") {
    return {
      id: "allowed",
      label: locale === "ru" ? "Необязательные траты" : "Discretionary spending",
      value: locale === "ru" ? "лучше отложить" : "better to delay",
      caption: allowed.reason ?? null,
    };
  }

  return {
    id: "allowed",
    label: locale === "ru" ? "Безопасная сумма" : "Safe amount",
    value: locale === "ru" ? "пока неизвестна" : "unknown for now",
    caption: allowed.reason ?? null,
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
      items: [],
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
  const items: TodayOverviewItem[] = [];

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

  if (decision.nextRisk) {
    items.push({
      id: "next-risk",
      label: locale === "ru" ? "Ближайший риск" : "Next risk",
      value: formatDayMonth(decision.nextRisk.date, locale) ?? decision.nextRisk.label,
      caption: decision.nextRisk.title,
    });
  } else if (decision.mainAction.type === "hold" && decision.safeUntil.title) {
    items.push({
      id: "safe-until",
      label: locale === "ru" ? "Спокойно до" : "Calm until",
      value: decision.safeUntil.title,
      caption: null,
    });
  }

  if (!isTodayZeroState(input)) {
    items.push(buildAllowedItem(decision.allowed, locale));
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
              ? `Финансовое спокойствие: ${decision.peaceIndex.value} из 100`
              : `Financial calm: ${decision.peaceIndex.value} of 100`,
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

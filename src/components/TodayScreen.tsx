"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Sparkles, Wallet } from "lucide-react";
import { BalanceQuickEdit } from "@/components/BalanceQuickEdit";
import { MoneySetupDialog } from "@/components/MoneySetupDialog";
import { TransactionList } from "@/components/TransactionList";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCategoryLabel } from "@/lib/categories";
import { daysInclusiveUntilDate, getLocalTodayIsoDate } from "@/lib/format-date";
import { formatMoney } from "@/lib/format-money";
import { calculateSafeSpending } from "@/lib/safe-spending";
import {
  hasPartnerBudget,
  partnerDisplayName,
} from "@/lib/owner-labels";
import { countsInBalance } from "@/lib/transaction-confirmed";
import { useCloudStore } from "@/store/useCloudStore";
import {
  useBudgetPeriod,
  useFilteredTransactions,
  useHouseholdBalances,
  usePeriodOwnerTotals,
  useStore,
  useViewerMappedTransactions,
} from "@/store/useStore";

function remainingDays(periodTo: string): number {
  return daysInclusiveUntilDate(periodTo, getLocalTodayIsoDate()) ?? 1;
}

function dayCountLabel(days: number, locale: "ru" | "en"): string {
  if (locale === "en") return `${days} ${days === 1 ? "day" : "days"}`;
  if (days % 10 === 1 && days % 100 !== 11) return `${days} день`;
  if (days % 10 >= 2 && days % 10 <= 4 && (days % 100 < 12 || days % 100 > 14)) {
    return `${days} дня`;
  }
  return `${days} дн.`;
}

type TodaySafeSpendingCopy = {
  title: string;
  amount: string | null;
  note: string;
  helper: string | null;
  scopeNote: string | null;
  ctaLabel: string;
  ctaVariant: ButtonProps["variant"];
};

function compactInsight(
  locale: "ru" | "en",
  latestTransaction:
    | {
        type: "income" | "expense";
        categoryLabel: string | null;
      }
    | null,
): string {
  if (!latestTransaction) {
    return locale === "ru"
      ? "Добавьте первую операцию — и здесь появится совет дня."
      : "Add your first entry and a daily tip will appear here.";
  }

  if (latestTransaction.type === "income") {
    return locale === "ru"
      ? "Доход добавлен. Часть можно сразу направить в цель или подушку."
      : "Income added. You can send part of it to a goal or your buffer.";
  }

  if (latestTransaction.categoryLabel) {
    return locale === "ru"
      ? `${latestTransaction.categoryLabel} добавлено. Если это частая трата — позже можно поставить лимит.`
      : `${latestTransaction.categoryLabel} added. If it repeats often, you can set a limit later.`;
  }

  return locale === "ru"
    ? "Операция добавлена. Если она повторяется часто, позже можно поставить лимит."
    : "Entry added. If it repeats often, you can set a limit later.";
}

function operationCountLabel(count: number, locale: "ru" | "en"): string {
  if (locale === "en") return `${count} ${count === 1 ? "entry" : "entries"}`;
  if (count % 10 === 1 && count % 100 !== 11) return `${count} операция`;
  if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)) {
    return `${count} операции`;
  }
  return `${count} операций`;
}

function lowerCaseSentenceStart(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toLocaleLowerCase("ru-RU") + trimmed.slice(1);
}

function isMoneySetupComplete(
  setup: ReturnType<typeof useStore.getState>["moneySetup"],
  recurringExpenseCount: number,
): boolean {
  const hasIncomeDate = Boolean(setup.nextIncomeDate);
  const hasIncomeAmount = setup.expectedIncomeAmount != null && setup.expectedIncomeAmount > 0;
  const hasExpensesLayer =
    setup.requiredRecurringIds.length > 0 ||
    setup.hasNoRequiredFixedExpenses ||
    setup.essentialCategoryIds.length > 0 ||
    recurringExpenseCount === 0;

  return hasIncomeDate && hasIncomeAmount && hasExpensesLayer;
}

export function TodayScreen() {
  const locale = useStore((s) => s.locale);
  const partnerName = useStore((s) => s.partnerName);
  const partnerKeywords = useStore((s) => s.partnerKeywords);
  const householdFilter = useStore((s) => s.householdFilter);
  const categories = useStore((s) => s.categories);
  const moneySetup = useStore((s) => s.moneySetup);
  const recurringTransactions = useStore((s) => s.recurringTransactions);
  const categoryBudgets = useStore((s) => s.categoryBudgets);
  const recentTransactions = useFilteredTransactions("all");
  const allViewerTransactions = useViewerMappedTransactions(false);
  const balances = useHouseholdBalances();
  const period = useBudgetPeriod();
  const totals = usePeriodOwnerTotals();
  const household = useCloudStore((s) => s.household);
  const [moneySetupOpen, setMoneySetupOpen] = useState(false);
  const [safeSpendingDetailsOpen, setSafeSpendingDetailsOpen] = useState(false);

  const hasPartner = hasPartnerBudget(partnerName, partnerKeywords);
  const partnerLabel = partnerDisplayName(partnerName) || (locale === "ru" ? "Партнер" : "Partner");
  const isNewUser = recentTransactions.length === 0;
  const recurringExpenseCount = recurringTransactions.filter(
    (item) => item.type === "expense" && item.enabled,
  ).length;
  const moneySetupComplete = isMoneySetupComplete(moneySetup, recurringExpenseCount);
  const showHouseholdToggle = hasPartner || household?.mode === "shared";
  const availableNowForSafeSpending =
    moneySetup.useHouseholdBalance && showHouseholdToggle ? balances.all : balances.me;
  const currentBalanceTitle =
    moneySetup.useHouseholdBalance && showHouseholdToggle
      ? locale === "ru"
        ? "Текущий остаток семьи"
        : "Current family balance"
      : locale === "ru"
        ? "Текущий остаток"
        : "Current balance";
  const currentBalanceAmount = availableNowForSafeSpending;

  const daysLeft = remainingDays(period.to);
  const periodIncome = totals.me.income + totals.partner.income;
  const periodExpense = totals.me.expense + totals.partner.expense;
  const periodFreeMoney = Math.max(0, periodIncome - periodExpense);
  const safePool =
    balances.all > 0
      ? periodFreeMoney > 0
        ? Math.min(balances.all, periodFreeMoney)
        : balances.all
      : 0;
  const canSpendToday = Math.max(0, Math.floor(safePool / daysLeft));
  const statusMode =
    balances.all < 0 ? "negative" : canSpendToday > 0 ? "spend" : "pause";

  const latestTransaction = useMemo(() => {
    const latest = recentTransactions[0];
    if (!latest) return null;
    return {
      type: latest.type,
      categoryLabel:
        categories.find((category) => category.id === latest.categoryId)?.labels?.[locale] ?? null,
    };
  }, [categories, locale, recentTransactions]);
  const todayTransactions = useMemo(
    () =>
      allViewerTransactions
        .filter((transaction) =>
          householdFilter === "all" ? true : transaction.owner === householdFilter,
        )
        .filter(countsInBalance)
        .filter((transaction) => {
          const dateKey = transaction.date?.slice(0, 10);
          return dateKey === getLocalTodayIsoDate();
        }),
    [allViewerTransactions, householdFilter],
  );
  const todayCount = useMemo(
    () => todayTransactions.length,
    [todayTransactions],
  );

  const insight = compactInsight(locale, latestTransaction);
  const safeSpending = useMemo(
    () =>
      calculateSafeSpending({
        availableNow: availableNowForSafeSpending,
        moneySetup,
        recurringTransactions,
        categoryBudgets,
        categories,
        today: getLocalTodayIsoDate(),
      }),
    [
      availableNowForSafeSpending,
      categoryBudgets,
      categories,
      moneySetup,
      recurringTransactions,
    ],
  );
  const safeSpendingCopy = useMemo<TodaySafeSpendingCopy>(() => {
    if (safeSpending.status === "ready") {
      return {
        title: locale === "ru" ? "Безопасно сегодня" : "Safe today",
        amount:
          safeSpending.safeToday != null
            ? `${formatMoney(safeSpending.safeToday, locale)} ${locale === "ru" ? "₽" : "RUB"}`
            : null,
        note:
          locale === "ru"
            ? `До ближайшего дохода: ${dayCountLabel(safeSpending.daysUntilIncome ?? 1, locale)}`
            : `Until next income: ${dayCountLabel(safeSpending.daysUntilIncome ?? 1, locale)}`,
        helper:
          locale === "ru"
            ? "Учтены обязательные платежи и необходимые категории."
            : "Required payments and essential categories are included.",
        scopeNote:
          moneySetup.useHouseholdBalance && showHouseholdToggle
            ? locale === "ru"
              ? "Рассчитано по семейному балансу."
              : "Calculated from the family balance."
            : locale === "ru"
              ? "Рассчитано по личному балансу."
              : "Calculated from the personal balance.",
        ctaLabel: locale === "ru" ? "Изменить" : "Edit",
        ctaVariant: "ghost",
      };
    }

    const copyByStatus = {
      missing_income:
        {
          title: locale === "ru" ? "Безопасный день" : "Safe day",
          note:
            locale === "ru"
              ? "Добавьте дату ближайшего дохода, чтобы посчитать безопасный день."
              : "Add the next income date to calculate a safe day.",
          scopeNote: null,
          ctaLabel: locale === "ru" ? "Настроить лимит" : "Set up limit",
          ctaVariant: "default",
        },
      missing_balance:
        {
          title: locale === "ru" ? "Безопасный день" : "Safe day",
          note:
            locale === "ru"
              ? "Недостаточно данных по доступному остатку."
              : "Not enough data about available balance.",
          scopeNote: null,
          ctaLabel: moneySetupComplete
            ? locale === "ru"
              ? "Изменить"
              : "Edit"
            : locale === "ru"
              ? "Настроить лимит"
              : "Set up limit",
          ctaVariant: moneySetupComplete ? "ghost" : "default",
        },
      missing_required_expenses:
        {
          title: locale === "ru" ? "Безопасный день" : "Safe day",
          note:
            locale === "ru"
              ? "Отметьте обязательные платежи или подтвердите, что их нет."
              : "Mark required payments or return to limit setup.",
          scopeNote: null,
          ctaLabel: locale === "ru" ? "Настроить лимит" : "Set up limit",
          ctaVariant: "default",
        },
      missing_essential_budgets:
        {
          title:
            locale === "ru"
              ? "Не хватает лимитов на базовые расходы"
              : "Missing limits for essential spending",
          note:
            locale === "ru"
              ? "Чтобы посчитать безопасный день, укажите месячные лимиты на необходимые категории: продукты, транспорт, здоровье."
              : "To calculate a safe day, add monthly limits for essential categories: groceries, transport, health.",
          scopeNote: null,
          ctaLabel: locale === "ru" ? "Добавить лимиты" : "Add limits",
          ctaVariant: "default",
        },
      invalid_period:
        {
          title: locale === "ru" ? "Безопасный день" : "Safe day",
          note:
            locale === "ru"
              ? "Проверьте дату ближайшего дохода."
              : "Check the next income date.",
          scopeNote: null,
          ctaLabel: locale === "ru" ? "Настроить лимит" : "Set up limit",
          ctaVariant: "default",
        },
      not_enough_data:
        {
          title: locale === "ru" ? "Безопасный день" : "Safe day",
          note:
            locale === "ru"
              ? "Добавьте финансовую базу, чтобы посчитать безопасный день."
              : "Add your money setup to calculate a safe day.",
          scopeNote: null,
          ctaLabel: locale === "ru" ? "Настроить лимит" : "Set up limit",
          ctaVariant: "default",
        },
      ready: {
        title: "",
        note: "",
        scopeNote: null,
        ctaLabel: "",
        ctaVariant: "default",
      },
    } as const;

    return {
      title: copyByStatus[safeSpending.status].title,
      amount: null,
      note: copyByStatus[safeSpending.status].note,
      helper: null,
      scopeNote: copyByStatus[safeSpending.status].scopeNote,
      ctaLabel: copyByStatus[safeSpending.status].ctaLabel,
      ctaVariant: copyByStatus[safeSpending.status].ctaVariant,
    };
  }, [locale, moneySetup.useHouseholdBalance, moneySetupComplete, safeSpending, showHouseholdToggle]);
  const firstDayInsight = useMemo(() => {
    if (todayCount < 3) return null;

    const expenseTransactions = todayTransactions.filter((transaction) => transaction.type === "expense");
    const incomeTransactions = todayTransactions.filter((transaction) => transaction.type === "income");
    const totalExpense = expenseTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
    const totalIncome = incomeTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);

    if (expenseTransactions.length === 0) {
      return {
        title: locale === "ru" ? "Инсайт дня" : "Day insight",
        lines: [
          locale === "ru"
            ? `Сегодня ${operationCountLabel(todayCount, locale)}. Доходы: ${formatMoney(totalIncome, locale)} ₽.`
            : `Today: ${operationCountLabel(todayCount, locale)}. Income: ${formatMoney(totalIncome, locale)} RUB.`,
        ],
      };
    }

    const expenseByCategory = new Map<string, number>();
    for (const transaction of expenseTransactions) {
      expenseByCategory.set(
        transaction.categoryId,
        (expenseByCategory.get(transaction.categoryId) ?? 0) + transaction.amount,
      );
    }

    let topCategoryId = expenseTransactions[0]?.categoryId ?? "other";
    let topCategoryAmount = expenseByCategory.get(topCategoryId) ?? 0;
    for (const [categoryId, amount] of expenseByCategory.entries()) {
      if (amount > topCategoryAmount) {
        topCategoryId = categoryId;
        topCategoryAmount = amount;
      }
    }

    const topCategoryLabel = lowerCaseSentenceStart(
      getCategoryLabel(topCategoryId, categories, locale),
    );
    const countLabel =
      locale === "ru"
        ? `Сегодня ${operationCountLabel(todayCount, locale)}.`
        : `Today: ${operationCountLabel(todayCount, locale)}.`;

    if (incomeTransactions.length > 0) {
      return {
        title: locale === "ru" ? "Инсайт дня" : "Day insight",
        lines: [
          locale === "ru"
            ? `${countLabel} Главная трата — ${topCategoryLabel}: ${formatMoney(topCategoryAmount, locale)} ₽.`
            : `${countLabel} Top spend: ${topCategoryLabel}: ${formatMoney(topCategoryAmount, locale)} RUB.`,
        ],
      };
    }

    return {
      title: locale === "ru" ? "Инсайт дня" : "Day insight",
      lines: [
        locale === "ru"
          ? `${countLabel} Главная трата — ${topCategoryLabel}: ${formatMoney(topCategoryAmount, locale)} ₽.`
          : `${countLabel} Top spend: ${topCategoryLabel}: ${formatMoney(topCategoryAmount, locale)} RUB.`,
      ],
    };
  }, [categories, locale, todayCount, todayTransactions]);
  const missionTitle = locale === "ru" ? "Фокус дня" : "Daily focus";
  const missionProgress =
    todayCount >= 3
      ? locale === "ru"
        ? "Готово ✅"
        : "Done ✅"
      : locale === "ru"
        ? `Сегодня записано: ${todayCount} из 3`
        : `Logged today: ${todayCount} of 3`;
  const missionNote =
    todayCount >= 3
      ? ""
      : todayCount === 2
        ? locale === "ru"
          ? "Осталась 1 операция — этого достаточно на сегодня."
          : "1 entry left — that is enough for today."
        : todayCount === 1
          ? locale === "ru"
            ? "Осталось 2 операции — этого достаточно на сегодня."
            : "2 entries left — that is enough for today."
          : locale === "ru"
            ? "Запишите первую операцию за сегодня."
            : "Log your first entry for today.";

  if (isNewUser) {
    return (
      <div className="space-y-2.5 pb-24">
        <section className="px-1 pt-0.5">
          <h1 className="text-[1.3rem] font-semibold tracking-tight text-foreground">
            {locale === "ru" ? "Добро пожаловать в FinOS" : "Welcome to FinOS"}
          </h1>
          <p className="text-sm leading-snug text-muted-foreground">
            {locale === "ru"
              ? "Начните с одной операции — и я покажу, что происходит с деньгами."
              : "Start with one entry and I will show what is happening with your money."}
          </p>
        </section>

        <Card className="border-primary/20 bg-primary/5 shadow-sm">
          <CardContent className="space-y-2.5 p-3">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-foreground">
                {locale === "ru" ? "Начните с одной операции:" : "Start with one entry:"}
              </p>
              <p className="text-xs leading-snug text-muted-foreground">
                {locale === "ru"
                  ? "Пишите обычным языком. Категорию выберу сам."
                  : "Write naturally. I will choose the category for you."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                locale === "ru" ? "500 продукты" : "500 groceries",
                locale === "ru" ? "кофе 300" : "coffee 300",
                locale === "ru" ? "пришло 100000 зарплата" : "salary 100000 received",
              ].map((example) => (
                <span
                  key={example}
                  className="rounded-full border border-primary/20 bg-background/80 px-2.5 py-1 text-xs text-foreground/90"
                >
                  {example}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/15 bg-background shadow-sm">
          <CardContent className="space-y-2 p-3">
            <div className="space-y-0.5">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Wallet className="h-4 w-4 text-primary" />
                {locale === "ru" ? "Добавить первую операцию" : "Add your first entry"}
              </p>
              <p className="text-xs leading-snug text-muted-foreground">
                {locale === "ru"
                  ? "Например: 500 продукты, кофе 300, пришло 100000 зарплата"
                  : "For example: 500 groceries, coffee 300, salary 100000 received"}
              </p>
            </div>
            <VoiceRecorder compact />
          </CardContent>
        </Card>

        <Card className="border-border/20 bg-muted/10 shadow-none">
          <CardContent className="space-y-2 p-2.5">
            <p className="text-sm font-medium text-foreground">
              {locale === "ru"
                ? "Чтобы посчитать безопасный лимит, добавьте дату дохода и обязательные расходы."
                : "Add your income date and required expenses to calculate a safe limit."}
            </p>
            <Button type="button" size="sm" className="w-full sm:w-auto" onClick={() => setMoneySetupOpen(true)}>
              {locale === "ru" ? "Настроить лимит" : "Set up limit"}
            </Button>
          </CardContent>
        </Card>

        <MoneySetupDialog
          open={moneySetupOpen}
          onOpenChange={setMoneySetupOpen}
          showHouseholdToggle={showHouseholdToggle}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2.5 pb-24">
      <section className="px-1 pt-0.5">
        <h1 className="text-[1.3rem] font-semibold tracking-tight text-foreground">
          {locale === "ru" ? "Что сейчас с деньгами?" : "What is happening with my money?"}
        </h1>
      </section>

      <Card className="border-primary/20 bg-primary/5 shadow-sm">
        <CardContent className="space-y-2.5 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
                {currentBalanceTitle}
              </p>
              <p className="text-2xl font-semibold tracking-tight text-foreground">
                {formatMoney(currentBalanceAmount, locale)} {locale === "ru" ? "₽" : "RUB"}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant={safeSpendingCopy.ctaVariant}
              className="shrink-0"
              onClick={() => setMoneySetupOpen(true)}
            >
              {safeSpendingCopy.ctaLabel}
            </Button>
          </div>
          <div className="space-y-1 rounded-lg bg-background/55 px-2.5 py-2">
            {safeSpending.status === "ready" ? (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
                  {safeSpendingCopy.title}
                </p>
                {safeSpendingCopy.amount ? (
                  <p className="text-xl font-semibold tracking-tight text-foreground">
                    {safeSpendingCopy.amount}
                  </p>
                ) : null}
                <p className="text-xs leading-snug text-muted-foreground">
                  {safeSpendingCopy.note}
                </p>
                {safeSpendingCopy.scopeNote ? (
                  <p className="text-[11px] leading-snug text-muted-foreground/80">
                    {safeSpendingCopy.scopeNote}
                  </p>
                ) : null}
                {safeSpendingCopy.helper ? (
                  <p className="text-[11px] leading-snug text-muted-foreground/80">
                    {safeSpendingCopy.helper}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground">
                  {safeSpending.status === "missing_essential_budgets"
                    ? locale === "ru"
                      ? "Не хватает лимитов на базовые расходы"
                      : "Missing limits for essential spending"
                    : safeSpendingCopy.title}
                </p>
                <p className="text-xs leading-snug text-muted-foreground">
                  {safeSpendingCopy.note}
                </p>
              </>
            )}
          </div>
          {safeSpending.status === "ready" ? (
            <div className="space-y-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto px-0 text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setSafeSpendingDetailsOpen((value) => !value)}
              >
                {safeSpendingDetailsOpen ? (
                  <ChevronUp className="mr-1.5 h-4 w-4" />
                ) : (
                  <ChevronDown className="mr-1.5 h-4 w-4" />
                )}
                {locale === "ru" ? "Почему такая сумма?" : "Why this amount?"}
              </Button>
              {safeSpendingDetailsOpen ? (
                <div className="space-y-1 rounded-lg border border-border/20 bg-background/55 px-2.5 py-2 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between gap-3">
                    <span>{currentBalanceTitle}</span>
                    <span className="font-medium text-foreground">
                      {formatMoney(currentBalanceAmount, locale)} {locale === "ru" ? "₽" : "RUB"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      {locale === "ru"
                        ? "Обязательные платежи до дохода"
                        : "Required payments until income"}
                    </span>
                    <span className="font-medium text-foreground">
                      −{formatMoney(safeSpending.requiredFixedUntilIncome, locale)} {locale === "ru" ? "₽" : "RUB"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      {locale === "ru"
                        ? "Резерв на базовые категории"
                        : "Reserve for essential categories"}
                    </span>
                    <span className="font-medium text-foreground">
                      −{formatMoney(Math.floor(safeSpending.essentialReserveUntilIncome), locale)} {locale === "ru" ? "₽" : "RUB"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      {locale === "ru"
                        ? "Доступно до дохода"
                        : "Available until income"}
                    </span>
                    <span className="font-medium text-foreground">
                      {formatMoney(safeSpending.availableForDailySpending ?? 0, locale)} {locale === "ru" ? "₽" : "RUB"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      {locale === "ru"
                        ? "Дней до дохода"
                        : "Days until income"}
                    </span>
                    <span className="font-medium text-foreground">
                      {dayCountLabel(safeSpending.daysUntilIncome ?? 1, locale)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-border/20 pt-1">
                    <span>{locale === "ru" ? "Безопасно сегодня" : "Safe today"}</span>
                    <span className="font-semibold text-foreground">
                      {formatMoney(safeSpending.safeToday ?? 0, locale)} {locale === "ru" ? "₽" : "RUB"}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {safeSpending.status !== "ready" && safeSpendingCopy.scopeNote ? (
        <Card className="border-border/20 bg-muted/10 shadow-none">
          <CardContent className="p-2.5">
            <p className="text-[11px] leading-snug text-muted-foreground/80">
              {safeSpendingCopy.scopeNote}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {hasPartner ? (
        <Card className="border-transparent bg-transparent shadow-none">
          <CardContent className="p-2.5">
            <div className="space-y-1 rounded-lg bg-muted/45 px-2.5 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">
                  {locale === "ru" ? "Семейный баланс" : "Family balance"}
                </span>
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {formatMoney(balances.all, locale)} {locale === "ru" ? "₽" : "RUB"}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  {locale === "ru" ? "Я" : "Me"}
                  <BalanceQuickEdit
                    owner="me"
                    displayed={balances.me}
                    label={locale === "ru" ? "Я" : "Me"}
                    className="text-xs font-medium text-foreground no-underline"
                  />
                </span>
                <span className="inline-flex items-center gap-1">
                  {partnerLabel}
                  <BalanceQuickEdit
                    owner="partner"
                    displayed={balances.partner}
                    label={partnerLabel}
                    className="text-xs font-medium text-foreground no-underline"
                  />
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-primary/15 bg-background shadow-sm">
        <CardContent className="space-y-2 p-3">
          <div className="space-y-0.5">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Wallet className="h-4 w-4 text-primary" />
              {locale === "ru" ? "Быстрый ввод операции" : "Quick entry"}
            </p>
            <p className="text-xs leading-snug text-muted-foreground">
              {locale === "ru"
                ? "Например: 500 продукты, 1200 такси"
                : "For example: 500 groceries, 1200 taxi"}
            </p>
          </div>
          <VoiceRecorder compact />
        </CardContent>
      </Card>

      <Card className="border-border/20 bg-muted/10 shadow-none">
        <CardContent className="space-y-1 p-2.5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {missionTitle}
          </p>
          <p className="text-sm font-semibold leading-snug text-foreground">
            {missionProgress}
          </p>
          {missionNote ? (
            <p className="text-xs leading-snug text-muted-foreground">
              {missionNote}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {firstDayInsight ? (
        <Card className="border-border/20 bg-muted/10 shadow-none">
          <CardContent className="space-y-1 p-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              {firstDayInsight.title}
            </p>
            {firstDayInsight.lines.map((line) => (
              <p key={line} className="text-sm leading-snug text-foreground/90">
                {line}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/20 bg-muted/10 shadow-none">
          <CardContent className="space-y-1 p-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              {locale === "ru" ? "Совет дня" : "Daily tip"}
            </p>
            <p className="text-sm leading-snug text-foreground/90">{insight}</p>
          </CardContent>
        </Card>
      )}

      <TransactionList variant="today" limit={3} />

      <MoneySetupDialog
        open={moneySetupOpen}
        onOpenChange={setMoneySetupOpen}
        showHouseholdToggle={showHouseholdToggle}
      />
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Mic, Sparkles } from "lucide-react";
import { ExpectedEventActionDialog } from "@/components/ExpectedEventActionDialog";
import { QuickAddOperationDialog } from "@/components/today/QuickAddOperationDialog";
import { TodayHero } from "@/components/today/TodayHero";
import { TodayOverview } from "@/components/today/TodayOverview";
import { TodayRatesCard } from "@/components/today/TodayRatesCard";
import {
  executeMainActionCommand,
} from "@/components/today/main-action-resolver";
import { buildTodayScreenView, isTodayZeroState } from "@/components/today/today-screen-presenter";
import { MoneySetupDialog } from "@/components/MoneySetupDialog";
import type { MoneySetupInitialSection } from "@/components/MoneySetupDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { AppTabId } from "@/lib/app-bottom-nav";
import { decisionCoreSnapshot } from "@/lib/decision-core";
import { getLocalTodayIsoDate } from "@/lib/format-date";
import { formatTransactionDate } from "@/lib/format-date";
import { formatMoney } from "@/lib/format-money";
import type { ForecastFocus } from "@/lib/forecast-focus";
import { resolveExpectedEventDisplayStatus, type ExpectedEvent } from "@/lib/expected-events";
import type { PlanSection } from "@/lib/plan-navigation";
import {
  calculateFreeMoneyUntilPeriodEnd,
  calculatePlannedFreeMoneyUntilPeriodEnd,
} from "@/lib/free-money";
import { hasPartnerBudget } from "@/lib/owner-labels";
import { useViewerMappedTransactions, useHouseholdBalances, useStore } from "@/store/useStore";

export function TodayScreen({
  onNavigateToTab,
}: {
  onNavigateToTab: (
    tab: AppTabId,
    options?: {
      forecastFocus?: ForecastFocus | null;
      planSection?: PlanSection;
      entityId?: string | null;
    },
  ) => void;
}) {
  const locale = useStore((s) => s.locale);
  const liveRatesEnabled = useStore((s) => s.liveRatesEnabled);
  const forecastHorizonMonths = useStore((s) => s.forecastHorizonMonths);
  const categories = useStore((s) => s.categories);
  const moneySetup = useStore((s) => s.moneySetup);
  const recurringTransactions = useStore((s) => s.recurringTransactions);
  const debts = useStore((s) => s.debts);
  const categoryBudgets = useStore((s) => s.categoryBudgets);
  const budgetMonthStartDay = useStore((s) => s.budgetMonthStartDay);
  const expectedEventHistory = useStore((s) => s.expectedEventHistory);
  const householdFilter = useStore((s) => s.householdFilter);
  const partnerName = useStore((s) => s.partnerName);
  const partnerKeywords = useStore((s) => s.partnerKeywords);
  const balances = useHouseholdBalances();
  const transactions = useViewerMappedTransactions(false);
  const confirmPendingTransaction = useStore((s) => s.confirmPendingTransaction);
  const { toast } = useToast();
  const [moneySetupOpen, setMoneySetupOpen] = useState(false);
  const [moneySetupSection, setMoneySetupSection] = useState<
    MoneySetupInitialSection | null
  >(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [expectedEvent, setExpectedEvent] = useState<ExpectedEvent | null>(null);
  const [expectedEventMode, setExpectedEventMode] = useState<"confirm" | "skip">("confirm");
  const [expectedEventOpen, setExpectedEventOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [financialPlanMenuOpen, setFinancialPlanMenuOpen] = useState(false);

  const showHouseholdToggle = hasPartnerBudget(partnerName, partnerKeywords);
  const today = getLocalTodayIsoDate();

  const decisionSnapshot = useMemo(
    () =>
      decisionCoreSnapshot({
        locale,
        today,
        forecastHorizonMonths,
        categories,
        transactions,
        householdFilter,
        recurringTransactions,
        debts,
        moneySetup,
        categoryBudgets,
        budgetMonthStartDay,
        balances,
      }),
    [
      balances,
      categories,
      categoryBudgets,
      budgetMonthStartDay,
      debts,
      householdFilter,
      locale,
      forecastHorizonMonths,
      moneySetup,
      recurringTransactions,
      today,
      transactions,
    ],
  );
  const { forecast: _forecast, resolvedIncomeSources: _incomeSources, ...decision } = decisionSnapshot;
  const freeMoney = useMemo(() => {
    return calculateFreeMoneyUntilPeriodEnd(
      {
        locale,
        today,
        forecastHorizonMonths,
        categories,
        transactions,
        householdFilter,
        recurringTransactions,
        debts,
        moneySetup,
        categoryBudgets,
        budgetMonthStartDay,
        balances,
      },
      decisionSnapshot,
    );
  }, [
    balances,
    budgetMonthStartDay,
    categories,
    categoryBudgets,
    decisionSnapshot,
    debts,
    forecastHorizonMonths,
    householdFilter,
    locale,
    moneySetup,
    recurringTransactions,
    today,
    transactions,
  ]);
  const plannedFreeMoney = useMemo(() => {
    return calculatePlannedFreeMoneyUntilPeriodEnd(
      {
        locale,
        today,
        forecastHorizonMonths,
        categories,
        transactions,
        householdFilter,
        recurringTransactions,
        debts,
        moneySetup,
        categoryBudgets,
        budgetMonthStartDay,
        balances,
      },
      decisionSnapshot,
    );
  }, [
    balances,
    budgetMonthStartDay,
    categories,
    categoryBudgets,
    decisionSnapshot,
    debts,
    forecastHorizonMonths,
    householdFilter,
    locale,
    moneySetup,
    recurringTransactions,
    today,
    transactions,
  ]);

  const view = useMemo(
    () =>
      buildTodayScreenView({
        decision,
        locale,
        transactionCount: transactions.length,
        moneySetup,
        balances,
        freeMoney,
        plannedFreeMoney,
      }, { todayIso: today }),
    [balances, decision, freeMoney, locale, moneySetup, plannedFreeMoney, today, transactions.length],
  );
  const zeroState = isTodayZeroState({
    decision,
    locale,
    transactionCount: transactions.length,
    moneySetup,
    balances,
  });
  const latestTransactions = useMemo(
    () =>
      [...transactions]
        .filter((tx) => tx.confirmed !== false && tx.date <= today)
        .sort((left, right) => {
          if (left.date === right.date) return right.id.localeCompare(left.id);
          return right.date.localeCompare(left.date);
        })
        .slice(0, 4),
    [today, transactions],
  );
  const categoryMap = useMemo(
    () =>
      new Map(
        categories.map((category) => [
          category.id,
          locale === "ru" ? category.labels.ru : category.labels.en,
        ]),
      ),
    [categories, locale],
  );
  const todayInsight = useMemo(() => {
    const heroReason = view.hero.reason?.trim() ?? null;
    const candidates = [
      decision.peaceIndex.note,
      decision.allowed.reason,
      decision.safeUntil.note,
    ].filter((value): value is string => Boolean(value && value.trim()));
    return candidates.find((candidate) => candidate.trim() !== heroReason)?.trim() ?? null;
  }, [decision.allowed.reason, decision.peaceIndex.note, decision.safeUntil.note, view.hero.reason]);

  function openExpectedEventWorkflow(
    nextEvent: ExpectedEvent,
    mode: "confirm" | "skip",
  ) {
    setExpectedEvent(nextEvent);
    setExpectedEventMode(mode);
    setExpectedEventOpen(true);
  }

  function resolveMainActionExpectedEvent(): ExpectedEvent | null {
    const command = decision.mainAction.command;
    if (command.type === "confirm_income_source") {
      return {
        kind: "income",
        incomeSourceId: command.incomeSourceId,
        occurrenceDate: command.plannedDate,
        title: command.incomeTitle,
        amount: command.plannedAmount,
        status: command.status,
      };
    }
    if (command.type === "confirm_payment") {
      const payment = decision.todayPayments.find((item) => item.id === command.paymentId);
      if (!payment) return null;
      return {
        kind: "expense",
        transactionId: payment.id,
        title: payment.title,
        amount: payment.amount,
        date: payment.date,
        recurringOccurrenceDate: payment.recurringOccurrenceDate ?? null,
        debtId: payment.debtId ?? null,
        source:
          payment.source === "debt_payment"
            ? "debt_payment"
            : "pending_transaction",
        paymentSource: payment.paymentSource,
        linkedEntityId: payment.linkedEntityId ?? null,
      };
    }
    return null;
  }

  async function handleMainAction() {
    if (actionBusy) return;

    setActionError(null);

    if (zeroState) {
      setMoneySetupSection("balance");
      setMoneySetupOpen(true);
      return;
    }

    if (decision.mainAction.command.type === "none") return;

    const expectedAction = resolveMainActionExpectedEvent();
    if (expectedAction) {
      openExpectedEventWorkflow(expectedAction, "confirm");
      return;
    }

    setActionBusy(true);
    const result = await executeMainActionCommand(decision.mainAction.command, {
      confirmPendingTransaction,
      openMoneySetup: (scope) => {
        setMoneySetupSection(scope);
        setMoneySetupOpen(true);
      },
      openQuickAdd: () => {
        setQuickAddOpen(true);
      },
      openIncomeConfirmation: (params) => {
        openExpectedEventWorkflow(
          {
            kind: "income",
            incomeSourceId: params.incomeSourceId,
            occurrenceDate: params.plannedDate,
            title: params.incomeTitle,
            amount: params.plannedAmount,
            status: params.status,
          },
          "confirm",
        );
      },
      navigateToTab: onNavigateToTab,
    });

    if (!result.ok) {
      const message =
        locale === "ru"
          ? "Не получилось выполнить действие. Обновите экран или попробуйте ещё раз."
          : "The action could not be completed. Refresh the screen or try again.";
      setActionError(message);
      toast(
        message,
        "error",
      );
    }

    setActionBusy(false);
  }

  function handleOverviewAction(
    actionKey:
      | "edit_current_balance"
      | "add_transaction"
      | "open_financial_plan_menu",
  ) {
    if (actionKey === "edit_current_balance") {
      setActionError(null);
      setMoneySetupSection("current_balance");
      setMoneySetupOpen(true);
      return;
    }
    if (actionKey === "open_financial_plan_menu") {
      setActionError(null);
      setFinancialPlanMenuOpen(true);
      return;
    }
    if (actionKey === "add_transaction") {
      setActionError(null);
      setQuickAddOpen(true);
    }
  }

  function openFinancialPlanTarget(
    target: "balance_and_income" | "recurring" | "debts" | "limits",
  ) {
    setFinancialPlanMenuOpen(false);
    if (target === "balance_and_income") {
      setMoneySetupSection("current_balance");
      setMoneySetupOpen(true);
      return;
    }
    onNavigateToTab("plan", {
      planSection: target,
      entityId: null,
    });
  }

  return (
    <div className="space-y-6 pb-24">
      {!zeroState ? (
        <TodayOverview
          items={view.overviewItems}
          onItemAction={handleOverviewAction}
        />
      ) : null}

      {view.compactAlert ? (
        <section className="space-y-3 rounded-[28px] border border-amber-500/20 bg-amber-500/[0.05] px-5 py-5 shadow-none">
          <div className="space-y-1">
            <p className="text-sm font-medium tracking-[0.08em] text-foreground">
              Ближайшее действие
            </p>
            <p className="text-[1.35rem] font-semibold leading-tight text-foreground">
              {view.compactAlert.title}
            </p>
            <p className="text-sm leading-6 text-muted-foreground">{view.compactAlert.reason}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-auto px-0 py-0 text-sm font-medium text-foreground hover:text-foreground"
            onClick={handleMainAction}
            disabled={actionBusy}
          >
            {view.compactAlert.ctaLabel}
          </Button>
          {actionError ? (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-700">
              {actionError}
            </div>
          ) : null}
        </section>
      ) : (
        <TodayHero
          hero={view.hero}
          actionBusy={actionBusy}
          actionError={actionError}
          onAction={handleMainAction}
          onSecondaryAction={() => {
            const expectedAction = resolveMainActionExpectedEvent();
            if (expectedAction) {
              setActionError(null);
              openExpectedEventWorkflow(expectedAction, "skip");
            }
          }}
        />
      )}

      {!zeroState ? (
        <section className="space-y-3 rounded-[28px] border border-border/45 bg-card/90 px-5 py-5 shadow-none">
          <div className="space-y-1">
            <p className="text-sm font-medium tracking-[0.08em] text-foreground">
              {locale === "ru" ? "Добавить операцию" : "Add entry"}
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              {locale === "ru"
                ? "Быстро внесите расход или доход текстом или голосом."
                : "Quickly add an expense or income by text or voice."}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              className="h-12 flex-1 justify-center rounded-2xl"
              onClick={() => setQuickAddOpen(true)}
            >
              {locale === "ru" ? "＋ Добавить операцию" : "+ Add entry"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 flex-1 justify-center rounded-2xl"
              onClick={() => setQuickAddOpen(true)}
            >
              <Mic className="mr-2 h-4 w-4" />
              {locale === "ru" ? "Голосовой ввод" : "Voice input"}
            </Button>
          </div>
        </section>
      ) : null}

      {!zeroState && latestTransactions.length > 0 ? (
        <section className="space-y-3 rounded-[28px] border border-border/45 bg-card/90 px-5 py-5 shadow-none">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium tracking-[0.08em] text-foreground">
                {locale === "ru" ? "Последние операции" : "Latest entries"}
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                {locale === "ru"
                  ? "Короткий список последних подтверждённых операций."
                  : "A short list of your latest confirmed entries."}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-0 text-sm"
              onClick={() => onNavigateToTab("operations")}
            >
              {locale === "ru" ? "Все операции" : "All entries"}
            </Button>
          </div>
          <div className="divide-y divide-border/50">
            {latestTransactions.map((tx) => {
              const isIncome = tx.type === "income";
              const categoryName = categoryMap.get(tx.categoryId) ?? tx.categoryId;
              return (
                <div key={tx.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {tx.note || categoryName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {categoryName} · {formatTransactionDate(tx.date, locale)}
                    </p>
                  </div>
                  <p
                    className={`shrink-0 text-sm font-semibold ${
                      isIncome ? "text-emerald-700" : "text-foreground"
                    }`}
                  >
                    {isIncome ? "+" : "−"}
                    {formatMoney(tx.amount, locale)} {locale === "ru" ? "₽" : "RUB"}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {zeroState ? (
        <TodayOverview
          items={view.overviewItems}
          onItemAction={handleOverviewAction}
        />
      ) : null}

      <Dialog open={financialPlanMenuOpen} onOpenChange={setFinancialPlanMenuOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {locale === "ru" ? "Настроить финансовый план" : "Set up financial plan"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={() => openFinancialPlanTarget("balance_and_income")}
            >
              {locale === "ru" ? "Баланс и доходы" : "Balance and income"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={() => openFinancialPlanTarget("recurring")}
            >
              {locale === "ru" ? "Регулярные платежи" : "Recurring payments"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={() => openFinancialPlanTarget("debts")}
            >
              {locale === "ru" ? "Долги" : "Debts"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={() => openFinancialPlanTarget("limits")}
            >
              {locale === "ru" ? "Лимиты" : "Limits"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {view.payments ? (
        <section className="space-y-3 rounded-[28px] border border-border/45 bg-card/90 px-5 py-5 shadow-none">
          <div className="space-y-1">
            <p className="text-sm font-medium tracking-[0.08em] text-foreground">
              {view.payments.title}
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              {locale === "ru"
                ? "Только те обязательства, которые уже требуют действия."
                : "Only obligations that already require action."}
            </p>
          </div>
          <div className="space-y-2">
            {view.payments.items.map((payment) => (
              <TodayPaymentRow
                key={payment.id}
                title={payment.title}
                amount={payment.amount}
                date={payment.date}
                onConfirm={() =>
                  openExpectedEventWorkflow(
                    {
                      kind: "expense",
                      transactionId: payment.id,
                      title: payment.title,
                      amount: payment.amount,
                      date: payment.date,
                      recurringOccurrenceDate: payment.recurringOccurrenceDate ?? null,
                      debtId: payment.debtId ?? null,
                      source:
                        payment.source === "debt_payment"
                          ? "debt_payment"
                          : "pending_transaction",
                      paymentSource: payment.paymentSource,
                      linkedEntityId: payment.linkedEntityId ?? null,
                    },
                    "confirm",
                  )
                }
                onSkip={() =>
                  openExpectedEventWorkflow(
                    {
                      kind: "expense",
                      transactionId: payment.id,
                      title: payment.title,
                      amount: payment.amount,
                      date: payment.date,
                      recurringOccurrenceDate: payment.recurringOccurrenceDate ?? null,
                      debtId: payment.debtId ?? null,
                      source:
                        payment.source === "debt_payment"
                          ? "debt_payment"
                          : "pending_transaction",
                      paymentSource: payment.paymentSource,
                      linkedEntityId: payment.linkedEntityId ?? null,
                    },
                    "skip",
                  )
                }
                status={
                  resolveExpectedEventDisplayStatus({
                    kind: "expense",
                    event: {
                      date: payment.date,
                      recurringOccurrenceDate: payment.recurringOccurrenceDate ?? null,
                      debtId: payment.debtId ?? null,
                      paymentSource: payment.paymentSource,
                      linkedEntityId: payment.linkedEntityId ?? null,
                    },
                    history: expectedEventHistory,
                    today,
                    locale,
                  }).label
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      {!zeroState && todayInsight ? (
        <section className="rounded-[28px] border border-border/45 bg-card/90 px-5 py-5 shadow-none">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/8 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-medium tracking-[0.08em] text-foreground">
                {locale === "ru" ? "AI-инсайт" : "AI insight"}
              </p>
              <p className="max-w-[38rem] text-sm leading-6 text-muted-foreground">
                {todayInsight}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {liveRatesEnabled ? <TodayRatesCard locale={locale} /> : null}

      <QuickAddOperationDialog
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        showTrigger={false}
      />

      <ExpectedEventActionDialog
        open={expectedEventOpen}
        mode={expectedEventMode}
        event={expectedEvent}
        onOpenChange={(nextOpen) => {
          setExpectedEventOpen(nextOpen);
          if (!nextOpen) {
            setExpectedEvent(null);
          }
        }}
      />

      <MoneySetupDialog
        open={moneySetupOpen}
        onOpenChange={setMoneySetupOpen}
        showHouseholdToggle={showHouseholdToggle}
        initialSection={moneySetupSection}
      />
    </div>
  );
}

function TodayPaymentRow({
  title,
  amount,
  date,
  status,
  onConfirm,
  onSkip,
}: {
  title: string;
  amount: number;
  date: string;
  status: string;
  onConfirm: () => void;
  onSkip: () => void;
}) {
  const locale = useStore((s) => s.locale);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/80 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">
          {formatMoney(amount, locale)} {locale === "ru" ? "₽" : "RUB"} · {formatTransactionDate(date, locale)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{status}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button type="button" size="sm" onClick={onConfirm}>
          {locale === "ru" ? "Оплатить" : "Pay"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onSkip}>
          {locale === "ru" ? "Не оплатил" : "Not paid"}
        </Button>
      </div>
    </div>
  );
}

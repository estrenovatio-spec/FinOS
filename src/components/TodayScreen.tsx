"use client";

import { useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

  function handleOverviewAction(actionKey: "edit_current_balance" | "add_transaction") {
    if (actionKey === "edit_current_balance") {
      setActionError(null);
      setMoneySetupSection("current_balance");
      setMoneySetupOpen(true);
      return;
    }
    if (actionKey === "add_transaction") {
      setActionError(null);
      setQuickAddOpen(true);
    }
  }

  return (
    <div className="space-y-3 pb-24">
      {view.compactAlert ? (
        <Card className="border-amber-500/25 bg-amber-500/5 shadow-none">
          <CardContent className="space-y-3 p-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">{view.compactAlert.title}</p>
              <p className="text-sm leading-snug text-muted-foreground">{view.compactAlert.reason}</p>
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
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-700">
                {actionError}
              </div>
            ) : null}
          </CardContent>
        </Card>
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

      <TodayOverview
        items={view.overviewItems}
        onItemAction={handleOverviewAction}
      />

      {view.payments ? (
        <Card className="border-border/25 bg-card/95 shadow-none">
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-semibold text-foreground">{view.payments.title}</p>
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
          </CardContent>
        </Card>
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
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/80 p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">
          {formatMoney(amount, locale)} {locale === "ru" ? "₽" : "RUB"} · {formatTransactionDate(date, locale)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{status}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button type="button" size="sm" onClick={onConfirm}>
          {locale === "ru" ? "Оплатил" : "Paid"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onSkip}>
          {locale === "ru" ? "Не оплатил" : "Not paid"}
        </Button>
      </div>
    </div>
  );
}

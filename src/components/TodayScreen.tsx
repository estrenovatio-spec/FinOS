"use client";

import { useMemo, useState } from "react";
import { QuickAddOperationDialog } from "@/components/today/QuickAddOperationDialog";
import { TodayHero } from "@/components/today/TodayHero";
import { TodayOverview } from "@/components/today/TodayOverview";
import { TodaySecondaryInsights } from "@/components/today/TodaySecondaryInsights";
import {
  executeMainActionCommand,
} from "@/components/today/main-action-resolver";
import { buildTodayScreenView, isTodayZeroState } from "@/components/today/today-screen-presenter";
import { MoneySetupDialog } from "@/components/MoneySetupDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import type { AppTabId } from "@/lib/app-bottom-nav";
import { decisionCore } from "@/lib/decision-core";
import { getLocalTodayIsoDate } from "@/lib/format-date";
import { formatMoney } from "@/lib/format-money";
import type { ForecastFocus } from "@/lib/forecast-focus";
import { hasPartnerBudget } from "@/lib/owner-labels";
import { useViewerMappedTransactions, useHouseholdBalances, useStore } from "@/store/useStore";

export function TodayScreen({
  onNavigateToTab,
}: {
  onNavigateToTab: (
    tab: AppTabId,
    options?: { forecastFocus?: ForecastFocus | null },
  ) => void;
}) {
  const locale = useStore((s) => s.locale);
  const categories = useStore((s) => s.categories);
  const moneySetup = useStore((s) => s.moneySetup);
  const recurringTransactions = useStore((s) => s.recurringTransactions);
  const debts = useStore((s) => s.debts);
  const categoryBudgets = useStore((s) => s.categoryBudgets);
  const householdFilter = useStore((s) => s.householdFilter);
  const partnerName = useStore((s) => s.partnerName);
  const partnerKeywords = useStore((s) => s.partnerKeywords);
  const balances = useHouseholdBalances();
  const transactions = useViewerMappedTransactions(false);
  const confirmPendingTransaction = useStore((s) => s.confirmPendingTransaction);
  const { toast } = useToast();
  const [moneySetupOpen, setMoneySetupOpen] = useState(false);
  const [moneySetupSection, setMoneySetupSection] = useState<
    "balance" | "income" | "required_expenses" | "essential_budgets" | null
  >(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const showHouseholdToggle = hasPartnerBudget(partnerName, partnerKeywords);
  const today = getLocalTodayIsoDate();

  const decision = useMemo(
    () =>
      decisionCore({
        locale,
        today,
        categories,
        transactions,
        householdFilter,
        recurringTransactions,
        debts,
        moneySetup,
        categoryBudgets,
        balances,
      }),
    [
      balances,
      categories,
      categoryBudgets,
      debts,
      householdFilter,
      locale,
      moneySetup,
      recurringTransactions,
      today,
      transactions,
    ],
  );
  const view = useMemo(
    () =>
      buildTodayScreenView({
        decision,
        locale,
        transactionCount: transactions.length,
        moneySetup,
        balances,
      }),
    [balances, decision, locale, moneySetup, transactions.length],
  );
  const zeroState = isTodayZeroState({
    decision,
    locale,
    transactionCount: transactions.length,
    moneySetup,
    balances,
  });

  async function handleMainAction() {
    if (actionBusy) return;

    setActionError(null);

    if (zeroState) {
      setMoneySetupSection("balance");
      setMoneySetupOpen(true);
      return;
    }

    if (decision.mainAction.command.type === "none") return;

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

  return (
    <div className="space-y-3 pb-24">
      <section className="space-y-1 px-1 pt-1">
        <h1 className="text-[1.45rem] font-semibold tracking-tight text-foreground">
          {locale === "ru" ? "Сегодня" : "Today"}
        </h1>
      </section>

      <TodayHero
        hero={view.hero}
        actionBusy={actionBusy}
        actionError={actionError}
        onAction={handleMainAction}
      />

      <TodayOverview title={view.overviewTitle} items={view.overviewItems} />

      {view.payments ? (
        <Card className="border-border/25 bg-card/95 shadow-none">
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-semibold text-foreground">{view.payments.title}</p>
            <div className="space-y-2">
              {view.payments.items.map((payment) => (
                <TodayPaymentRow
                  key={payment.id}
                  id={payment.id}
                  title={payment.title}
                  amount={payment.amount}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <TodaySecondaryInsights avoid={view.avoid} peaceIndex={view.peaceIndex} />

      <QuickAddOperationDialog
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        showTrigger={false}
      />

      <div className="sticky bottom-20 z-20 pt-2">
        <Button
          type="button"
          variant={view.showQuickAddHint ? "outline" : "secondary"}
          className="h-12 w-full rounded-xl text-base font-semibold"
          onClick={() => {
            setActionError(null);
            setQuickAddOpen(true);
          }}
        >
          {locale === "ru" ? "Добавить операцию" : "Add entry"}
        </Button>
      </div>

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
  id,
  title,
  amount,
}: {
  id: string;
  title: string;
  amount: number;
}) {
  const locale = useStore((s) => s.locale);
  const confirmPendingTransaction = useStore((s) => s.confirmPendingTransaction);

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/80 p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">
          {formatMoney(amount, locale)} {locale === "ru" ? "₽" : "RUB"}
        </p>
      </div>
      <Button type="button" size="sm" onClick={() => confirmPendingTransaction(id)}>
        {locale === "ru" ? "Оплачено" : "Paid"}
      </Button>
    </div>
  );
}

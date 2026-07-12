"use client";

import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ShieldAlert,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { QuickAddOperationDialog } from "@/components/today/QuickAddOperationDialog";
import {
  executeMainActionCommand,
  getMainActionButtonLabel,
} from "@/components/today/main-action-resolver";
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

function TodayCardTitle({
  icon: Icon,
  title,
}: {
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
    </div>
  );
}

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
    "income" | "required_expenses" | "essential_budgets" | null
  >(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

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
  const mainActionButtonLabel = getMainActionButtonLabel(
    decision.mainAction.command,
    locale,
  );

  async function handleMainAction() {
    if (actionBusy || decision.mainAction.command.type === "none") return;

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
      toast(
        locale === "ru"
          ? "Действие не удалось выполнить. Проверьте, что платёж или запись ещё актуальны."
          : "The action could not be completed. Check that the item still exists.",
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
        <p className="text-sm leading-snug text-muted-foreground">
          {locale === "ru"
            ? "Главная точка дня: хватит ли денег, что оплатить и можно ли спокойно выдохнуть."
            : "Your day center: enough money, what to pay, and whether you can rest."}
        </p>
      </section>

      <Card className={decision.status.toneClassName}>
        <CardContent className="space-y-2 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">
            {locale === "ru" ? "Статус дня" : "Day status"}
          </p>
          <div className="flex items-center gap-2">
            {decision.status.key === "calm" ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : decision.status.key === "risk" ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <ShieldAlert className="h-5 w-5" />
            )}
            <p className="text-xl font-semibold">{decision.status.title}</p>
          </div>
          {decision.status.note ? (
            <p className="text-sm leading-snug opacity-90">{decision.status.note}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-primary/25 bg-primary/5 shadow-none">
        <CardContent className="space-y-3 p-4">
          <TodayCardTitle
            icon={Sparkles}
            title={locale === "ru" ? "Главное действие" : "Main action"}
          />
          <div className="space-y-2">
            <p className="text-xl font-semibold leading-snug text-foreground">
              {decision.mainAction.title}
            </p>
            {decision.mainAction.description ? (
              <p className="text-sm leading-snug text-foreground/90">
                {decision.mainAction.description}
              </p>
            ) : null}
            {decision.mainAction.reason ? (
              <p className="text-sm leading-snug text-muted-foreground">
                {locale === "ru" ? "Почему:" : "Why:"} {decision.mainAction.reason}
              </p>
            ) : null}
          </div>
          {mainActionButtonLabel ? (
            <Button
              type="button"
              className="w-full"
              onClick={handleMainAction}
              disabled={actionBusy}
            >
              {mainActionButtonLabel}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/25 bg-card/95 shadow-none">
        <CardContent className="space-y-2 p-4">
          <TodayCardTitle
            icon={CircleDollarSign}
            title={locale === "ru" ? "Денег хватит до" : "Money will last until"}
          />
          <p className="text-2xl font-semibold tracking-tight text-foreground">
            {decision.safeUntil.title}
          </p>
          {decision.safeUntil.note ? (
            <p className="text-sm leading-snug text-muted-foreground">
              {decision.safeUntil.note}
            </p>
          ) : null}
          {decision.safeUntil.needsSetup ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setMoneySetupOpen(true)}
            >
              {locale === "ru" ? "Уточнить данные" : "Complete setup"}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/25 bg-card/95 shadow-none">
        <CardContent className="space-y-3 p-4">
          <TodayCardTitle
            icon={CalendarClock}
            title={locale === "ru" ? "Сегодня оплатить" : "Pay today"}
          />
          {decision.todayPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {locale === "ru"
                ? "На сегодня обязательных оплат нет."
                : "No required payments today."}
            </p>
          ) : (
            <div className="space-y-2">
              {decision.todayPayments.map((payment) => (
                <TodayPaymentRow
                  key={payment.id}
                  id={payment.id}
                  title={payment.title}
                  amount={payment.amount}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {decision.nextRisk ? (
        <Card className="border-border/25 bg-card/95 shadow-none">
          <CardContent className="space-y-2 p-4">
            <TodayCardTitle
              icon={AlertTriangle}
              title={locale === "ru" ? "Следующий риск" : "Next risk"}
            />
            <p className="text-lg font-semibold text-foreground">
              {decision.nextRisk.title}
            </p>
            <p className="text-sm font-medium text-foreground">
              {formatMoney(decision.nextRisk.amount, locale)}{" "}
              {locale === "ru" ? "₽" : "RUB"}
            </p>
            <p className="text-sm text-muted-foreground">{decision.nextRisk.label}</p>
            {decision.nextRisk.note ? (
              <p className="text-xs leading-snug text-muted-foreground">
                {decision.nextRisk.note}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {decision.avoid.text ? (
        <Card className="border-amber-500/25 bg-amber-500/5 shadow-none">
          <CardContent className="space-y-2 p-4">
            <TodayCardTitle
              icon={ShieldAlert}
              title={
                locale === "ru"
                  ? "Сегодня не рекомендуется"
                : "Not recommended today"
              }
            />
            <p className="text-sm leading-snug text-foreground">{decision.avoid.text}</p>
            {decision.avoid.reason ? (
              <p className="text-xs leading-snug text-muted-foreground">
                {decision.avoid.reason}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border/25 bg-card/95 shadow-none">
        <CardContent className="space-y-2 p-4">
          <TodayCardTitle
            icon={CheckCircle2}
            title={locale === "ru" ? "Сегодня можно" : "Today you can"}
          />
          <p className="text-sm leading-snug text-foreground">{decision.allowed.text}</p>
          {decision.allowed.reason ? (
            <p className="text-xs leading-snug text-muted-foreground">
              {decision.allowed.reason}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/25 bg-card/95 shadow-none">
        <CardContent className="space-y-2 p-4">
          <TodayCardTitle
            icon={Sparkles}
            title={locale === "ru" ? "Индекс спокойствия" : "Calm index"}
          />
          <div className="flex items-end justify-between gap-3">
            <p className="text-3xl font-semibold tracking-tight text-foreground">
              {decision.peaceIndex.value}
            </p>
            <p className="text-sm text-muted-foreground">{decision.peaceIndex.note}</p>
          </div>
        </CardContent>
      </Card>

      {!decision.hasHistory ? (
        <Card className="border-primary/20 bg-primary/5 shadow-none">
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-semibold text-foreground">
              {locale === "ru"
                ? "Добавьте первую операцию, и экран станет точнее."
                : "Add the first entry and this screen will become more accurate."}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <QuickAddOperationDialog
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
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

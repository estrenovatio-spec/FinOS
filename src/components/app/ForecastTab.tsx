"use client";

import { useMemo, useState } from "react";
import { ForecastCalendarView } from "@/components/app/ForecastCalendarView";
import { FocusedForecastCard } from "@/components/app/FocusedForecastCard";
import { Button } from "@/components/ui/button";
import { decisionCoreSnapshot } from "@/lib/decision-core";
import { getLocalTodayIsoDate } from "@/lib/format-date";
import type { ForecastFocus } from "@/lib/forecast-focus";
import { calculatePlannedFreeMoneyUntilPeriodEnd } from "@/lib/free-money";
import { buildPlannedFreeMoneySummary } from "@/lib/planned-free-money-presenter";
import type { PlanSection } from "@/lib/plan-navigation";
import {
  useHouseholdBalances,
  useStore,
  useViewerMappedTransactions,
} from "@/store/useStore";

function formatHorizonMonths(months: 1 | 3 | 6, locale: "ru" | "en"): string {
  if (locale === "en") {
    return months === 1 ? "1 month" : `${months} months`;
  }
  if (months === 1) return "1 месяц";
  if (months >= 2 && months <= 4) return `${months} месяца`;
  return `${months} месяцев`;
}

export function ForecastTab({
  focus,
  onOpenPlan,
}: {
  focus: ForecastFocus | null;
  onOpenPlan?: (params: { section: PlanSection; entityId?: string | null }) => void;
}) {
  const locale = useStore((s) => s.locale);
  const forecastHorizonMonths = useStore((s) => s.forecastHorizonMonths);
  const categories = useStore((s) => s.categories);
  const moneySetup = useStore((s) => s.moneySetup);
  const recurringTransactions = useStore((s) => s.recurringTransactions);
  const debts = useStore((s) => s.debts);
  const savingsGoals = useStore((s) => s.savingsGoals);
  const categoryBudgets = useStore((s) => s.categoryBudgets);
  const budgetMonthStartDay = useStore((s) => s.budgetMonthStartDay);
  const householdFilter = useStore((s) => s.householdFilter);
  const balances = useHouseholdBalances();
  const transactions = useViewerMappedTransactions(false);
  const today = getLocalTodayIsoDate();

  const snapshot = useMemo(
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
      forecastHorizonMonths,
      householdFilter,
      locale,
      moneySetup,
      recurringTransactions,
      today,
      transactions,
    ],
  );
  const periodFreeMoney = useMemo(
    () =>
      calculatePlannedFreeMoneyUntilPeriodEnd(
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
        snapshot,
      ),
    [
      balances,
      budgetMonthStartDay,
      categories,
      categoryBudgets,
      debts,
      forecastHorizonMonths,
      householdFilter,
      locale,
      moneySetup,
      recurringTransactions,
      snapshot,
      today,
      transactions,
    ],
  );
  const horizonMonths = snapshot.forecast.horizonMonths ?? forecastHorizonMonths;
  const periodFreeMoneySummary = useMemo(
    () => buildPlannedFreeMoneySummary(locale, periodFreeMoney),
    [locale, periodFreeMoney],
  );
  const [viewMode, setViewMode] = useState<"line" | "calendar">("line");
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<string | null>(null);
  const planLink = useMemo(() => {
    const focusedEvent =
      focus?.eventId != null
        ? snapshot.forecast.events.find((event) => event.id === focus.eventId) ?? null
        : null;
    if (!focusedEvent) {
      return { section: "recurring" as PlanSection, entityId: null };
    }
    if (focusedEvent.source === "essential_budget") {
      return {
        section: "limits" as PlanSection,
        entityId: focusedEvent.budgetReserveItems?.[0]?.categoryId ?? null,
      };
    }
    if (focusedEvent.source === "debt_payment") {
      return { section: "debts" as PlanSection, entityId: null };
    }
    if (focusedEvent.source === "recurring") {
      return {
        section: "recurring" as PlanSection,
        entityId: focusedEvent.recurringId ?? null,
      };
    }
    if (focusedEvent.source === "income_source") {
      return {
        section: "recurring" as PlanSection,
        entityId: focusedEvent.incomeSourceId ?? null,
      };
    }
    return { section: "recurring" as PlanSection, entityId: null };
  }, [focus?.eventId, snapshot.forecast.events]);

  return (
    <div className="space-y-3 py-1">
      <div>
        <h2 className="text-lg font-bold">
          {locale === "ru" ? "Прогноз" : "Forecast"}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {locale === "ru"
            ? `Горизонт: ${formatHorizonMonths(horizonMonths, locale)} · прогноз до ${snapshot.forecast.horizonEndDate}.`
            : `Horizon: ${formatHorizonMonths(horizonMonths, locale)} · forecast until ${snapshot.forecast.horizonEndDate}.`}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:inline-flex sm:w-auto">
        <Button
          type="button"
          variant={viewMode === "line" ? "default" : "outline"}
          className="h-auto min-h-9 px-3 py-2 text-xs"
          onClick={() => setViewMode("line")}
        >
          {locale === "ru" ? "Линия" : "Line"}
        </Button>
        <Button
          type="button"
          variant={viewMode === "calendar" ? "default" : "outline"}
          className="h-auto min-h-9 px-3 py-2 text-xs"
          onClick={() => setViewMode("calendar")}
        >
          {locale === "ru" ? "Календарь" : "Calendar"}
        </Button>
      </div>
      {periodFreeMoneySummary ? (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary/80">
            {periodFreeMoneySummary.label}
          </p>
          {periodFreeMoneySummary.subtitle ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {periodFreeMoneySummary.subtitle}
            </p>
          ) : null}
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {periodFreeMoneySummary.value}
          </p>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {periodFreeMoneySummary.caption}
          </p>
        </div>
      ) : null}
      {viewMode === "line" ? (
        <FocusedForecastCard
          locale={locale}
          forecast={snapshot.forecast}
          focus={focus}
          explanation={snapshot.constraintExplanation}
        />
      ) : (
        <ForecastCalendarView
          locale={locale}
          forecast={snapshot.forecast}
          startDate={today}
          goals={savingsGoals}
          explanation={snapshot.constraintExplanation}
          periodFreeMoney={periodFreeMoney}
          selectedDate={calendarSelectedDate}
          onSelectedDateChange={setCalendarSelectedDate}
          onOpenPlan={onOpenPlan}
        />
      )}
      <button
        type="button"
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        onClick={() => onOpenPlan?.(planLink)}
      >
        {locale === "ru" ? "Изменить план" : "Edit plan"}
      </button>
    </div>
  );
}

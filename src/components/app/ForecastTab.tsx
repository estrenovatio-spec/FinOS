"use client";

import { useMemo } from "react";
import { FocusedForecastCard } from "@/components/app/FocusedForecastCard";
import { PlanningPanel } from "@/components/PlanningPanel";
import { decisionCoreSnapshot } from "@/lib/decision-core";
import { getLocalTodayIsoDate } from "@/lib/format-date";
import type { ForecastFocus } from "@/lib/forecast-focus";
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
}: {
  focus: ForecastFocus | null;
}) {
  const locale = useStore((s) => s.locale);
  const forecastHorizonMonths = useStore((s) => s.forecastHorizonMonths);
  const categories = useStore((s) => s.categories);
  const moneySetup = useStore((s) => s.moneySetup);
  const recurringTransactions = useStore((s) => s.recurringTransactions);
  const debts = useStore((s) => s.debts);
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
  const horizonMonths = snapshot.forecast.horizonMonths ?? forecastHorizonMonths;

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
      <FocusedForecastCard
        locale={locale}
        forecast={snapshot.forecast}
        focus={focus}
        explanation={snapshot.constraintExplanation}
      />
      <PlanningPanel collapsible={false} />
    </div>
  );
}

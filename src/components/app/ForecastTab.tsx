"use client";

import { useMemo } from "react";
import { FocusedForecastCard } from "@/components/app/FocusedForecastCard";
import { PlanningPanel } from "@/components/PlanningPanel";
import { TipsPanel } from "@/components/TipsPanel";
import { decisionCoreSnapshot } from "@/lib/decision-core";
import { getLocalTodayIsoDate } from "@/lib/format-date";
import type { ForecastFocus } from "@/lib/forecast-focus";
import {
  useHouseholdBalances,
  useStore,
  useViewerMappedTransactions,
} from "@/store/useStore";

export function ForecastTab({
  focus,
}: {
  focus: ForecastFocus | null;
}) {
  const locale = useStore((s) => s.locale);
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
      moneySetup,
      recurringTransactions,
      today,
      transactions,
    ],
  );

  return (
    <div className="space-y-3 py-1">
      <div>
        <h2 className="text-lg font-bold">
          {locale === "ru" ? "Прогноз" : "Forecast"}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {locale === "ru"
            ? "Планы, цели, долги и финансовый горизонт без переписывания текущего planning."
            : "Plans, goals, debts, and forward view without rewriting planning."}
        </p>
      </div>
      <FocusedForecastCard
        locale={locale}
        forecast={snapshot.forecast}
        focus={focus}
      />
      <PlanningPanel collapsible={false} />
      <TipsPanel collapsible={false} />
    </div>
  );
}

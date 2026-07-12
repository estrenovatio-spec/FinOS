"use client";

import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  HomeSectionCardHeader,
  HomeSectionCollapsedBar,
  homeSectionContentClassName,
  sectionToggleButtonClassName,
} from "@/components/HomeSectionCardHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HouseholdFilterTabs } from "@/components/HouseholdControls";
import { StatisticsPeriodControls } from "@/components/StatisticsPeriodControls";
import { formatBudgetPeriodLabel } from "@/lib/budget-period";
import { formatTransactionDate } from "@/lib/format-date";
import { formatMoney } from "@/lib/format-money";
import { t } from "@/lib/i18n";
import {
  hasPartnerBudget,
  myDisplayName,
  partnerDisplayName,
  partnerTabLabel,
} from "@/lib/owner-labels";
import { displayTransactionNote } from "@/lib/transaction-note";
import { CHART_HIDDEN_KEY } from "@/lib/storage-reset";
import {
  usePeriodCategoryTransactions,
  useStatsPeriod,
  usePeriodOwnerTotals,
  usePeriodTypeCategoryBreakdown,
  useStore,
} from "@/store/useStore";

function readHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(CHART_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHidden(hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(CHART_HIDDEN_KEY, "1");
    else localStorage.removeItem(CHART_HIDDEN_KEY);
  } catch {
    /* ignore */
  }
}

function TotalsPanel({ variant }: { variant: "expense" | "income" }) {
  const locale = useStore((s) => s.locale);
  const userName = useStore((s) => s.userName);
  const partnerName = useStore((s) => s.partnerName);
  const partnerKeywords = useStore((s) => s.partnerKeywords);
  const householdFilter = useStore((s) => s.householdFilter);
  const totals = usePeriodOwnerTotals();
  const txType = variant === "expense" ? "expense" : "income";
  const categories = usePeriodTypeCategoryBreakdown(txType, householdFilter);
  const [showCategories, setShowCategories] = useState(true);
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(
    null,
  );
  const expandedTransactions = usePeriodCategoryTransactions(
    txType,
    householdFilter,
    expandedCategoryId,
  );

  const showPartner = hasPartnerBudget(partnerName, partnerKeywords);
  const partnerLabel =
    partnerDisplayName(partnerName) ||
    partnerTabLabel(locale, partnerName, partnerKeywords);
  const meLabel = myDisplayName(locale, userName);
  const meAmount = variant === "expense" ? totals.me.expense : totals.me.income;
  const partnerAmount =
    variant === "expense" ? totals.partner.expense : totals.partner.income;
  const total = meAmount + partnerAmount;
  const color =
    variant === "income"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400";

  const displayTotal =
    householdFilter === "all"
      ? total
      : householdFilter === "me"
        ? meAmount
        : partnerAmount;

  return (
    <div className="space-y-3">
      {showPartner ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {t(locale, "householdFilterLabel")}
          </p>
          <HouseholdFilterTabs />
        </div>
      ) : null}
      {householdFilter === "all" && showPartner ? (
        <>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{meLabel}</span>
            <span className={`font-semibold tabular-nums ${color}`}>
              {formatMoney(meAmount, locale)} {t(locale, "currency")}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{partnerLabel}</span>
            <span className={`font-semibold tabular-nums ${color}`}>
              {formatMoney(partnerAmount, locale)} {t(locale, "currency")}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 border-t pt-2 text-sm">
            <span className="font-medium text-muted-foreground">
              {t(locale, "householdAll")}
            </span>
            <span className={`font-semibold tabular-nums ${color}`}>
              {formatMoney(total, locale)} {t(locale, "currency")}
            </span>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {householdFilter === "me"
              ? meLabel
              : householdFilter === "partner"
                ? partnerLabel
                : t(locale, "filterAll")}
          </span>
          <span className={`font-semibold tabular-nums ${color}`}>
            {formatMoney(displayTotal, locale)} {t(locale, "currency")}
          </span>
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full text-xs"
        onClick={() => setShowCategories((v) => !v)}
      >
        {showCategories
          ? t(locale, "summaryHideCategories")
          : t(locale, "summaryByCategories")}
      </Button>
      {showCategories ? (
        categories.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t(locale, "summaryCategoriesEmpty")}
          </p>
        ) : (
          <ul className="space-y-1.5 border-t pt-2">
            {categories.map((row, index) => {
              const pct =
                displayTotal > 0
                  ? Math.round((row.value / displayTotal) * 100)
                  : 0;
              const expanded = expandedCategoryId === row.categoryId;
              const shownTransactions = expanded
                ? expandedTransactions.slice(0, 8)
                : [];
              return (
                <li key={row.categoryId} className="space-y-1 text-xs">
                  <button
                    type="button"
                    className="flex w-full items-baseline justify-between gap-2 text-left"
                    onClick={() =>
                      setExpandedCategoryId((current) =>
                        current === row.categoryId ? null : row.categoryId,
                      )
                    }
                  >
                    <span className="min-w-0 truncate text-muted-foreground">
                      <span className="mr-1.5 tabular-nums text-foreground/50">
                        {index + 1}.
                      </span>
                      {row.category}
                    </span>
                    <span
                      className={`shrink-0 font-medium tabular-nums ${color}`}
                    >
                      {formatMoney(row.value, locale)}{" "}
                      {pct > 0 ? `(${pct}%)` : ""}
                    </span>
                  </button>
                  {expanded ? (
                    <div className="rounded-md border border-border/50 bg-background/70 p-2">
                      {shownTransactions.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">
                          {locale === "ru"
                            ? "Операций пока нет"
                            : "No transactions yet"}
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {shownTransactions.map((transaction) => (
                            <li
                              key={transaction.id}
                              className="flex items-start justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-[11px] font-medium text-foreground">
                                  {displayTransactionNote(
                                    transaction.note,
                                    transaction.amount,
                                  ) || row.category}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {formatTransactionDate(
                                    transaction.date,
                                    locale,
                                  )}
                                </p>
                              </div>
                              <span
                                className={`shrink-0 font-medium tabular-nums ${color}`}
                              >
                                {formatMoney(transaction.amount, locale)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {expandedTransactions.length >
                      shownTransactions.length ? (
                        <p className="mt-2 text-[10px] text-muted-foreground">
                          {locale === "ru"
                            ? `И ещё ${expandedTransactions.length - shownTransactions.length}`
                            : `${expandedTransactions.length - shownTransactions.length} more`}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </div>
  );
}

export function FinancialChart({
  collapsible = true,
}: { collapsible?: boolean } = {}) {
  const locale = useStore((s) => s.locale);
  const period = useStatsPeriod();
  const periodTotals = usePeriodOwnerTotals();
  const [mounted, setMounted] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [tab, setTab] = useState("expenses");

  const periodLabel = formatBudgetPeriodLabel(period, locale);

  const hasExpenseData =
    periodTotals.me.expense + periodTotals.partner.expense > 0;
  const hasIncomeData =
    periodTotals.me.income + periodTotals.partner.income > 0;
  const hasAnyData = hasExpenseData || hasIncomeData;

  useEffect(() => {
    setMounted(true);
    setHidden(collapsible ? readHidden() : false);
  }, [collapsible]);

  const show = useCallback(() => {
    setHidden(false);
    writeHidden(false);
  }, []);

  const hide = useCallback(() => {
    setHidden(true);
    writeHidden(true);
  }, []);

  const title = t(locale, "chartTitle");

  if (!mounted) {
    return (
      <Card className="border-primary/20">
        <HomeSectionCardHeader icon={BarChart3} title={title} />
        <CardContent>
          <div className="h-[240px] w-full animate-pulse rounded-md bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (collapsible && hidden) {
    return (
      <div data-onboarding="chart">
        <HomeSectionCollapsedBar
          icon={BarChart3}
          title={title}
          action={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={sectionToggleButtonClassName}
              onClick={show}
            >
              <ChevronDown className="h-4 w-4" />
              {t(locale, "summaryShow")}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <Card className="border-primary/20" data-onboarding="chart">
      <HomeSectionCardHeader
        icon={BarChart3}
        title={title}
        subtitle={t(locale, "chartPeriod", { period: periodLabel })}
        action={
          collapsible ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={sectionToggleButtonClassName}
              onClick={hide}
            >
              <ChevronUp className="h-4 w-4" />
              {t(locale, "summaryHide")}
            </Button>
          ) : null
        }
      />
      <CardContent className={`overflow-hidden ${homeSectionContentClassName}`}>
        {!hasAnyData ? (
          <>
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t(locale, "chartEmpty")}
            </p>
            <StatisticsPeriodControls />
          </>
        ) : (
          <div className="space-y-3">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="mb-3 grid w-full grid-cols-2">
                <TabsTrigger value="expenses">
                  <TrendingDown className="mr-1 inline h-3.5 w-3.5" />
                  {t(locale, "chartTabExpenses")}
                </TabsTrigger>
                <TabsTrigger value="income">
                  <TrendingUp className="mr-1 inline h-3.5 w-3.5" />
                  {t(locale, "chartTabIncome")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="expenses">
                {hasExpenseData ? (
                  <TotalsPanel variant="expense" />
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {t(locale, "chartEmpty")}
                  </p>
                )}
              </TabsContent>

              <TabsContent value="income">
                {hasIncomeData ? (
                  <TotalsPanel variant="income" />
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {t(locale, "chartEmpty")}
                  </p>
                )}
              </TabsContent>
            </Tabs>
            <StatisticsPeriodControls />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

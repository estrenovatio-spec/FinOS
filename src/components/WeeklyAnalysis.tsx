"use client";

import { CalendarDays, ChevronDown, ChevronUp, Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdvisorConfig } from "@/lib/advisor-config";
import { formatIsoDate } from "@/lib/format-date";
import { getCategoryLabel } from "@/lib/categories";
import { formatDaysLabel, t } from "@/lib/i18n";
import {
  getCachedWeeklyAnalysis,
  setCachedWeeklyAnalysis,
  WEEKLY_ANALYSIS_TTL_MS,
} from "@/lib/storage";
import { WEEKLY_ANALYSIS_HIDDEN_KEY } from "@/lib/storage-reset";
import { buildAiCoachingContext } from "@/lib/ai-coaching-context";
import {
  buildWeeklySummary,
  getWeeklyGate,
  getWeeklyWaitingMessages,
  ruleBasedWeeklyAnalysis,
} from "@/lib/weekly-analysis";
import { useCategories, useStore, useTransactions } from "@/store/useStore";

function readHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(WEEKLY_ANALYSIS_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHidden(hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(WEEKLY_ANALYSIS_HIDDEN_KEY, "1");
    else localStorage.removeItem(WEEKLY_ANALYSIS_HIDDEN_KEY);
  } catch {
    /* ignore */
  }
}

function daysUntilNext(msRemaining: number): number {
  return Math.max(1, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
}

export function WeeklyAnalysis() {
  const locale = useStore((s) => s.locale);
  const trackingStartedAt = useStore((s) => s.trackingStartedAt);
  const transactions = useTransactions();
  const categories = useCategories();
  const savingsGoals = useStore((s) => s.savingsGoals);
  const categoryBudgets = useStore((s) => s.categoryBudgets);

  const [hidden, setHidden] = useState(false);
  const [items, setItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextInDays, setNextInDays] = useState<number | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [isFullAnalysis, setIsFullAnalysis] = useState(false);

  const summary = useMemo(
    () =>
      buildWeeklySummary(transactions, trackingStartedAt, (id) =>
        getCategoryLabel(id, categories, locale),
      ),
    [categories, locale, transactions, trackingStartedAt],
  );

  const gate = useMemo(
    () => getWeeklyGate(summary, trackingStartedAt, transactions),
    [summary, trackingStartedAt, transactions],
  );

  const coaching = useMemo(
    () =>
      buildAiCoachingContext(
        transactions,
        savingsGoals,
        categoryBudgets,
        (id) => getCategoryLabel(id, categories, locale),
        summary.periodStart,
        summary.periodEnd,
      ),
    [
      transactions,
      savingsGoals,
      categoryBudgets,
      categories,
      locale,
      summary.periodStart,
      summary.periodEnd,
    ],
  );

  const loadAnalysis = useCallback(
    async (force = false) => {
      if (!gate.ready) {
        setItems(getWeeklyWaitingMessages(gate, locale, summary));
        setNextInDays(null);
        setIsFullAnalysis(false);
        setUsedFallback(false);
        return;
      }

      if (!force) {
        const cached = getCachedWeeklyAnalysis();
        if (cached) {
          setItems(cached.items);
          setIsFullAnalysis(true);
          setNextInDays(
            daysUntilNext(WEEKLY_ANALYSIS_TTL_MS - (Date.now() - cached.generatedAt)),
          );
          return;
        }
      }

      setLoading(true);
      setUsedFallback(false);
      try {
        const res = await fetch("/api/weekly-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locale,
            summary,
            coaching:
              coaching.savingsGoals.length > 0 || coaching.categoryBudgets.length > 0
                ? coaching
                : undefined,
          }),
        });

        const json = (await res.json()) as {
          success?: boolean;
          tips?: string[];
          fallback?: boolean;
          error?: string;
        };

        if (!res.ok || !json.success || !json.tips?.length) {
          setItems(getWeeklyWaitingMessages(gate, locale, summary));
          setIsFullAnalysis(false);
          setNextInDays(null);
          return;
        }

        setItems(json.tips);
        setCachedWeeklyAnalysis(json.tips, summary.periodEnd);
        setNextInDays(7);
        setIsFullAnalysis(true);
        setUsedFallback(Boolean(json.fallback));
      } catch {
        const tips = ruleBasedWeeklyAnalysis(summary, locale, getAdvisorConfig());
        setItems(tips);
        setCachedWeeklyAnalysis(tips, summary.periodEnd);
        setNextInDays(7);
        setIsFullAnalysis(true);
        setUsedFallback(true);
      } finally {
        setLoading(false);
      }
    },
    [coaching, gate, locale, summary],
  );

  useEffect(() => {
    setHidden(readHidden());
  }, []);

  useEffect(() => {
    if (hidden) return;
    void loadAnalysis(false);
  }, [hidden, loadAnalysis]);

  const show = useCallback(() => {
    setHidden(false);
    writeHidden(false);
  }, []);

  const hide = useCallback(() => {
    setHidden(true);
    writeHidden(true);
  }, []);

  if (hidden) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/20 px-3 py-2.5">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{t(locale, "weeklyTitle")}</span>
        </span>
        <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1" onClick={show}>
          <ChevronDown className="h-4 w-4" />
          {t(locale, "weeklyShow")}
        </Button>
      </div>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            {t(locale, "weeklyTitle")}
          </CardTitle>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarDays className="h-3 w-3" />
            {gate.ready
              ? t(locale, "weeklyPeriod", {
                  from: formatIsoDate(summary.periodStart, locale),
                  to: formatIsoDate(summary.periodEnd, locale),
                })
              : t(locale, "weeklySubtitleWaiting")}
          </p>
          {nextInDays !== null && isFullAnalysis && (
            <p className="text-xs text-muted-foreground">
              {t(locale, "weeklyNextIn", { daysLabel: formatDaysLabel(nextInDays, locale) })}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 gap-1 px-2 text-xs"
          onClick={hide}
        >
          <ChevronUp className="h-4 w-4" />
          {t(locale, "weeklyHide")}
        </Button>
      </CardHeader>
      <CardContent>
        {loading && items.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t(locale, "weeklyLoading")}
          </p>
        ) : (
          <>
            {usedFallback && isFullAnalysis && (
              <p className="mb-2 text-xs text-muted-foreground">{t(locale, "weeklyFallback")}</p>
            )}
            {!gate.ready && (
              <p className="mb-2 text-xs text-muted-foreground">{t(locale, "weeklyNoRush")}</p>
            )}
            <ul className="space-y-2 text-sm">
              {items.map((item, i) => (
                <li
                  key={`${i}-${item.slice(0, 24)}`}
                  className={
                    isFullAnalysis
                      ? "rounded-md bg-primary/5 p-2 leading-snug"
                      : "rounded-md border border-dashed border-muted-foreground/30 p-2 leading-snug text-muted-foreground"
                  }
                >
                  {item}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

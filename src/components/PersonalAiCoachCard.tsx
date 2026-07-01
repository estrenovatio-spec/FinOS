"use client";

import { BrainCircuit, ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";
import {
  HomeSectionCardHeader,
  HomeSectionCollapsedBar,
  sectionToggleButtonClassName,
} from "@/components/HomeSectionCardHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  buildAiCoachingContext,
  buildFamilyAdvisorSpotlight,
} from "@/lib/ai-coaching-context";
import { getCurrentBudgetPeriod } from "@/lib/budget-period";
import { cn } from "@/lib/utils";
import { useCategories, useStore, useTransactions } from "@/store/useStore";
import { useFamilyAdvisorSpotlight } from "@/components/useFamilyAdvisorSpotlight";

const AI_COACH_CARD_HIDDEN_KEY = "voicebudget-ai-coach-card-hidden";

function readHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(AI_COACH_CARD_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHidden(hidden: boolean): void {
  try {
    if (hidden) window.localStorage.setItem(AI_COACH_CARD_HIDDEN_KEY, "1");
    else window.localStorage.removeItem(AI_COACH_CARD_HIDDEN_KEY);
  } catch {
    /* localStorage may be blocked */
  }
}

export function PersonalAiCoachCard() {
  const locale = useStore((s) => s.locale);
  const budgetMonthStartDay = useStore((s) => s.budgetMonthStartDay);
  const savingsGoals = useStore((s) => s.savingsGoals);
  const categoryBudgets = useStore((s) => s.categoryBudgets);
  const transactions = useTransactions();
  const categories = useCategories();
  const [hidden, setHidden] = useState(readHidden);

  const ctx = useMemo(() => {
    const period = getCurrentBudgetPeriod(budgetMonthStartDay);
    return buildAiCoachingContext(
      transactions,
      savingsGoals,
      categoryBudgets,
      (id) => {
        const cat = categories.find((item) => item.id === id);
        return cat ? (locale === "ru" ? cat.labels.ru : cat.labels.en) : id;
      },
      period.from,
      period.to,
      categories,
      locale,
    );
  }, [
    budgetMonthStartDay,
    categories,
    categoryBudgets,
    locale,
    savingsGoals,
    transactions,
  ]);

  const rulesCount = ctx.personalMemory?.learnedRules.length ?? 0;
  const baseSpotlight = buildFamilyAdvisorSpotlight(ctx, locale);
  const spotlight = useFamilyAdvisorSpotlight(baseSpotlight, ctx, locale);
  const title = locale === "ru" ? "Финсоветник заметил" : "Advisor noticed";

  if (!spotlight || (transactions.length < 3 && rulesCount === 0)) return null;

  const show = () => {
    setHidden(false);
    writeHidden(false);
  };

  const hide = () => {
    setHidden(true);
    writeHidden(true);
  };

  if (hidden) {
    return (
      <HomeSectionCollapsedBar
        icon={BrainCircuit}
        title={title}
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={sectionToggleButtonClassName}
            onClick={show}
          >
            <ChevronDown className="h-4 w-4" aria-hidden />
            {locale === "ru" ? "Показать" : "Show"}
          </Button>
        }
      />
    );
  }

  return (
    <Card className="border-primary/20">
      <HomeSectionCardHeader
        icon={BrainCircuit}
        title={title}
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={sectionToggleButtonClassName}
            onClick={hide}
          >
            <ChevronUp className="h-4 w-4" aria-hidden />
            {locale === "ru" ? "Скрыть" : "Hide"}
          </Button>
        }
      />
      <CardContent className="space-y-2 text-sm">
        <div
          className={cn(
            "rounded-md border p-2.5 leading-snug",
            spotlight.tone === "risk"
              ? "border-red-500/25 bg-red-500/5 dark:border-red-400/30 dark:bg-red-950/35"
              : spotlight.tone === "watch"
                ? "border-amber-500/25 bg-amber-500/5 dark:border-amber-400/30 dark:bg-amber-950/35"
                : "border-emerald-500/20 bg-emerald-500/5 dark:border-emerald-400/30 dark:bg-emerald-950/35",
          )}
        >
          <p className="font-medium">{spotlight.title}</p>
          <p className="mt-1 text-muted-foreground">{spotlight.text}</p>
          <p className="mt-2 text-xs font-medium text-foreground">
            {spotlight.action}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

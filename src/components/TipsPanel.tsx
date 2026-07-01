"use client";

import {
  ChevronDown,
  ChevronUp,
  Lightbulb,
  MessageCircle,
  Shuffle,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  HomeSectionCardHeader,
  HomeSectionCollapsedBar,
  homeSectionContentClassName,
  sectionToggleButtonClassName,
} from "@/components/HomeSectionCardHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { AiAnalysisTab } from "@/components/AiAnalysisTab";
import { buildAiCoachingContext, buildFamilyAdvisorSpotlight } from "@/lib/ai-coaching-context";
import { getCategoryLabel } from "@/lib/categories";
import { getDaysTracked } from "@/lib/budget-analytics";
import { getCurrentBudgetPeriod } from "@/lib/budget-period";
import { pickRandomMiniTips } from "@/lib/budget-mini-tips";
import { getAdvisorConfig } from "@/lib/advisor-config";
import { t } from "@/lib/i18n";
import { pickRandomPlanningTips } from "@/lib/planning-tips";
import {
  AI_RECOMMENDATIONS_HIDDEN_KEY,
  TIPS_PANEL_HIDDEN_KEY,
  WEEKLY_ANALYSIS_HIDDEN_KEY,
} from "@/lib/storage-reset";
import { useCategories, useStore, useTransactions } from "@/store/useStore";

function toneClass(tone: "ok" | "watch" | "risk"): string {
  if (tone === "risk") return "border-destructive/20 bg-destructive/5";
  if (tone === "watch") return "border-amber-500/20 bg-amber-500/5";
  return "border-emerald-500/20 bg-emerald-500/5";
}

const TIP_COUNT = 3;

function readHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      localStorage.getItem(TIPS_PANEL_HIDDEN_KEY) === "1" ||
      localStorage.getItem(AI_RECOMMENDATIONS_HIDDEN_KEY) === "1" ||
      localStorage.getItem(WEEKLY_ANALYSIS_HIDDEN_KEY) === "1"
    );
  } catch {
    return false;
  }
}

function writeHidden(hidden: boolean): void {
  try {
    if (hidden) {
      localStorage.setItem(TIPS_PANEL_HIDDEN_KEY, "1");
      localStorage.setItem(AI_RECOMMENDATIONS_HIDDEN_KEY, "1");
      localStorage.setItem(WEEKLY_ANALYSIS_HIDDEN_KEY, "1");
    } else {
      localStorage.removeItem(TIPS_PANEL_HIDDEN_KEY);
      localStorage.removeItem(AI_RECOMMENDATIONS_HIDDEN_KEY);
      localStorage.removeItem(WEEKLY_ANALYSIS_HIDDEN_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function TipsPanel({ collapsible = true }: { collapsible?: boolean } = {}) {
  const locale = useStore((s) => s.locale);
  const trackingStartedAt = useStore((s) => s.trackingStartedAt);
  const transactions = useTransactions();
  const categories = useCategories();
  const savingsGoals = useStore((s) => s.savingsGoals);
  const categoryBudgets = useStore((s) => s.categoryBudgets);
  const budgetMonthStartDay = useStore((s) => s.budgetMonthStartDay);
  const advisor = useMemo(() => getAdvisorConfig(), []);
  const [hidden, setHidden] = useState(false);
  const [tab, setTab] = useState("ai");
  const [miniTips, setMiniTips] = useState(() => pickRandomMiniTips(TIP_COUNT));
  const [planningTips, setPlanningTips] = useState(() =>
    pickRandomPlanningTips(locale, advisor, TIP_COUNT),
  );

  useEffect(() => {
    setHidden(collapsible ? readHidden() : false);
  }, [collapsible]);

  useEffect(() => {
    setPlanningTips(pickRandomPlanningTips(locale, advisor, TIP_COUNT));
  }, [locale, advisor]);

  const advisorContext = useMemo(() => {
    const period = getCurrentBudgetPeriod(budgetMonthStartDay);
    return buildAiCoachingContext(
      transactions,
      savingsGoals,
      categoryBudgets,
      (id) => getCategoryLabel(id, categories, locale),
      period.from,
      period.to,
      categories,
      locale,
    );
  }, [budgetMonthStartDay, categories, categoryBudgets, locale, savingsGoals, transactions]);

  const spotlight = useMemo(
    () => buildFamilyAdvisorSpotlight(advisorContext, locale),
    [advisorContext, locale],
  );
  const daysTracked = useMemo(
    () => getDaysTracked(trackingStartedAt, transactions),
    [trackingStartedAt, transactions],
  );
  const showStarterCards = daysTracked < 14 || transactions.length < 20;
  const starterCards = locale === "ru"
    ? [
        {
          title: "Свободные деньги",
          text: "Это деньги, которые остались после доходов и расходов за текущий период. Их и показываем сверху.",
        },
        {
          title: "Лимит категории",
          text: "Лимит нужен не чтобы ругать, а чтобы заметить рост траты раньше, чем закончится месяц.",
        },
        {
          title: "Регулярная трата",
          text: "Регулярным лучше считать только то, что человек сам отметил как повторяющееся. Повторы без настройки — просто повторы.",
        },
      ]
    : [
        {
          title: "Free money",
          text: "This is what remains after current period income and expenses. It is the number shown at the top.",
        },
        {
          title: "Category limit",
          text: "A limit is not a punishment. It helps you spot growth before the month runs out.",
        },
        {
          title: "Recurring spend",
          text: "Only treat something as recurring when the user marks it that way. Repeats alone are just repeats.",
        },
      ];

  const shuffleMini = useCallback(() => {
    setMiniTips(pickRandomMiniTips(TIP_COUNT));
  }, []);

  const shufflePlanning = useCallback(() => {
    setPlanningTips(pickRandomPlanningTips(locale, advisor, TIP_COUNT));
  }, [locale, advisor]);

  const show = useCallback(() => {
    setHidden(false);
    writeHidden(false);
  }, []);

  const hide = useCallback(() => {
    setHidden(true);
    writeHidden(true);
  }, []);

  if (collapsible && hidden) {
    return (
      <div data-onboarding="tips">
        <HomeSectionCollapsedBar
          icon={Sparkles}
          title={t(locale, "tipsPanelTitle")}
          action={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={sectionToggleButtonClassName}
              onClick={show}
            >
              <ChevronDown className="h-4 w-4" />
              {t(locale, "recommendationsShow")}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <Card className="border-primary/20" data-onboarding="tips">
      <HomeSectionCardHeader
        icon={Sparkles}
        title={t(locale, "tipsPanelTitle")}
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
              {t(locale, "recommendationsHide")}
            </Button>
          ) : null
        }
      />
      <CardContent className={homeSectionContentClassName}>
        {spotlight ? (
          <div className={cn("mb-3 rounded-lg border p-3", toneClass(spotlight.tone))}>
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
              {locale === "ru" ? "Финсоветник" : "Advisor"}
            </p>
            <p className="mt-1 text-sm font-medium leading-snug text-foreground">
              {spotlight.title}
            </p>
            <p className="mt-1 text-sm leading-snug text-foreground/90">{spotlight.text}</p>
            <p className="mt-2 text-xs leading-snug text-muted-foreground">{spotlight.action}</p>
          </div>
        ) : null}
        {showStarterCards ? (
          <div className="mb-3 grid gap-2 sm:grid-cols-3">
            {starterCards.map((card) => (
              <div key={card.title} className="rounded-lg border border-border/70 bg-background/60 p-2.5">
                <p className="text-xs font-semibold text-foreground">{card.title}</p>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">{card.text}</p>
              </div>
            ))}
          </div>
        ) : null}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-3 grid w-full grid-cols-3">
            <TabsTrigger value="ai" className="gap-1 text-xs sm:text-sm">
              <Sparkles className="hidden h-3.5 w-3.5 sm:inline" />
              <span className="truncate">{t(locale, "tipsTabAi")}</span>
            </TabsTrigger>
            <TabsTrigger value="mini" className="gap-1 text-xs sm:text-sm">
              <MessageCircle className="hidden h-3.5 w-3.5 sm:inline" />
              <span className="truncate">{t(locale, "tipsTabMini")}</span>
            </TabsTrigger>
            <TabsTrigger value="planning" className="gap-1 text-xs sm:text-sm">
              <Lightbulb className="hidden h-3.5 w-3.5 sm:inline" />
              <span className="truncate">{t(locale, "tipsTabPlanning")}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ai">
            <AiAnalysisTab active={tab === "ai"} />
          </TabsContent>
          <TabsContent value="mini">
            <div className="space-y-2">
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 px-2 text-xs"
                  onClick={shuffleMini}
                >
                  <Shuffle className="h-4 w-4" />
                  {t(locale, "quotesShuffle")}
                </Button>
              </div>
              <ul className="space-y-2 text-sm">
                {miniTips.map((tip) => (
                  <li
                    key={tip}
                    className="rounded-md bg-secondary/60 p-2.5 leading-snug text-foreground/90"
                  >
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </TabsContent>
          <TabsContent value="planning">
            <div className="space-y-2">
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 px-2 text-xs"
                  onClick={shufflePlanning}
                >
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  {t(locale, "planningTipsShuffle")}
                </Button>
              </div>
              <ul className="space-y-2 text-sm">
                {planningTips.map((tip) => (
                  <li
                    key={tip}
                    className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2.5 leading-snug text-foreground/90"
                  >
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

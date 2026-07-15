"use client";

import { MessageCircleQuestion, Sparkles, TrendingUp, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { AiWeeklyMissionTab } from "@/components/AiWeeklyMissionTab";
import { MonthlyAnalysisTab } from "@/components/MonthlyAnalysisTab";
import { WeeklyAnalysisTab } from "@/components/WeeklyAnalysisTab";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildAdvisorContext } from "@/lib/advisor-context";
import { decisionCoreSnapshot } from "@/lib/decision-core";
import { formatIsoDate, getLocalTodayIsoDate } from "@/lib/format-date";
import { t } from "@/lib/i18n";
import { useHouseholdBalances, useStore, useViewerMappedTransactions } from "@/store/useStore";

type AiSubTab = "questions" | "mission" | "weekly" | "monthly";

type AiAnalysisTabProps = {
  active: boolean;
  reportsOnly?: boolean;
};

export function AiAnalysisTab({ active, reportsOnly = false }: AiAnalysisTabProps) {
  const locale = useStore((s) => s.locale);
  const forecastHorizonMonths = useStore((s) => s.forecastHorizonMonths);
  const categories = useStore((s) => s.categories);
  const moneySetup = useStore((s) => s.moneySetup);
  const recurringTransactions = useStore((s) => s.recurringTransactions);
  const debts = useStore((s) => s.debts);
  const categoryBudgets = useStore((s) => s.categoryBudgets);
  const budgetMonthStartDay = useStore((s) => s.budgetMonthStartDay);
  const householdFilter = useStore((s) => s.householdFilter);
  const savingsGoals = useStore((s) => s.savingsGoals);
  const balances = useHouseholdBalances();
  const transactions = useViewerMappedTransactions(false);
  const [subTab, setSubTab] = useState<AiSubTab>(reportsOnly ? "weekly" : "questions");
  const [draftQuestion, setDraftQuestion] = useState("");
  const today = getLocalTodayIsoDate();

  const decision = useMemo(
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
      budgetMonthStartDay,
      categories,
      categoryBudgets,
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

  const advisorContext = useMemo(
    () =>
      buildAdvisorContext({
        locale,
        currentBalance: balances.me,
        decision,
        recurringTransactions,
        goals: savingsGoals,
        debts,
        categoryBudgets,
      }),
    [balances.me, categoryBudgets, decision, debts, locale, recurringTransactions, savingsGoals],
  );

  const periodNote =
    locale === "ru"
      ? `Прогноз сейчас смотрит до ${formatIsoDate(decision.forecast.horizonEndDate, locale)}.`
      : `The forecast currently looks through ${formatIsoDate(decision.forecast.horizonEndDate, locale)}.`;

  return (
    <div className="space-y-3">
      <Tabs value={subTab} onValueChange={(v) => setSubTab(v as AiSubTab)}>
      <TabsList className={`mb-3 grid w-full ${reportsOnly ? "grid-cols-2" : "grid-cols-4"}`}>
        {!reportsOnly ? (
          <TabsTrigger value="questions" className="h-auto min-h-10 px-1 text-xs leading-tight">
            {locale === "ru" ? (
              <>
                Вопросы
                <br />
                и помощь
              </>
            ) : (
              <>
                Questions
                <br />
                and help
              </>
            )}
          </TabsTrigger>
        ) : null}
        {!reportsOnly ? (
          <TabsTrigger value="mission" className="h-auto min-h-10 px-1 text-xs leading-tight">
            {locale === "ru" ? (
              <>
                Миссия
                <br />
                недели
              </>
            ) : (
              <>
                Weekly
                <br />
                mission
              </>
            )}
          </TabsTrigger>
        ) : null}
        <TabsTrigger value="weekly" className="h-auto min-h-10 px-1 text-xs leading-tight">
          {locale === "ru" ? "7 дней" : t(locale, "aiTabWeekly")}
        </TabsTrigger>
        <TabsTrigger value="monthly" className="h-auto min-h-10 px-1 text-xs leading-tight">
          {locale === "ru" ? "30 дней" : t(locale, "aiTabMonthly")}
        </TabsTrigger>
      </TabsList>
      {!reportsOnly ? (
        <TabsContent value="questions" className="space-y-3">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-background/80 p-2 text-primary">
                <MessageCircleQuestion className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {locale === "ru" ? "Финансовый советник" : "Financial advisor"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {locale === "ru"
                    ? "Задайте вопрос простыми словами: хватит ли денег, какие платежи давят на бюджет и где план начинает проседать."
                    : "Ask in plain language: whether money will be enough, which payments pressure the budget, and where the plan starts to slip."}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">{periodNote}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {advisorContext.cards.map((card) => (
              <div key={card.id} className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {card.label}
                </p>
                <p className="mt-2 text-lg font-semibold text-foreground">{card.value}</p>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">{card.note}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {locale === "ru" ? "О чём можно спросить" : "What you can ask"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {locale === "ru"
                    ? "Эти вопросы уже опираются на баланс, прогноз, цели, лимиты и регулярные платежи."
                    : "These starter questions already rely on your balance, forecast, goals, limits, and recurring payments."}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {advisorContext.suggestedQuestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => setDraftQuestion(question)}
                  className="rounded-full border border-border/70 bg-background px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-background p-4">
            <p className="text-sm font-medium text-foreground">
              {locale === "ru" ? "Ваш вопрос" : "Your question"}
            </p>
            <textarea
              value={draftQuestion}
              onChange={(event) => setDraftQuestion(event.target.value)}
              placeholder={
                locale === "ru"
                  ? "Например: если зарплата задержится на неделю, где начнутся проблемы?"
                  : "For example: if my salary is delayed by a week, where will problems start?"
              }
              className="mt-3 min-h-28 w-full rounded-xl border border-border/70 bg-muted/20 px-3 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
            />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="justify-start gap-2"
                onClick={() => setSubTab("weekly")}
              >
                <Wallet className="h-4 w-4" />
                {locale === "ru" ? "Открыть разбор на 7 дней" : "Open 7-day review"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="justify-start gap-2"
                onClick={() => setSubTab("monthly")}
              >
                <TrendingUp className="h-4 w-4" />
                {locale === "ru" ? "Открыть разбор на 30 дней" : "Open 30-day review"}
              </Button>
            </div>
          </div>
        </TabsContent>
      ) : null}
      {!reportsOnly ? (
        <TabsContent value="mission">
          <AiWeeklyMissionTab />
        </TabsContent>
      ) : null}
      <TabsContent value="weekly">
        <WeeklyAnalysisTab active={active && subTab === "weekly"} />
      </TabsContent>
      <TabsContent value="monthly">
        <MonthlyAnalysisTab active={active && subTab === "monthly"} />
      </TabsContent>
      </Tabs>
    </div>
  );
}

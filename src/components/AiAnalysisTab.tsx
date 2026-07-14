"use client";

import { useState } from "react";
import { AiWeeklyMissionTab } from "@/components/AiWeeklyMissionTab";
import { MonthlyAnalysisTab } from "@/components/MonthlyAnalysisTab";
import { WeeklyAnalysisTab } from "@/components/WeeklyAnalysisTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { t } from "@/lib/i18n";
import { useStore } from "@/store/useStore";

type AiSubTab = "mission" | "weekly" | "monthly";

type AiAnalysisTabProps = {
  active: boolean;
  reportsOnly?: boolean;
};

export function AiAnalysisTab({ active, reportsOnly = false }: AiAnalysisTabProps) {
  const locale = useStore((s) => s.locale);
  const [subTab, setSubTab] = useState<AiSubTab>(reportsOnly ? "weekly" : "mission");
  const starterQuestions = locale === "ru"
    ? [
        "Могу ли я сейчас сделать покупку на 10 000 ₽?",
        "Почему в прогнозе появился дефицит?",
        "Сколько можно дополнительно инвестировать?",
        "Что будет, если доход задержится?",
        "Какие платежи самые тяжёлые в этом месяце?",
      ]
    : [
        "Can I afford a 10,000 purchase right now?",
        "Why did a deficit appear in the forecast?",
        "How much more can I invest each month?",
        "What if my income arrives a week later?",
        "Which payments are the heaviest this month?",
      ];

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
        <p className="text-sm font-semibold text-foreground">
          {locale === "ru" ? "Финансовый советник" : "Financial advisor"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {locale === "ru"
            ? "Задайте вопрос о своих деньгах и планах."
            : "Ask a question about your money and plans."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {starterQuestions.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => setSubTab("weekly")}
              className="rounded-full border border-border/70 bg-background px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {question}
            </button>
          ))}
        </div>
      </div>
      <Tabs value={subTab} onValueChange={(v) => setSubTab(v as AiSubTab)}>
      <TabsList className={`mb-3 grid w-full ${reportsOnly ? "grid-cols-2" : "grid-cols-3"}`}>
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

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

  return (
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
  );
}

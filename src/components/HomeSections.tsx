"use client";

import dynamic from "next/dynamic";
import { PlanningPanel } from "@/components/PlanningPanel";
import { TransactionList } from "@/components/TransactionList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStore } from "@/store/useStore";

const FinancialChart = dynamic(
  () => import("@/components/FinancialChart").then((m) => m.FinancialChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-[260px] w-full animate-pulse rounded-lg border bg-muted" />
    ),
  },
);

export function HomeSections() {
  const locale = useStore((s) => s.locale);
  const familyTabClass =
    "h-auto min-h-10 rounded-md px-1 text-[11px] font-semibold leading-tight text-foreground/70 transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm";

  return (
    <Tabs defaultValue="operations" className="space-y-2">
      <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-lg border border-primary/25 bg-primary/10 p-1 shadow-sm">
        <TabsTrigger value="operations" className={familyTabClass}>
          {locale === "ru" ? "Операции" : "Operations"}
        </TabsTrigger>
        <TabsTrigger value="summary" className={familyTabClass}>
          {locale === "ru" ? (
            <span className="text-center">
              Сводка
              <br />
              и планы
            </span>
          ) : (
            <span className="text-center">
              Summary
              <br />
              plans
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="operations" className="mt-0">
        <TransactionList collapsible={false} />
      </TabsContent>
      <TabsContent value="summary" className="mt-0 space-y-2">
        <PlanningPanel collapsible={false} />
        <FinancialChart collapsible={false} />
      </TabsContent>
    </Tabs>
  );
}

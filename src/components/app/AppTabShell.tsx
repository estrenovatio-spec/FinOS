"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AppBottomNav } from "@/components/app/AppBottomNav";
import {
  readStoredAppTab,
  writeStoredAppTab,
  type AppTabId,
} from "@/lib/app-bottom-nav";

export function AppTabShell({
  todayContent,
  operationsContent,
  forecastContent,
  recurringContent,
  settingsContent,
}: {
  todayContent: ReactNode;
  operationsContent: ReactNode;
  forecastContent: ReactNode;
  recurringContent: ReactNode;
  settingsContent: ReactNode;
}) {
  const [tab, setTab] = useState<AppTabId>("today");

  useEffect(() => {
    setTab(readStoredAppTab());
  }, []);

  const changeTab = (next: AppTabId) => {
    setTab(next);
    writeStoredAppTab(next);
  };

  return (
    <>
      <div className="min-h-0 flex-1">
        {tab === "today" ? todayContent : null}
        {tab === "operations" ? operationsContent : null}
        {tab === "forecast" ? forecastContent : null}
        {tab === "recurring" ? recurringContent : null}
        {tab === "settings" ? settingsContent : null}
      </div>
      <AppBottomNav active={tab} onChange={changeTab} />
    </>
  );
}

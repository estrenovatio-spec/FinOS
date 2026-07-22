"use client";

import { useCallback, type ReactNode } from "react";
import { AppBottomNav } from "@/components/app/AppBottomNav";
import { useBusinessCloudSync } from "@/hooks/useBusinessCloudSync";
import { type AppTabId, writeStoredAppTab } from "@/lib/app-bottom-nav";

export function PreviewAppShell({
  todayContent,
  operationsContent,
  forecastContent,
  planContent,
  settingsContent,
  previewNav,
}: {
  todayContent: ReactNode;
  operationsContent: ReactNode;
  forecastContent: ReactNode;
  planContent: ReactNode;
  settingsContent: ReactNode;
  previewNav: { active: AppTabId; onChange: (tab: AppTabId) => void };
}) {
  const { active, onChange } = previewNav;

  useBusinessCloudSync();

  const changeTab = useCallback(
    (next: AppTabId) => {
      writeStoredAppTab(next);
      onChange(next);
    },
    [onChange],
  );

  return (
    <>
      {active === "today" ? <div className="space-y-4">{todayContent}</div> : null}
      {active === "operations" ? (
        <div className="space-y-4">{operationsContent}</div>
      ) : null}
      {active === "forecast" ? <div className="space-y-4">{forecastContent}</div> : null}
      {active === "plan" ? <div className="space-y-4">{planContent}</div> : null}
      {active === "settings" ? <div className="space-y-4">{settingsContent}</div> : null}
      <AppBottomNav active={active} onChange={changeTab} />
    </>
  );
}

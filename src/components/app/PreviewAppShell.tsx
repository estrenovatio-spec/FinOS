"use client";

import { useCallback, useEffect, type ReactNode } from "react";
import { AppBottomNav } from "@/components/app/AppBottomNav";
import { BusinessTab } from "@/components/app/BusinessTab";
import { MoreTab } from "@/components/app/MoreTab";
import { useBusinessCloudSync } from "@/hooks/useBusinessCloudSync";
import { type AppTabId, writeStoredAppTab } from "@/lib/app-bottom-nav";
import { useStore } from "@/store/useStore";

/** Preview: семья как на проде + переключение вкладок через шапку/нижний nav. */
export function PreviewAppShell({
  homeContent,
  operationsContent,
  advisorContent,
  previewNav,
}: {
  homeContent: ReactNode;
  operationsContent: ReactNode;
  advisorContent: ReactNode;
  previewNav: { active: AppTabId; onChange: (tab: AppTabId) => void };
  }) {
  const { active, onChange } = previewNav;
  const businessModeEnabled = useStore((s) => s.businessModeEnabled);
  const showBusinessTab = businessModeEnabled;

  useBusinessCloudSync();

  const changeTab = useCallback(
    (next: AppTabId) => {
      writeStoredAppTab(next);
      onChange(next);
    },
    [onChange],
  );

  useEffect(() => {
    if (showBusinessTab) return;
    if (active !== "business") return;
    changeTab("home");
  }, [active, changeTab, showBusinessTab]);

  return (
    <>
      {active === "home" ? <div className="space-y-2">{homeContent}</div> : null}
      {active === "operations" ? <div className="space-y-2">{operationsContent}</div> : null}
      {active === "advisor" ? <div className="space-y-2">{advisorContent}</div> : null}
      {active === "business" && showBusinessTab ? (
        <BusinessTab />
      ) : null}
      {active === "more" ? <MoreTab /> : null}
      <AppBottomNav active={active} onChange={changeTab} />
    </>
  );
}

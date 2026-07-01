"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AppBottomNav } from "@/components/app/AppBottomNav";
import { BusinessTab } from "@/components/app/BusinessTab";
import { MoreTab } from "@/components/app/MoreTab";
import {
  readStoredAppTab,
  writeStoredAppTab,
  type AppTabId,
} from "@/lib/app-bottom-nav";
import { useStore } from "@/store/useStore";

export function AppTabShell({ familyContent }: { familyContent: ReactNode }) {
  const [tab, setTab] = useState<AppTabId>("home");
  const businessModeEnabled = useStore((s) => s.businessModeEnabled);
  const showBusinessTab = businessModeEnabled;

  useEffect(() => {
    setTab(readStoredAppTab());
  }, []);

  useEffect(() => {
    if (showBusinessTab) return;
    if (tab !== "business") return;
    setTab("home");
    writeStoredAppTab("home");
  }, [showBusinessTab, tab]);

  const changeTab = (next: AppTabId) => {
    setTab(next);
    writeStoredAppTab(next);
  };

  return (
    <>
      <div className="min-h-0 flex-1">
        {tab === "home" ? familyContent : null}
        {tab === "operations" ? familyContent : null}
        {tab === "advisor" ? familyContent : null}
        {tab === "business" && showBusinessTab ? <BusinessTab /> : null}
        {tab === "more" ? <MoreTab /> : null}
      </div>
      <AppBottomNav active={tab} onChange={changeTab} />
    </>
  );
}

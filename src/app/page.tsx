"use client";

import { PreviewAppShell } from "@/components/app/PreviewAppShell";
import { useRecurringProcessor } from "@/hooks/useRecurringProcessor";
import { HouseholdCloudBootstrap } from "@/components/HouseholdCloudBootstrap";
import { FirstLaunchOnboardingDialog } from "@/components/FirstLaunchOnboardingDialog";
import { SettingsDialogHost } from "@/components/SettingsDialogHost";
import { PaymentReturnRefresh } from "@/components/PaymentReturnRefresh";
import { SubscriptionExpiredReminder } from "@/components/SubscriptionExpiredReminder";
import { SubscriptionAccessBanner } from "@/components/SubscriptionAccessBanner";
import { TrialBanner } from "@/components/TrialBanner";
import { TodayScreen } from "@/components/TodayScreen";
import { ForecastTab } from "@/components/app/ForecastTab";
import { OperationsTab } from "@/components/app/OperationsTab";
import { PlanTab } from "@/components/app/PlanTab";
import { SettingsTab } from "@/components/app/SettingsTab";
import {
  bottomNavEnabled,
  readStoredAppTab,
  writeStoredAppTab,
  type AppTabId,
} from "@/lib/app-bottom-nav";
import {
  readStoredPlanSection,
  writeStoredPlanSection,
  type PlanSection,
} from "@/lib/plan-navigation";
import { detectLocale } from "@/lib/i18n";
import type { ForecastFocus } from "@/lib/forecast-focus";
import { clearDismissibleHintKeys } from "@/lib/storage-reset";
import { useStore } from "@/store/useStore";
import { useCallback, useEffect, useState } from "react";
import { useTelegramBackHandler } from "@/hooks/useTelegramBackHandler";

function TodayTabContent({
  onNavigateToTab,
}: {
  onNavigateToTab: (
    tab: AppTabId,
    options?: {
      forecastFocus?: ForecastFocus | null;
      planSection?: PlanSection;
      entityId?: string | null;
    },
  ) => void;
}) {
  return <TodayScreen onNavigateToTab={onNavigateToTab} />;
}

function OperationsTabContent() {
  return <OperationsTab />;
}

function ForecastTabContent({
  focus,
  onOpenPlan,
}: {
  focus: ForecastFocus | null;
  onOpenPlan: (params: { section: PlanSection; entityId?: string | null }) => void;
}) {
  return <ForecastTab focus={focus} onOpenPlan={onOpenPlan} />;
}

function PlanTabContent({
  section,
  entityId,
  onSectionChange,
}: {
  section: PlanSection;
  entityId: string | null;
  onSectionChange: (section: PlanSection) => void;
}) {
  return <PlanTab section={section} entityId={entityId} onSectionChange={onSectionChange} />;
}

function SettingsTabContent() {
  return <SettingsTab />;
}

export default function HomePage() {
  const setLocale = useStore((s) => s.setLocale);
  const locale = useStore((s) => s.locale);
  const previewMode = bottomNavEnabled();
  const [appView, setAppView] = useState<AppTabId>("today");
  const [forecastFocus, setForecastFocus] = useState<ForecastFocus | null>(null);
  const [planSection, setPlanSection] = useState<PlanSection>("recurring");
  const [planEntityId, setPlanEntityId] = useState<string | null>(null);

  useEffect(() => {
    clearDismissibleHintKeys();
  }, []);

  useEffect(() => {
    if (previewMode) {
      setAppView(readStoredAppTab());
      setPlanSection(readStoredPlanSection());
    }
  }, [previewMode]);

  const onAppViewChange = useCallback((
    tab: AppTabId,
    options?: {
      forecastFocus?: ForecastFocus | null;
      planSection?: PlanSection;
      entityId?: string | null;
    },
  ) => {
    setForecastFocus((current) => {
      if (tab !== "forecast") return null;
      if (options && "forecastFocus" in options) {
        return options.forecastFocus ?? null;
      }
      return current;
    });
    setPlanEntityId(tab === "plan" ? options?.entityId ?? null : null);
    if (tab === "plan" && options?.planSection) {
      setPlanSection(options.planSection);
      writeStoredPlanSection(options.planSection);
    }
    setAppView(tab);
    writeStoredAppTab(tab);
  }, []);

  const onPlanSectionChange = useCallback((section: PlanSection) => {
    setPlanSection(section);
    writeStoredPlanSection(section);
  }, []);

  useEffect(() => {
    if (window.Telegram?.WebApp) return;
    setLocale(detectLocale(navigator.language));
  }, [setLocale]);

  useRecurringProcessor();

  const handlePreviewTelegramBack = useCallback(() => {
    if (!previewMode || appView === "today") return false;
    onAppViewChange("today");
    return true;
  }, [previewMode, appView, onAppViewChange]);

  useTelegramBackHandler(handlePreviewTelegramBack, previewMode && appView !== "today");

  const today = <TodayTabContent onNavigateToTab={onAppViewChange} />;
  const operations = <OperationsTabContent />;
  const forecast = (
    <ForecastTabContent
      focus={forecastFocus}
      onOpenPlan={({ section, entityId }) =>
        onAppViewChange("plan", { planSection: section, entityId: entityId ?? null })
      }
    />
  );
  const plan = (
    <PlanTabContent
      section={planSection}
      entityId={planEntityId}
      onSectionChange={onPlanSectionChange}
    />
  );
  const settings = <SettingsTabContent />;

  return (
    <main
      className={[
        "mx-auto flex min-h-[var(--app-viewport-height,100dvh)] max-w-xl flex-col gap-4 px-4 pb-[calc(var(--app-bottom-nav-height)+1.25rem+env(safe-area-inset-bottom))] pt-3 sm:px-5",
        previewMode
          ? ""
          : "",
      ].join(" ")}
      lang={locale}
    >
      <HouseholdCloudBootstrap />
      <FirstLaunchOnboardingDialog onNavigate={onAppViewChange} />
      <PaymentReturnRefresh />
      <SettingsDialogHost />
      <SubscriptionAccessBanner />
      <TrialBanner />
      <SubscriptionExpiredReminder />
      {previewMode ? (
        <PreviewAppShell
          todayContent={today}
          operationsContent={operations}
          forecastContent={forecast}
          planContent={plan}
          settingsContent={settings}
          previewNav={{ active: appView, onChange: onAppViewChange }}
        />
      ) : (
        today
      )}
    </main>
  );
}

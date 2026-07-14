"use client";

import { PreviewAppShell } from "@/components/app/PreviewAppShell";
import { useRecurringProcessor } from "@/hooks/useRecurringProcessor";
import { HouseholdCloudBootstrap } from "@/components/HouseholdCloudBootstrap";
import { SettingsDialogHost } from "@/components/SettingsDialogHost";
import { PaymentReturnRefresh } from "@/components/PaymentReturnRefresh";
import { SubscriptionExpiredReminder } from "@/components/SubscriptionExpiredReminder";
import { SubscriptionAccessBanner } from "@/components/SubscriptionAccessBanner";
import { TrialBanner } from "@/components/TrialBanner";
import { TodayScreen } from "@/components/TodayScreen";
import { EmailSyncOnboardingDialog } from "@/components/EmailSyncOnboardingDialog";
import { ForecastTab } from "@/components/app/ForecastTab";
import { OperationsTab } from "@/components/app/OperationsTab";
import { RecurringTab } from "@/components/app/RecurringTab";
import { SettingsTab } from "@/components/app/SettingsTab";
import {
  bottomNavEnabled,
  readStoredAppTab,
  writeStoredAppTab,
  type AppTabId,
} from "@/lib/app-bottom-nav";
import { FamilyOnboarding } from "@/components/FamilyOnboarding";
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
    options?: { forecastFocus?: ForecastFocus | null },
  ) => void;
}) {
  return <TodayScreen onNavigateToTab={onNavigateToTab} />;
}

function OperationsTabContent() {
  return <OperationsTab />;
}

function ForecastTabContent({
  focus,
}: {
  focus: ForecastFocus | null;
}) {
  return <ForecastTab focus={focus} />;
}

function RecurringTabContent() {
  return <RecurringTab />;
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

  useEffect(() => {
    clearDismissibleHintKeys();
  }, []);

  useEffect(() => {
    if (previewMode) setAppView(readStoredAppTab());
  }, [previewMode]);

  const onAppViewChange = useCallback((
    tab: AppTabId,
    options?: { forecastFocus?: ForecastFocus | null },
  ) => {
    setForecastFocus((current) => {
      if (tab !== "forecast") return null;
      if (options && "forecastFocus" in options) {
        return options.forecastFocus ?? null;
      }
      return current;
    });
    setAppView(tab);
    writeStoredAppTab(tab);
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
  const forecast = <ForecastTabContent focus={forecastFocus} />;
  const recurring = <RecurringTabContent />;
  const settings = <SettingsTabContent />;

  return (
    <main
      className={[
        "mx-auto flex min-h-[var(--tg-viewport-height,100vh)] max-w-lg flex-col gap-2 px-4",
        previewMode ? "pb-[calc(6rem+env(safe-area-inset-bottom))]" : "pb-24",
      ].join(" ")}
      lang={locale}
    >
      <HouseholdCloudBootstrap />
      <EmailSyncOnboardingDialog />
      <PaymentReturnRefresh />
      <SettingsDialogHost />
      {!previewMode ? <FamilyOnboarding /> : null}
      <SubscriptionAccessBanner />
      <TrialBanner />
      <SubscriptionExpiredReminder />
      {previewMode ? (
        <PreviewAppShell
          todayContent={today}
          operationsContent={operations}
          forecastContent={forecast}
          recurringContent={recurring}
          settingsContent={settings}
          previewNav={{ active: appView, onChange: onAppViewChange }}
        />
      ) : (
        today
      )}
    </main>
  );
}

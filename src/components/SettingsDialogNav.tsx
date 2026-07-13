"use client";

import { ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTelegramBackHandler } from "@/hooks/useTelegramBackHandler";
import { AiMemoryCenter } from "@/components/AiMemoryCenter";
import { CategoryManager } from "@/components/CategoryManager";
import { HelpFeedbackCard } from "@/components/HelpFeedbackCard";
import { HelpFaqDialog } from "@/components/HelpFaqDialog";
import { HouseholdCloudPanel } from "@/components/HouseholdCloudPanel";
import { SettingsMenuRow } from "@/components/SettingsMenuRow";
import { SettingsSection } from "@/components/SettingsSection";
import { UpdateAppButton } from "@/components/UpdateAppButton";
import { VehicleSettingsPanel } from "@/components/VehicleSettingsPanel";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { isCloudSyncActive } from "@/lib/cloud/push";
import { defaultBusinessUnit } from "@/lib/business/types";
import { t } from "@/lib/i18n";
import { setCloudPaused } from "@/lib/cloud/cloud-pause";
import { clearAppStorage } from "@/lib/storage-reset";
import type { Locale } from "@/types";
import { useBusinessStore } from "@/store/useBusinessStore";
import { useCloudStore } from "@/store/useCloudStore";
import { useStore } from "@/store/useStore";

type SettingsScreen =
  | "menu"
  | "language"
  | "help"
  | "memory"
  | "categories"
  | "vehicle"
  | "cloud";

type MenuItem = {
  id: Exclude<SettingsScreen, "menu">;
  titleKey: Parameters<typeof t>[1];
  descriptionKey?: Parameters<typeof t>[1];
  danger?: boolean;
};

const MENU_ITEMS: MenuItem[] = [
  { id: "categories", titleKey: "categoriesTitle", descriptionKey: "categoriesHint" },
  { id: "memory", titleKey: "settingsFinancialMemory", descriptionKey: "settingsFinancialMemoryHint" },
  { id: "vehicle", titleKey: "vehicleGarageTitle", descriptionKey: "vehicleHintMulti" },
  { id: "help", titleKey: "helpTitle" },
  { id: "language", titleKey: "settingsLanguage", descriptionKey: "settingsLanguageHint" },
];

export function SettingsDialogNav({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const locale = useStore((s) => s.locale);
  const forecastHorizonMonths = useStore((s) => s.forecastHorizonMonths);
  const setForecastHorizonMonths = useStore((s) => s.setForecastHorizonMonths);
  const setLocale = useStore((s) => s.setLocale);
  const businessModeEnabled = useStore((s) => s.businessModeEnabled);
  const liveRatesEnabled = useStore((s) => s.liveRatesEnabled);
  const setBusinessModeEnabled = useStore((s) => s.setBusinessModeEnabled);
  const setPassiveIncomeEnabled = useStore((s) => s.setPassiveIncomeEnabled);
  const setLiveRatesEnabled = useStore((s) => s.setLiveRatesEnabled);
  const { toast } = useToast();
  const [screen, setScreen] = useState<SettingsScreen>("menu");
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!open) {
      setScreen("menu");
      setConfirmClear(false);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!confirmClear) return;
    const timer = window.setTimeout(() => setConfirmClear(false), 6000);
    return () => window.clearTimeout(timer);
  }, [confirmClear]);

  const handleTelegramBack = useCallback(() => {
    if (!open) return false;
    if (screen !== "menu") {
      setScreen("menu");
      setConfirmClear(false);
      return true;
    }
    onOpenChange(false);
    return true;
  }, [open, screen, onOpenChange]);

  useTelegramBackHandler(handleTelegramBack, open);

  const resetLocalData = () => {
    useStore.getState().clearAll();
    useStore.setState({
      savingsGoals: [],
      categoryBudgets: [],
      recurringTransactions: [],
      debts: [],
      deletedCategoryArchive: [],
      vehicles: [],
      lastFuelVehicleId: null,
      pendingOdometerPrompt: null,
      cashOffsetMe: 0,
      cashOffsetPartner: 0,
      statsPeriodOverride: null,
      businessModeEnabled: false,
      passiveIncomeEnabled: false,
    });
    useBusinessStore.setState({
      units: [defaultBusinessUnit()],
      transactions: [],
      deletedTransactionIds: [],
      assets: [],
      deletedAssetIds: [],
      debts: [],
      deletedUnitsArchive: [],
      passiveReceipts: [],
      selectedUnitId: null,
      cloudSyncedAt: null,
      taxRatePct: 0,
    });
  };

  const handleClear = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    const cloudActive = isCloudSyncActive();
    if (!cloudActive) {
      clearAppStorage();
      resetLocalData();
      setConfirmClear(false);
      toast(t(locale, "cloudDeviceResetDone"), "success");
      return;
    }
    setCloudPaused(true);
    clearAppStorage();
    useCloudStore.getState().clearSession();
    resetLocalData();
    setConfirmClear(false);
    toast(t(locale, "cloudDeviceResetDone"), "success");
  };

  const activeItem = MENU_ITEMS.find((m) => m.id === screen);
  const cloudSectionTitle = locale === "ru" ? "Аккаунт и синхронизация" : "Account and sync";
  const cloudSectionDescription =
    locale === "ru"
      ? "Вход по email, статус синхронизации и выход."
      : "Email sign-in, sync status, and logout.";
  const dialogTitle =
    screen === "menu"
      ? t(locale, "settings")
      : activeItem
        ? activeItem.id === "cloud"
          ? cloudSectionTitle
          : t(locale, activeItem.titleKey)
        : t(locale, "settings");

  const detailContent: Record<Exclude<SettingsScreen, "menu">, ReactNode> = {
    language: (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">{t(locale, "settingsLanguageHint")}</p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={locale === "ru" ? "default" : "outline"}
            className="flex-1"
            onClick={() => setLocale("ru" as Locale)}
          >
            {t(locale, "settingsLanguageRu")}
          </Button>
          <Button
            type="button"
            variant={locale === "en" ? "default" : "outline"}
            className="flex-1"
            onClick={() => setLocale("en" as Locale)}
          >
            {t(locale, "settingsLanguageEn")}
          </Button>
        </div>
      </div>
    ),
    help: (
      <div className="space-y-3">
        <HelpFaqDialog locale={locale} />
        <HelpFeedbackCard locale={locale} />
      </div>
    ),
    memory: <AiMemoryCenter />,
    categories: <CategoryManager />,
    vehicle: <VehicleSettingsPanel />,
    cloud: (
      <div className="min-w-0 max-w-full space-y-3 overflow-hidden">
        <HouseholdCloudPanel embedded />
        <div className="space-y-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {t(locale, "cloudDeviceResetTitle")}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t(locale, "cloudDeviceResetHint")}
            </p>
          </div>
          <Button variant="destructive" className="w-full" onClick={() => void handleClear()} type="button">
            {confirmClear ? t(locale, "clearDataConfirmAgain") : t(locale, "clearData")}
          </Button>
        </div>
        <UpdateAppButton />
      </div>
    ),
  };

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        {screen !== "menu" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label={t(locale, "settingsBack")}
            onClick={() => setScreen("menu")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        ) : null}
        <h2 className="min-w-0 break-words text-lg font-semibold leading-tight">{dialogTitle}</h2>
      </div>

      {screen === "menu" ? (
        <div className="space-y-3">
          <SettingsSection
            title={cloudSectionTitle}
            description={cloudSectionDescription}
          >
            <HouseholdCloudPanel embedded />
          </SettingsSection>
          <div className="space-y-2 rounded-xl border-2 border-primary/20 bg-primary/5 p-3">
            <ToggleQuestionRow
              locale={locale}
              title={t(locale, "settingsBizQuestionBusiness")}
              active={businessModeEnabled}
              onChange={(next) => {
                const enabled = next === "yes";
                setBusinessModeEnabled(enabled);
                setPassiveIncomeEnabled(false);
              }}
            />
            <ToggleQuestionRow
              locale={locale}
              title={t(locale, "settingsOnlineRatesQuestion")}
              active={liveRatesEnabled}
              onChange={(next) => {
                setLiveRatesEnabled(next === "yes");
              }}
            />
          </div>
          <SettingsSection
            title={locale === "ru" ? "Прогноз" : "Forecast"}
            description={
              locale === "ru"
                ? "Чем дальше горизонт, тем больше расчёт зависит от плановых данных."
                : "The longer the horizon, the more the forecast relies on planned data."
            }
          >
            <div className="space-y-2">
              <p className="text-sm font-semibold">
                {locale === "ru" ? "Горизонт прогноза" : "Forecast horizon"}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[1, 3, 6].map((months) => (
                  <Button
                    key={months}
                    type="button"
                    variant={forecastHorizonMonths === months ? "default" : "outline"}
                    className="h-auto min-h-9 whitespace-normal px-2 py-2 text-xs leading-tight"
                    onClick={() => setForecastHorizonMonths(months as 1 | 3 | 6)}
                  >
                    {locale === "ru"
                      ? months === 1
                        ? "1 месяц"
                        : months === 3
                          ? "3 месяца"
                          : "6 месяцев"
                      : months === 1
                        ? "1 month"
                        : `${months} months`}
                  </Button>
                ))}
              </div>
            </div>
          </SettingsSection>
          {MENU_ITEMS.map((item) => (
            <SettingsMenuRow
              key={item.id}
              title={t(locale, item.titleKey)}
              description={
                item.descriptionKey
                  ? t(locale, item.descriptionKey)
                  : undefined
              }
              danger={item.danger}
              onClick={() => setScreen(item.id)}
            />
          ))}
        </div>
      ) : (
        <div className="min-h-[12rem] min-w-0 max-w-full overflow-hidden">
          {detailContent[screen]}
        </div>
      )}
    </>
  );
}

function ToggleQuestionRow({
  locale,
  title,
  active,
  onChange,
}: {
  locale: Locale;
  title: string;
  active: boolean;
  onChange: (next: "yes" | "no") => void;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2.5">
      <p className="text-sm font-semibold">{title}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={active ? "default" : "outline"}
          className="h-auto min-h-9 whitespace-normal px-2 py-2 text-xs leading-tight"
          onClick={() => onChange("yes")}
        >
          {t(locale, "yes")}
        </Button>
        <Button
          type="button"
          variant={!active ? "default" : "outline"}
          className="h-auto min-h-9 whitespace-normal px-2 py-2 text-xs leading-tight"
          onClick={() => onChange("no")}
        >
          {t(locale, "no")}
        </Button>
      </div>
    </div>
  );
}

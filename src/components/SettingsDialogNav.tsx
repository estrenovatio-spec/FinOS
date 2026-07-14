"use client";

import { ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArchiveRestorePanel } from "@/components/ArchiveRestorePanel";
import { HouseholdCloudPanel } from "@/components/HouseholdCloudPanel";
import { SettingsMenuRow } from "@/components/SettingsMenuRow";
import { SettingsSection } from "@/components/SettingsSection";
import { UpdateAppButton } from "@/components/UpdateAppButton";
import { MoreReportsTab } from "@/components/app/MoreReportsTab";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useTelegramBackHandler } from "@/hooks/useTelegramBackHandler";
import { defaultBusinessUnit } from "@/lib/business/types";
import { setCloudPaused } from "@/lib/cloud/cloud-pause";
import { isCloudSyncActive } from "@/lib/cloud/push";
import { t } from "@/lib/i18n";
import { clearAppStorage } from "@/lib/storage-reset";
import type { Locale } from "@/types";
import { useBusinessStore } from "@/store/useBusinessStore";
import { useCloudStore } from "@/store/useCloudStore";
import { useStore } from "@/store/useStore";

type SettingsScreen =
  | "menu"
  | "language"
  | "cloud"
  | "export"
  | "backup"
  | "about";

type MenuItem = {
  id: Exclude<SettingsScreen, "menu" | "cloud">;
  title: string;
  description?: string;
};

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
  const budgetMonthStartDay = useStore((s) => s.budgetMonthStartDay);
  const setBudgetMonthStartDay = useStore((s) => s.setBudgetMonthStartDay);
  const setLocale = useStore((s) => s.setLocale);
  const { toast } = useToast();
  const [screen, setScreen] = useState<SettingsScreen>("menu");
  const [confirmClear, setConfirmClear] = useState(false);

  const menuItems: MenuItem[] = [
    {
      id: "language",
      title: t(locale, "settingsLanguage"),
      description: t(locale, "settingsLanguageHint"),
    },
    {
      id: "export",
      title: locale === "ru" ? "Экспорт данных" : "Export data",
      description:
        locale === "ru"
          ? "Сохранить операции и отчёты в файл."
          : "Save your entries and reports to a file.",
    },
    {
      id: "backup",
      title: locale === "ru" ? "Резервные копии и восстановление" : "Backups and restore",
      description:
        locale === "ru"
          ? "Посмотреть копии и вернуть данные при необходимости."
          : "Review backups and restore data if needed.",
    },
    {
      id: "about",
      title: locale === "ru" ? "О приложении" : "About the app",
      description:
        locale === "ru"
          ? "Что умеет FIN OS и как обновить приложение."
          : "What FIN OS does and how to update it.",
    },
  ];

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

  const cloudSectionTitle = locale === "ru" ? "Аккаунт и синхронизация" : "Account and sync";
  const dialogTitle =
    screen === "menu"
      ? t(locale, "settings")
      : screen === "cloud"
        ? cloudSectionTitle
        : menuItems.find((item) => item.id === screen)?.title ?? t(locale, "settings");

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
    export: <MoreReportsTab />,
    backup: <ArchiveRestorePanel />,
    about: (
      <div className="space-y-3">
        <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
          <p className="text-sm font-semibold text-foreground">
            {locale === "ru" ? "О приложении" : "About the app"}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {locale === "ru"
              ? "FIN OS помогает следить за текущими деньгами, видеть будущие платежи и понимать, что по плану можно себе позволить."
              : "FIN OS helps you track current money, see upcoming payments, and understand what you can afford under your plan."}
          </p>
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
            description={
              locale === "ru"
                ? "Вход по email, синхронизация между устройствами и выход."
                : "Email sign-in, sync between devices, and logout."
            }
          >
            <HouseholdCloudPanel embedded />
          </SettingsSection>

          <SettingsSection
            title={locale === "ru" ? "Приложение" : "App"}
            description={
              locale === "ru"
                ? "Язык, финансовый период и горизонт прогноза."
                : "Language, financial period, and forecast horizon."
            }
          >
            <div className="space-y-3">
              <div className="space-y-2">
                <p className="text-sm font-semibold">
                  {locale === "ru" ? "Финансовый период" : "Financial period"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {locale === "ru"
                    ? "Выберите день, с которого начинается ваш финансовый месяц."
                    : "Choose the day your financial month starts."}
                </p>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                  value={budgetMonthStartDay}
                  onChange={(event) => setBudgetMonthStartDay(Number(event.target.value))}
                >
                  {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                    <option key={day} value={day}>
                      {locale === "ru" ? `${day} число` : `Day ${day}`}
                    </option>
                  ))}
                </select>
              </div>
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
            </div>
          </SettingsSection>

          <SettingsSection
            title={locale === "ru" ? "Данные" : "Data"}
            description={
              locale === "ru"
                ? "Экспортируйте данные и управляйте резервными копиями."
                : "Export your data and manage backups."
            }
          >
            <div className="space-y-2">
              {menuItems
                .filter((item) => item.id === "export" || item.id === "backup")
                .map((item) => (
                  <SettingsMenuRow
                    key={item.id}
                    title={item.title}
                    description={item.description}
                    onClick={() => setScreen(item.id)}
                  />
                ))}
            </div>
          </SettingsSection>

          {menuItems
            .filter((item) => item.id !== "export" && item.id !== "backup")
            .map((item) => (
              <SettingsMenuRow
                key={item.id}
                title={item.title}
                description={item.description}
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

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
import { OwnerChipColorPicker } from "@/components/OwnerChipColorPicker";
import { VehicleSettingsPanel } from "@/components/VehicleSettingsPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cloudPushPartnerLabel, isCloudSyncActive } from "@/lib/cloud/push";
import { parsePartnerKeywordsInput } from "@/lib/detect-owner";
import { defaultBusinessUnit } from "@/lib/business/types";
import {
  DEFAULT_MY_CHIP_COLOR,
  DEFAULT_PARTNER_CHIP_COLOR,
} from "@/lib/owner-chip-colors";
import { myDisplayName, partnerDisplayName, partnerTabLabel } from "@/lib/owner-labels";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
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
  | "cloud"
  | "household";

type MenuItem = {
  id: Exclude<SettingsScreen, "menu">;
  titleKey: Parameters<typeof t>[1];
  descriptionKey?: Parameters<typeof t>[1];
  danger?: boolean;
};

const MENU_ITEMS: MenuItem[] = [
  { id: "cloud", titleKey: "cloudTitle", descriptionKey: "cloudHint" },
  { id: "categories", titleKey: "categoriesTitle", descriptionKey: "categoriesHint" },
  { id: "memory", titleKey: "settingsFinancialMemory", descriptionKey: "settingsFinancialMemoryHint" },
  { id: "household", titleKey: "householdTitle", descriptionKey: "householdHint" },
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
  const userName = useStore((s) => s.userName);
  const partnerName = useStore((s) => s.partnerName);
  const partnerKeywords = useStore((s) => s.partnerKeywords);
  const businessModeEnabled = useStore((s) => s.businessModeEnabled);
  const liveRatesEnabled = useStore((s) => s.liveRatesEnabled);
  const setUserName = useStore((s) => s.setUserName);
  const setPartnerName = useStore((s) => s.setPartnerName);
  const setPartnerKeywords = useStore((s) => s.setPartnerKeywords);
  const setBusinessModeEnabled = useStore((s) => s.setBusinessModeEnabled);
  const setPassiveIncomeEnabled = useStore((s) => s.setPassiveIncomeEnabled);
  const setLiveRatesEnabled = useStore((s) => s.setLiveRatesEnabled);
  const myChipColor = useStore((s) => s.myChipColor);
  const partnerChipColor = useStore((s) => s.partnerChipColor);
  const setMyChipColor = useStore((s) => s.setMyChipColor);
  const setPartnerChipColor = useStore((s) => s.setPartnerChipColor);
  const { toast } = useToast();
  const [screen, setScreen] = useState<SettingsScreen>("menu");
  const [myNameInput, setMyNameInput] = useState(userName ?? "");
  const [partnerInput, setPartnerInput] = useState(partnerName ?? "");
  const [keywordsInput, setKeywordsInput] = useState(partnerKeywords.join(", "));
  const [confirmClear, setConfirmClear] = useState(false);
  const [savedFlash, setSavedFlash] = useState<"my" | "partner" | "keywords" | null>(null);

  useEffect(() => {
    if (!open) {
      setScreen("menu");
      setConfirmClear(false);
      return;
    }
    setMyNameInput(userName ?? "");
    setPartnerInput(partnerName ?? "");
    setKeywordsInput(partnerKeywords.join(", "));
  }, [open, userName, partnerName, partnerKeywords]);

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

  const flashSaved = (which: "my" | "partner" | "keywords") => {
    setSavedFlash(which);
    window.setTimeout(() => {
      setSavedFlash((current) => (current === which ? null : current));
    }, 2000);
  };

  const saveMyName = () => {
    setUserName(myNameInput.trim() || null);
    flashSaved("my");
  };

  const savePartner = () => {
    const trimmed = partnerInput.trim() || null;
    setPartnerName(trimmed);
    if (isCloudSyncActive()) void cloudPushPartnerLabel(trimmed);
    flashSaved("partner");
  };

  const saveKeywords = () => {
    setPartnerKeywords(parsePartnerKeywordsInput(keywordsInput));
    flashSaved("keywords");
  };

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
    household: (
      <div className="space-y-3">
        <Input
          value={myNameInput}
          onChange={(e) => setMyNameInput(e.target.value)}
          placeholder={t(locale, "myNamePlaceholder")}
        />
        <Button type="button" variant="secondary" className="w-full" onClick={saveMyName}>
          {t(locale, "myNameSave")}
        </Button>
        {savedFlash === "my" ? (
          <p className="flex justify-center" role="status" aria-live="polite">
            <span className="inline-flex rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm">
              {t(locale, "settingsSaved")}
            </span>
          </p>
        ) : null}
        <OwnerChipColorPicker
          label={t(locale, "ownerChipColorMy")}
          value={myChipColor}
          fallback={DEFAULT_MY_CHIP_COLOR}
          previewLabel={myDisplayName(locale, myNameInput || userName)}
          onChange={setMyChipColor}
        />
        <Input
          value={partnerInput}
          onChange={(e) => setPartnerInput(e.target.value)}
          placeholder={t(locale, "partnerNamePlaceholder")}
        />
        <Button type="button" variant="secondary" className="w-full" onClick={savePartner}>
          {t(locale, "partnerSave")}
        </Button>
        {savedFlash === "partner" ? (
          <p className="flex justify-center" role="status" aria-live="polite">
            <span className="inline-flex rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm">
              {t(locale, "settingsSaved")}
            </span>
          </p>
        ) : null}
        <OwnerChipColorPicker
          label={t(locale, "ownerChipColorPartner")}
          value={partnerChipColor}
          fallback={DEFAULT_PARTNER_CHIP_COLOR}
          previewLabel={
            partnerDisplayName(partnerInput || partnerName) ||
            partnerTabLabel(locale, partnerInput || partnerName, partnerKeywords)
          }
          onChange={setPartnerChipColor}
        />
        <p className="text-xs text-muted-foreground">{t(locale, "ownerChipColorHint")}</p>
        <p className="text-sm font-medium">{t(locale, "partnerKeywordsTitle")}</p>
        <textarea
          value={keywordsInput}
          onChange={(e) => setKeywordsInput(e.target.value)}
          placeholder={t(locale, "partnerKeywordsPlaceholder")}
          rows={3}
          className={cn(
            "flex min-h-[5rem] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
        <Button type="button" variant="secondary" className="w-full" onClick={saveKeywords}>
          {t(locale, "partnerKeywordsSave")}
        </Button>
        {savedFlash === "keywords" ? (
          <p className="flex justify-center" role="status" aria-live="polite">
            <span className="inline-flex rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm">
              {t(locale, "settingsSaved")}
            </span>
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">{t(locale, "partnerKeywordsHint")}</p>
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
              title={item.id === "cloud" ? cloudSectionTitle : t(locale, item.titleKey)}
              description={
                item.id === "cloud"
                  ? cloudSectionDescription
                  : item.descriptionKey
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

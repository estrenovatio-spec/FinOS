"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { BalanceQuickEdit } from "@/components/BalanceQuickEdit";
import { PreviewHeaderNav } from "@/components/app/PreviewHeaderNav";
import { LiveRatesBar } from "@/components/LiveRatesBar";
import { PartnerTransferDialog } from "@/components/PartnerTransferDialog";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BusinessModeStub } from "@/components/BusinessModeStub";
import { requestOpenSettings } from "@/lib/billing/trial-banner";
import { t } from "@/lib/i18n";
import {
  balanceNameLabelLines,
  balanceNameLabelWithColon,
  hasPartnerBudget,
  myDisplayName,
  partnerDisplayName,
  partnerTabLabel,
} from "@/lib/owner-labels";
import { OPEN_SETTINGS_EVENT } from "@/lib/billing/trial-banner";
import { bottomNavEnabled, type AppTabId } from "@/lib/app-bottom-nav";
import { formatMoney } from "@/lib/format-money";
import { BALANCE_AMOUNTS_HIDDEN_KEY } from "@/lib/storage-reset";
import { useHouseholdBalances, useStore } from "@/store/useStore";

const balanceAmountClass =
  "inline-flex max-w-full items-baseline justify-end gap-1 whitespace-nowrap text-right text-sm font-semibold leading-tight tabular-nums text-foreground";

/** Подпись слева (до 2 строк для длинных имён), суммы — справа */
function BalanceRow({
  label,
  labelLines,
  title,
  children,
  onHideToggle,
}: {
  label: string;
  /** 2 строки для имени партнёра — приоритетнее label */
  labelLines?: string[];
  title?: string;
  children: ReactNode;
  onHideToggle?: () => void;
}) {
  const lines = labelLines && labelLines.length > 0 ? labelLines : null;
  const multiline = Boolean(lines && lines.length > 1);

  return (
    <div
      className={`grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-1.5 ${
        multiline ? "items-start" : "items-baseline"
      }`}
    >
      <button
        type="button"
        title={title ?? label}
        onClick={(e) => {
          e.stopPropagation();
          onHideToggle?.();
        }}
        className={`min-w-0 rounded-md px-0.5 text-left text-sm font-semibold leading-tight text-foreground [overflow-wrap:anywhere] hover:bg-muted/40 ${
          multiline ? "leading-snug" : "whitespace-normal"
        }`}
      >
        {lines ? (
          <span className="block min-w-0">
            {lines.map((line, i) => (
              <span
                key={i}
                className="block break-words leading-snug [overflow-wrap:anywhere]"
              >
                {line}
              </span>
            ))}
          </span>
        ) : (
          label
        )}
      </button>
      <div
        className="flex shrink-0 justify-self-end text-right tabular-nums"
        data-balance-amount-zone
      >
        {children}
      </div>
    </div>
  );
}

function readAmountsHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(BALANCE_AMOUNTS_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeAmountsHidden(hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(BALANCE_AMOUNTS_HIDDEN_KEY, "1");
    else localStorage.removeItem(BALANCE_AMOUNTS_HIDDEN_KEY);
  } catch {
    /* ignore */
  }
}

export function TMAHeader({
  hideBusinessButton = false,
  previewNav,
}: {
  hideBusinessButton?: boolean;
  previewNav?: { active: AppTabId; onChange: (tab: AppTabId) => void };
}) {
  const locale = useStore((s) => s.locale);
  const userName = useStore((s) => s.userName);
  const partnerName = useStore((s) => s.partnerName);
  const partnerKeywords = useStore((s) => s.partnerKeywords);
  const liveRatesEnabled = useStore((s) => s.liveRatesEnabled);
  const balances = useHouseholdBalances();
  const [amountsHidden, setAmountsHidden] = useState(false);
  const [balanceEditDialogOpen, setBalanceEditDialogOpen] = useState(false);
  const suppressBalanceToggleUntilRef = useRef(0);

  useEffect(() => {
    setAmountsHidden(readAmountsHidden());
  }, []);

  const armBalanceToggleSuppress = useCallback((ms = 900) => {
    suppressBalanceToggleUntilRef.current = Date.now() + ms;
  }, []);

  const handleBalanceEditDialogOpenChange = useCallback(
    (editOpen: boolean) => {
      setBalanceEditDialogOpen(editOpen);
      if (!editOpen) armBalanceToggleSuppress();
    },
    [armBalanceToggleSuppress],
  );

  const toggleAmountsHidden = useCallback(() => {
    setAmountsHidden((prev) => {
      const next = !prev;
      writeAmountsHidden(next);
      return next;
    });
  }, []);

  const requestHideToggle = useCallback(() => {
    if (balanceEditDialogOpen) return;
    if (Date.now() < suppressBalanceToggleUntilRef.current) return;
    toggleAmountsHidden();
  }, [balanceEditDialogOpen, toggleAmountsHidden]);

  const meName = myDisplayName(locale, userName);
  const partner =
    partnerDisplayName(partnerName) ||
    partnerTabLabel(locale, partnerName, partnerKeywords);
  const hasPartner = hasPartnerBudget(partnerName, partnerKeywords);
  const balanceWord = `${t(locale, "balance")}:`;
  const meLabel = `${meName}:`;
  const partnerLabelLines = partner
    ? balanceNameLabelWithColon(balanceNameLabelLines(partner))
    : [];
  const partnerLabel = partner ? `${partner}:` : "";
  const showSettingsGear = !bottomNavEnabled();

  return (
    <header className="space-y-2 pb-2 pt-1">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div
            aria-label={
              amountsHidden ? t(locale, "balanceTapToShow") : t(locale, "balanceTapToHide")
            }
            className="rounded-lg border-2 border-primary/20 bg-card px-3 py-2.5 shadow-sm transition-colors"
          >
            <div className="flex w-full flex-col gap-y-0.5">
              <BalanceRow label={balanceWord} onHideToggle={requestHideToggle}>
                {amountsHidden ? (
                  <span
                    className={`select-none ${balanceAmountClass}`}
                    aria-hidden
                  >
                    {t(locale, "balanceAmountsHidden")} {t(locale, "currency")}
                  </span>
                ) : (
                  <span className={balanceAmountClass}>
                    {formatMoney(balances.all, locale)} {t(locale, "currency")}
                  </span>
                )}
              </BalanceRow>

              {hasPartner ? (
                <>
                  <BalanceRow label={meLabel} onHideToggle={requestHideToggle}>
                    <BalanceQuickEdit
                      owner="me"
                      displayed={balances.me}
                      label={meName}
                      className={balanceAmountClass}
                      amountsHidden={amountsHidden}
                      onEditDialogOpenChange={handleBalanceEditDialogOpenChange}
                      onBeforeEditDialogClose={armBalanceToggleSuppress}
                    />
                  </BalanceRow>

                  <BalanceRow
                    label={partnerLabel}
                    labelLines={partnerLabelLines.length > 1 ? partnerLabelLines : undefined}
                    title={partner}
                    onHideToggle={requestHideToggle}
                  >
                    <BalanceQuickEdit
                      owner="partner"
                      displayed={balances.partner}
                      label={partner}
                      className={balanceAmountClass}
                      amountsHidden={amountsHidden}
                      onEditDialogOpenChange={handleBalanceEditDialogOpenChange}
                      onBeforeEditDialogClose={armBalanceToggleSuppress}
                    />
                  </BalanceRow>
                </>
              ) : null}
            </div>
            {hasPartner ? (
              <div className="mt-2 border-t border-primary/10 pt-2">
                <PartnerTransferDialog
                  locale={locale}
                  partnerName={partnerName}
                  partnerKeywords={partnerKeywords}
                  userName={userName}
                />
              </div>
            ) : null}
            {liveRatesEnabled ? (
              <div className="mt-2 border-t border-primary/10 pt-2">
                <div className="overflow-x-auto rounded-lg border-2 border-primary/20 bg-card px-2 py-1.5 shadow-sm">
                  <LiveRatesBar />
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-1.5">
            {previewNav ? (
              <PreviewHeaderNav active={previewNav.active} onChange={previewNav.onChange} />
            ) : hideBusinessButton ? null : (
              <BusinessModeStub />
            )}
            {showSettingsGear ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label={t(locale, "settings")}
                onClick={() => requestOpenSettings()}
              >
                <Settings className="h-4 w-4" aria-hidden />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import type { ReferralWalletPublic } from "@/lib/referrals/wallet";
import { useToast } from "@/components/ui/toast";

function formatRub(amount: number, locale: "ru" | "en"): string {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(Math.ceil(amount));
}

export function ReferralWalletCard({
  locale,
  wallet,
  showApplyHint = true,
}: {
  locale: "ru" | "en";
  wallet: ReferralWalletPublic;
  showApplyHint?: boolean;
}) {
  const { toast } = useToast();

  const onApplyHint = () => {
    toast(t(locale, "referralWalletApplyHint"), "default");
  };

  return (
    <section className="space-y-2 rounded-xl border-2 border-emerald-600/35 bg-gradient-to-br from-emerald-500/15 to-primary/10 p-3 dark:border-emerald-400/30 dark:from-emerald-950/80 dark:to-primary/20">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-emerald-700 dark:text-emerald-300" aria-hidden />
          <div>
            <h4 className="text-sm font-semibold">{t(locale, "referralWalletTitle")}</h4>
            <p className="text-[11px] text-muted-foreground">
              {t(locale, "referralWalletRule", {
                percent: String(wallet.commissionPercent),
              })}
            </p>
          </div>
        </div>
        {wallet.previewMode ? (
          <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-950 dark:text-amber-100">
            {t(locale, "referralWalletPreviewBadge")}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border/60 bg-card/80 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t(locale, "referralWalletAvailable")}
          </p>
          <p className="text-lg font-bold tabular-nums text-emerald-800 dark:text-emerald-200">
            {formatRub(wallet.availableRub, locale)}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-card/80 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t(locale, "referralWalletPending")}
          </p>
          <p className="text-lg font-bold tabular-nums">{formatRub(wallet.pendingRub, locale)}</p>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {t(locale, "referralWalletTotal", {
          amount: formatRub(wallet.totalEarnedRub, locale),
        })}
      </p>

      {showApplyHint ? (
        <>
          <Button type="button" size="sm" className="w-full" variant="secondary" onClick={onApplyHint}>
            {t(locale, "referralWalletApplyAtRenewal")}
          </Button>
          <p className="text-[10px] text-muted-foreground">{t(locale, "referralWalletApplyAtRenewalHint")}</p>
        </>
      ) : null}
    </section>
  );
}

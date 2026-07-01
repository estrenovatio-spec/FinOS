"use client";

import { useState } from "react";
import { PromoCodeRedeem } from "@/components/PromoCodeRedeem";
import { ReferralWalletPaywall } from "@/components/ReferralWalletPaywall";
import { Button } from "@/components/ui/button";
import { getCloudAuthBody } from "@/lib/cloud/auth-payload";
import { apiCreateYookassaCheckout } from "@/lib/cloud/client";
import { fetchAndApplyDevSubscription } from "@/lib/billing/dev-subscription";
import { runHouseholdBootstrap } from "@/lib/cloud/bootstrap";
import { t } from "@/lib/i18n";
import type { SubscriptionPublic } from "@/lib/payments/types";
import { useCloudStore } from "@/store/useCloudStore";
import { useStore } from "@/store/useStore";

function openPaymentUrl(url: string) {
  const tg = window.Telegram?.WebApp;
  if (tg?.openLink) {
    tg.openLink(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

interface PaywallPanelProps {
  subscription: SubscriptionPublic;
  compact?: boolean;
}

export function PaywallPanel({ subscription, compact }: PaywallPanelProps) {
  const locale = useStore((s) => s.locale);
  const token = useCloudStore((s) => s.token);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!subscription.enforced || subscription.active) return null;

  const pay = async () => {
    setLoading(true);
    setError(null);
    try {
      let checkoutToken = token;
      if (!checkoutToken) {
        await runHouseholdBootstrap();
        checkoutToken = useCloudStore.getState().token;
      }

      let confirmationUrl: string;
      if (checkoutToken) {
        const res = await apiCreateYookassaCheckout(checkoutToken, false);
        if (res.paidFromWallet) {
          await runHouseholdBootstrap();
          return;
        }
        if (!res.confirmationUrl) throw new Error("no_confirmation_url");
        confirmationUrl = res.confirmationUrl;
      } else {
        const res = await fetch("/api/payments/yookassa/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(getCloudAuthBody()),
        });
        const data = (await res.json()) as { confirmationUrl?: string; error?: string };
        if (!res.ok) throw new Error(data.error ?? `http_${res.status}`);
        if (!data.confirmationUrl) throw new Error("no_confirmation_url");
        confirmationUrl = data.confirmationUrl;
      }

      openPaymentUrl(confirmationUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "checkout_failed");
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await runHouseholdBootstrap();
      await fetchAndApplyDevSubscription(3);
    } catch {
      setError("refresh_failed");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div
      className={
        compact
          ? "space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3"
          : "space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4"
      }
    >
      <div className="space-y-1">
        <p className="text-sm font-semibold">{t(locale, "paywallTitle")}</p>
        <p className="text-xs text-muted-foreground">
          {t(locale, "paywallDesc", {
            price: String(subscription.priceRub),
            days: String(subscription.periodDays),
          })}
        </p>
        {subscription.trialDays > 0 && (
          <p className="text-xs text-muted-foreground">
            {t(locale, "paywallTrialHint", { days: String(subscription.trialDays) })}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={loading} onClick={() => void pay()}>
          {loading ? t(locale, "paywallLoading") : t(locale, "paywallSubscribe")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          {refreshing ? t(locale, "paywallLoading") : t(locale, "paywallRefresh")}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <ReferralWalletPaywall priceRub={subscription.priceRub} onPaid={() => void refresh()} />
      <PromoCodeRedeem compact onRedeemed={refresh} />
    </div>
  );
}

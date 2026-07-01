"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ReferralWalletCard } from "@/components/ReferralWalletCard";
import { useToast } from "@/components/ui/toast";
import { getCloudAuthBody } from "@/lib/cloud/auth-payload";
import { apiCreateYookassaCheckout } from "@/lib/cloud/client";
import { runHouseholdBootstrap } from "@/lib/cloud/bootstrap";
import { t } from "@/lib/i18n";
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

export function ReferralWalletPaywall({
  priceRub,
  onPaid,
}: {
  priceRub: number;
  onPaid: () => void;
}) {
  const locale = useStore((s) => s.locale);
  const token = useCloudStore((s) => s.token);
  const referralProfile = useCloudStore((s) => s.referralProfile);
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const wallet = referralProfile?.wallet;
  const available = wallet?.availableRub ?? 0;

  const paySummary = useMemo(() => {
    if (available <= 0) return null;
    if (available >= priceRub) {
      return t(locale, "referralWalletPayFull", { amount: String(Math.round(priceRub)) });
    }
    return t(locale, "referralWalletPayPartial", {
      wallet: String(Math.round(available)),
      card: String(Math.round(priceRub - available)),
    });
  }, [available, locale, priceRub]);

  if (!wallet?.enabled || available <= 0) return null;

  const payWithWallet = async () => {
    setLoading(true);
    try {
      let checkoutToken = token;
      if (!checkoutToken) {
        await runHouseholdBootstrap();
        checkoutToken = useCloudStore.getState().token;
      }

      let data: {
        ok?: boolean;
        paidFromWallet?: boolean;
        confirmationUrl?: string;
        walletUsedRub?: number;
        error?: string;
      };

      if (checkoutToken) {
        data = await apiCreateYookassaCheckout(checkoutToken, true);
      } else {
        const res = await fetch("/api/payments/yookassa/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...getCloudAuthBody(), useReferralWallet: true }),
        });
        data = (await res.json()) as typeof data;
        if (!res.ok) throw new Error(data.error ?? `http_${res.status}`);
      }

      if (data.paidFromWallet) {
        toast(
          t(locale, "referralWalletPaidSuccess", {
            amount: String(Math.round(data.walletUsedRub ?? priceRub)),
          }),
          "success",
        );
        await runHouseholdBootstrap();
        onPaid();
        return;
      }

      if (data.confirmationUrl) {
        if (data.walletUsedRub && data.walletUsedRub > 0) {
          toast(
            t(locale, "referralWalletPartialRedirect", {
              wallet: String(Math.round(data.walletUsedRub)),
            }),
            "default",
          );
        }
        openPaymentUrl(data.confirmationUrl);
        return;
      }

      throw new Error("checkout_failed");
    } catch (e) {
      toast(t(locale, "referralWalletPayFailed"), "error");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2 border-t border-border/60 pt-3">
      <ReferralWalletCard locale={locale} wallet={wallet} showApplyHint={false} />
      {paySummary ? <p className="text-xs text-muted-foreground">{paySummary}</p> : null}
      <Button
        type="button"
        size="sm"
        className="w-full"
        variant="secondary"
        disabled={loading}
        onClick={() => void payWithWallet()}
      >
        {loading ? t(locale, "paywallLoading") : t(locale, "referralWalletPaySubscribe")}
      </Button>
    </div>
  );
}

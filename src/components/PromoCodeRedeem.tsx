"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCloudAuthBody } from "@/lib/cloud/auth-payload";
import { apiRedeemPromoCode } from "@/lib/cloud/client";
import { runHouseholdBootstrap } from "@/lib/cloud/bootstrap";
import { t } from "@/lib/i18n";
import type { SubscriptionPublic } from "@/lib/payments/types";
import { useCloudStore } from "@/store/useCloudStore";
import { useStore } from "@/store/useStore";

function mapPromoError(locale: "ru" | "en", error: string): string {
  const key =
    error === "promo_not_found" || error === "invalid_promo_code"
      ? "paywallPromoNotFound"
      : error === "promo_already_used"
        ? "paywallPromoAlreadyUsed"
        : error === "promo_expired" || error === "promo_not_yet_valid"
          ? "paywallPromoExpired"
          : error === "promo_exhausted"
            ? "paywallPromoExhausted"
            : "paywallPromoFailed";
  return t(locale, key);
}

function formatExpiresAt(iso: string, locale: "ru" | "en"): string {
  try {
    return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

interface PromoCodeRedeemProps {
  compact?: boolean;
  onRedeemed?: () => void;
}

export function PromoCodeRedeem({ compact, onRedeemed }: PromoCodeRedeemProps) {
  const locale = useStore((s) => s.locale);
  const token = useCloudStore((s) => s.token);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const redeem = async () => {
    const trimmed = code.trim();
    if (trimmed.length < 2) return;

    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      let checkoutToken = token;
      if (!checkoutToken) {
        await runHouseholdBootstrap();
        checkoutToken = useCloudStore.getState().token;
      }

      const res = checkoutToken
        ? await apiRedeemPromoCode(checkoutToken, trimmed)
        : await (async () => {
            const r = await fetch("/api/payments/promo/redeem", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...getCloudAuthBody(), code: trimmed }),
            });
            const data = (await r.json()) as {
              ok?: boolean;
              error?: string;
              bonusDays?: number;
              expiresAt?: string;
              subscription?: unknown;
            };
            if (!r.ok) throw new Error(data.error ?? `http_${r.status}`);
            return data;
          })();

      if (res.subscription) {
        useCloudStore.getState().setSubscription(res.subscription as SubscriptionPublic);
      } else {
        await runHouseholdBootstrap();
      }

      const expiresLabel = res.expiresAt
        ? formatExpiresAt(res.expiresAt, locale)
        : "";
      setSuccess(
        t(locale, "paywallPromoSuccess", {
          days: String(res.bonusDays ?? ""),
          date: expiresLabel,
        }),
      );
      setCode("");
      onRedeemed?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "promo_redeem_failed";
      setError(mapPromoError(locale, msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-2 border-t border-amber-500/20 pt-3"}>
      <p className="text-xs font-medium text-muted-foreground">{t(locale, "paywallPromoTitle")}</p>
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t(locale, "paywallPromoPlaceholder")}
          className="min-w-0 flex-1"
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === "Enter") void redeem();
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={loading || code.trim().length < 2}
          onClick={() => void redeem()}
        >
          {loading ? "…" : t(locale, "paywallPromoApply")}
        </Button>
      </div>
      {success && <p className="text-xs text-emerald-600 dark:text-emerald-400">{success}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

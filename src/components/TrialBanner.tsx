"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  requestOpenSettings,
  dismissTrialBanner,
  isTrialLastDay,
  markTrialWelcomeSeen,
  shouldShowTrialBannerMilestone,
} from "@/lib/billing/trial-banner";
import {
  resolveDaysRemaining,
  subscriptionShowsTrialBanner,
} from "@/lib/billing/subscription-shape";
import {
  fetchAndApplyDevSubscription,
  isBillingDevFallbackEnabled,
} from "@/lib/billing/dev-subscription";
import { subscriptionTrialUiEnabled } from "@/lib/payments/config";
import { runHouseholdBootstrap } from "@/lib/cloud/bootstrap";
import { getTelegramInitData } from "@/lib/cloud/telegram";
import { waitForTelegramInitData } from "@/lib/cloud/wait-telegram-init";
import { useTelegramWebAppReady } from "@/hooks/useTelegramWebAppReady";
import { withTimeout } from "@/lib/with-timeout";
import { t } from "@/lib/i18n";
import { useCloudStore } from "@/store/useCloudStore";
import { useStore } from "@/store/useStore";

type SetupHint =
  | "wrong_url"
  | "wrong_token"
  | "expired_session"
  | "empty_init"
  | "expired"
  | "paid"
  | "waiting"
  | "dev_failed"
  | null;

interface StatusProbe {
  billingTestMode?: boolean;
  billingDevFallback?: boolean;
  telegramBotName?: string;
  siteUrl?: string | null;
  vercelEnv?: string | null;
}

function HintStrip({ children }: { children: ReactNode }) {
  return (
    <div
      className="-mx-4 mb-1 border-b-2 border-destructive bg-destructive/15 px-4 py-2.5 text-xs font-medium leading-snug text-destructive"
      role="alert"
    >
      {children}
    </div>
  );
}

/**
 * Trial strip above header. Always visible in Telegram until resolved (trial / error / loading).
 */
export function TrialBanner() {
  const trialUiEnabled = subscriptionTrialUiEnabled();
  const locale = useStore((s) => s.locale);
  const subscription = useCloudStore((s) => s.subscription);
  const accessSummary = useCloudStore((s) => s.accessSummary);
  const tmaReady = useTelegramWebAppReady();
  const [hidden, setHidden] = useState(true);
  const [setupHint, setSetupHint] = useState<SetupHint>(null);
  const [statusProbe, setStatusProbe] = useState<StatusProbe | null>(null);
  const [probed, setProbed] = useState(false);

  const expiresAt = subscription?.expiresAt ?? null;
  const days = resolveDaysRemaining(subscription);
  const showBase = subscriptionShowsTrialBanner(subscription);
  const showMilestone = shouldShowTrialBannerMilestone(expiresAt, days);
  const show = showBase && showMilestone;
  const testMode = subscription?.testMode ?? statusProbe?.billingTestMode ?? false;
  const subscriptionExpired =
    Boolean(subscription?.enforced && !subscription?.active);

  useEffect(() => {
    setHidden(!show);
  }, [show]);

  useEffect(() => {
    if (!showBase || !expiresAt || days === null) return;
    if (isTrialLastDay(days)) return;

    return () => {
      markTrialWelcomeSeen(expiresAt);
    };
  }, [showBase, expiresAt, days]);

  useEffect(() => {
    if (!tmaReady) return;

    let cancelled = false;

    const probe = async () => {
      let status: StatusProbe = {};
      try {
        const res = await fetch("/api/status", {
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        });
        if (res.ok) status = (await res.json()) as StatusProbe;
      } catch {
        /* ignore */
      }
      if (cancelled) return;

      setStatusProbe(status);

      if (status.billingDevFallback || status.billingTestMode) {
        await fetchAndApplyDevSubscription(3);
      }
      if (cancelled) return;

      try {
        const subNow = useCloudStore.getState().subscription;
        if (!subscriptionShowsTrialBanner(subNow)) {
          await withTimeout(
            (async () => {
              await waitForTelegramInitData(3000);
              await runHouseholdBootstrap();
            })(),
            12_000,
            "bootstrap_timeout",
          );
        }
      } catch {
        /* timeout or network */
      }

      if (cancelled) return;

      if (status.billingDevFallback) {
        await fetchAndApplyDevSubscription(2);
      }
      if (cancelled) return;

      setProbed(true);

      const sub = useCloudStore.getState().subscription;
      if (subscriptionShowsTrialBanner(sub)) {
        setSetupHint(null);
        return;
      }

      if (sub?.enforced && !sub.active) {
        setSetupHint(null);
        return;
      }

      if (!status.billingTestMode) {
        setSetupHint(null);
        return;
      }

      if (!sub) {
        if (status.billingDevFallback || isBillingDevFallbackEnabled()) {
          setSetupHint("dev_failed");
          return;
        }
        const initData = getTelegramInitData();
        if (!initData) {
          setSetupHint("empty_init");
          return;
        }
        try {
          const v = await fetch("/api/telegram/verify-init", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initData }),
            signal: AbortSignal.timeout(8_000),
          });
          const check = (await v.json()) as { ok?: boolean; reason?: string };
          if (check.ok) {
            setSetupHint("waiting");
          } else if (check.reason === "expired") {
            setSetupHint("expired_session");
          } else {
            setSetupHint("wrong_token");
          }
        } catch {
          setSetupHint("wrong_token");
        }
        return;
      }

      if (sub.enforced && !sub.active) {
        setSetupHint("expired");
        return;
      }

      if (!sub.onFreeAccess) {
        setSetupHint("paid");
        return;
      }

      setSetupHint("waiting");
    };

    void probe();

    return () => {
      cancelled = true;
    };
  }, [tmaReady]);

  useEffect(() => {
    if (show) setSetupHint(null);
  }, [show]);

  const snoozeBanner = useCallback(() => {
    dismissTrialBanner(expiresAt, days);
    setHidden(true);
  }, [expiresAt, days]);

  const onDismiss = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      snoozeBanner();
    },
    [snoozeBanner],
  );

  const onBannerClick = useCallback(() => {
    snoozeBanner();
    requestOpenSettings();
  }, [snoozeBanner]);

  if (!trialUiEnabled) return null;

  if (!tmaReady) return null;

  if (accessSummary) return null;

  if (subscriptionExpired) return null;

  if (!probed) {
    // Do not show diagnostic strip in normal production mode.
    if (!showBase) return null;
    return (
      <HintStrip>
        {t(locale, "trialSetupLoading")}
      </HintStrip>
    );
  }

  if (setupHint && !show) {
    const bot = statusProbe?.telegramBotName
      ? `@${statusProbe.telegramBotName.replace(/^@/, "")}`
      : "@fintest_BU_bot";
    const site =
      (typeof window !== "undefined" ? window.location.origin : null) ??
      statusProbe?.siteUrl?.replace(/\/$/, "") ??
      "preview URL";

    const msgKey =
      setupHint === "wrong_url"
        ? "trialSetupWrongUrl"
        : setupHint === "wrong_token"
          ? "trialSetupWrongToken"
          : setupHint === "expired_session"
            ? "trialSetupExpiredSession"
            : setupHint === "empty_init"
            ? "trialSetupEmptyInit"
            : setupHint === "expired"
            ? "trialSetupExpired"
            : setupHint === "paid"
              ? "trialSetupPaid"
              : setupHint === "dev_failed"
                ? "trialSetupDevFailed"
                : "trialSetupWaiting";

    return <HintStrip>{t(locale, msgKey, { bot, site })}</HintStrip>;
  }

  if (!show || hidden) {
    if (subscription) return null;
    if (probed && statusProbe?.billingTestMode && !setupHint) {
      return (
        <HintStrip>
          {t(locale, "trialSetupUnknown", {
            host: typeof window !== "undefined" ? window.location.host : "",
          })}
        </HintStrip>
      );
    }
    return null;
  }

  const daysLabel =
    days === 0
      ? t(locale, "trialBannerLastDay")
      : t(locale, "trialBannerDaysLeft", { days: String(days) });

  return (
    <button
      type="button"
      onClick={onBannerClick}
      className="group -mx-4 mb-1 flex w-[calc(100%+2rem)] items-center gap-2 border-b-2 border-amber-500 bg-amber-400/25 px-4 py-2.5 text-left transition-colors hover:bg-amber-400/35"
      aria-label={t(locale, "trialBannerAria")}
    >
      <span className="min-w-0 flex-1 text-xs font-medium leading-snug text-amber-950 dark:text-amber-100">
        {t(locale, "trialBannerText", { days: daysLabel })}
        {testMode ? (
          <span className="ml-1 opacity-70">· {t(locale, "trialBannerTest")}</span>
        ) : null}
      </span>
      <span
        role="button"
        tabIndex={0}
        aria-label={t(locale, "trialBannerDismiss")}
        className="shrink-0 rounded p-0.5 text-amber-900/70 hover:bg-amber-500/30"
        onClick={onDismiss}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onDismiss(e as unknown as React.MouseEvent);
          }
        }}
      >
        <X className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

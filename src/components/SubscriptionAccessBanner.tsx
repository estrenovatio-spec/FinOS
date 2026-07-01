"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  dismissAccessBanner,
  isAccessLastDay,
  markAccessWelcomeSeen,
  shouldShowAccessBannerMilestone,
} from "@/lib/billing/access-banner-dismiss";
import { requestOpenSettings } from "@/lib/billing/trial-banner";
import { t } from "@/lib/i18n";
import type { AccessSummaryPublic } from "@/lib/payments/types";
import { useCloudStore } from "@/store/useCloudStore";
import { useStore } from "@/store/useStore";

function formatAccessDate(iso: string | null, locale: "ru" | "en"): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

function daysLabel(locale: "ru" | "en", days: number): string {
  if (days === 0) return t(locale, "accessBannerLastDay");
  return t(locale, "accessBannerDaysLeft", { days: String(days) });
}

export function SubscriptionAccessBanner() {
  const locale = useStore((s) => s.locale);
  const summary = useCloudStore((s) => s.accessSummary);

  if (!summary) return null;

  return (
    <AccessBannerInner locale={locale} summary={summary} />
  );
}

function AccessBannerInner({
  locale,
  summary,
}: {
  locale: "ru" | "en";
  summary: AccessSummaryPublic;
}) {
  const expiresAt = summary.expiresAt;
  const days = summary.daysRemaining;
  const showMilestone = shouldShowAccessBannerMilestone(expiresAt, days);
  const [hidden, setHidden] = useState(!showMilestone);

  useEffect(() => {
    setHidden(!shouldShowAccessBannerMilestone(expiresAt, days));
  }, [expiresAt, days]);

  useEffect(() => {
    if (!expiresAt || !showMilestone) return;
    if (isAccessLastDay(days)) return;
    return () => {
      markAccessWelcomeSeen(expiresAt);
    };
  }, [showMilestone, expiresAt, days]);

  const snoozeBanner = useCallback(() => {
    dismissAccessBanner(expiresAt, days);
    setHidden(true);
  }, [expiresAt, days]);

  const onDismiss = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      snoozeBanner();
    },
    [snoozeBanner],
  );

  const onBannerClick = useCallback(() => {
    requestOpenSettings();
  }, []);

  if (hidden || !showMilestone) return null;
  const date = formatAccessDate(expiresAt, locale);

  const breakdownParts: string[] = [];
  if (summary.trialDays > 0) {
    breakdownParts.push(t(locale, "accessBannerTrialPart", { days: String(summary.trialDays) }));
  }
  if (summary.referralDaysTotal > 0) {
    breakdownParts.push(
      t(locale, "accessBannerReferralPart", { days: String(summary.referralDaysTotal) }),
    );
  }

  const breakdown =
    breakdownParts.length > 0
      ? breakdownParts.join(locale === "ru" ? " + " : " + ")
      : null;

  return (
    <button
      type="button"
      onClick={onBannerClick}
      className="group -mx-4 mb-1 flex w-[calc(100%+2rem)] items-start gap-2 border-b-2 border-emerald-700/35 bg-emerald-100 px-4 py-2.5 text-left text-emerald-950 transition-colors hover:bg-emerald-200/80 dark:border-emerald-500/50 dark:bg-emerald-950 dark:text-emerald-50 dark:hover:bg-emerald-900"
      aria-label={t(locale, "accessBannerAria")}
    >
      <span className="min-w-0 flex-1">
        <p className="text-xs font-semibold leading-snug">
          {t(locale, "accessBannerTitle", { days: daysLabel(locale, days) })}
          {summary.testMode ? (
            <span className="ml-1 font-normal opacity-80">· {t(locale, "trialBannerTest")}</span>
          ) : null}
        </p>
        {breakdown ? (
          <p className="mt-1 text-[11px] leading-snug opacity-90">
            {breakdown}
            {date ? ` · ${t(locale, "accessBannerUntil", { date })}` : null}
          </p>
        ) : null}
      </span>
      <span
        role="button"
        tabIndex={0}
        aria-label={t(locale, "trialBannerDismiss")}
        className="shrink-0 rounded p-0.5 text-emerald-900/70 hover:bg-emerald-700/20 dark:text-emerald-100/80 dark:hover:bg-emerald-500/30"
        onClick={onDismiss}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onDismiss(e);
          }
        }}
      >
        <X className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

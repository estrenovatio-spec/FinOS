"use client";

import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestOpenSettings } from "@/lib/billing/trial-banner";
import {
  markSubscriptionReminderShownToday,
  subscriptionReminderShownToday,
} from "@/lib/billing/subscription-reminder";
import { subscriptionTrialUiEnabled } from "@/lib/payments/config";
import { t } from "@/lib/i18n";
import { useCloudStore, useSubscriptionRequired } from "@/store/useCloudStore";
import { useStore } from "@/store/useStore";

/**
 * Once per day when subscription expired: cloud/bot paused + pay CTA.
 */
export function SubscriptionExpiredReminder() {
  const locale = useStore((s) => s.locale);
  const subscriptionRequired = useSubscriptionRequired();
  const subscription = useCloudStore((s) => s.subscription);

  if (!subscriptionTrialUiEnabled()) return null;
  if (!subscriptionRequired || !subscription) return null;
  if (subscriptionReminderShownToday()) return null;

  const price = String(subscription.priceRub);
  const days = String(subscription.periodDays);

  return (
    <div
      className="-mx-4 mb-1 border-b-2 border-destructive bg-destructive/10 px-4 py-3"
      role="alert"
    >
      <p className="flex items-start gap-2 text-sm font-semibold text-destructive">
        <CreditCard className="mt-0.5 h-4 w-4 shrink-0" />
        {t(locale, "subscriptionExpiredReminderTitle")}
      </p>
      <p className="mt-1.5 text-xs leading-snug text-destructive/90">
        {t(locale, "subscriptionExpiredReminderBody")}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {t(locale, "paywallDesc", { price, days })}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={() => {
            markSubscriptionReminderShownToday();
            requestOpenSettings();
          }}
        >
          {t(locale, "subscriptionExpiredReminderPay")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={markSubscriptionReminderShownToday}
        >
          {t(locale, "subscriptionExpiredReminderSnooze")}
        </Button>
      </div>
    </div>
  );
}

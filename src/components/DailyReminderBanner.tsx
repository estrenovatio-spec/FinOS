"use client";

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { useStore, useTransactions } from "@/store/useStore";

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function isNowInWindow(start: string, end: string): boolean {
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s <= e) return current >= s && current <= e;
  return current >= s || current <= e;
}

export function DailyReminderBanner() {
  const locale = useStore((s) => s.locale);
  const reminderEnabled = useStore((s) => s.reminderEnabled);
  const reminderTime = useStore((s) => s.reminderTime);
  const reminderWindowStart = useStore((s) => s.reminderWindowStart);
  const reminderWindowEnd = useStore((s) => s.reminderWindowEnd);
  const reminderLastShownDate = useStore((s) => s.reminderLastShownDate);
  const markReminderShownToday = useStore((s) => s.markReminderShownToday);
  const transactions = useTransactions();

  if (!reminderEnabled) return null;

  const today = new Date().toISOString().slice(0, 10);
  if (reminderLastShownDate === today) return null;

  const hasTodayTx = transactions.some((tx) => tx.date === today);
  if (hasTodayTx) return null;

  if (!isNowInWindow(reminderWindowStart, reminderWindowEnd)) return null;

  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  if (nowMinutes < toMinutes(reminderTime)) return null;

  return (
    <div className="rounded-lg border border-amber-400/40 bg-amber-50 p-3 dark:bg-amber-950/20">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-start gap-2 text-sm font-medium">
          <Bell className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          {t(locale, "reminderBannerTitle")}
        </p>
        <Button type="button" size="sm" variant="ghost" onClick={markReminderShownToday}>
          {t(locale, "reminderBannerSnooze")}
        </Button>
      </div>
    </div>
  );
}

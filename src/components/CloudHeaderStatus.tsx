"use client";

import { Loader2 } from "lucide-react";
import { formatLastSync } from "@/lib/format-last-sync";
import { isCloudPaused } from "@/lib/cloud/cloud-pause";
import { useHouseholdCloud } from "@/hooks/useHouseholdCloud";
import { t } from "@/lib/i18n";
import { useCloudStore } from "@/store/useCloudStore";
import { useStore } from "@/store/useStore";

/** Компактный статус облака под иконками языка и настроек */
export function CloudHeaderStatus() {
  const locale = useStore((s) => s.locale);
  const lastSyncedAt = useCloudStore((s) => s.lastSyncedAt);
  const paused = isCloudPaused();
  const { isActive, loading } = useHouseholdCloud();

  if (loading && !lastSyncedAt && !isActive) {
    return (
      <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        <span>{t(locale, "cloudSyncTitle")}</span>
      </p>
    );
  }

  if (paused && !isActive) {
    return (
      <p className="text-right text-xs leading-tight text-amber-700">
        {t(locale, "cloudPausedTitle")}
      </p>
    );
  }

  if (isActive) {
    const timeLabel = formatLastSync(lastSyncedAt, locale);
    return (
      <p className="text-right text-xs leading-tight text-muted-foreground" title={lastSyncedAt ?? undefined}>
        {t(locale, "cloudSyncLast", { time: timeLabel })}
      </p>
    );
  }

  return null;
}

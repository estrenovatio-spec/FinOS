"use client";

import { Loader2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useHouseholdCloud } from "@/hooks/useHouseholdCloud";
import { t } from "@/lib/i18n";
import { formatLastSync } from "@/lib/format-last-sync";
import { useCloudStore } from "@/store/useCloudStore";
import { useStore } from "@/store/useStore";

type Props = {
  /** Hide section title (e.g. inside settings panel) */
  embedded?: boolean;
  onDisconnect?: () => void;
  showReplace?: boolean;
};

export function CloudSyncActions({ embedded, onDisconnect, showReplace = true }: Props) {
  const locale = useStore((s) => s.locale);
  const txCount = useStore((s) => s.transactions.length);
  const lastSyncedAt = useCloudStore((s) => s.lastSyncedAt);
  const { toast } = useToast();
  const { loading, error, replaceCloudWithThisDevice, isActive } = useHouseholdCloud();
  const [lastAction, setLastAction] = useState<"replace" | null>(null);

  if (!isActive) return null;

  const handleReplace = async () => {
    if (!window.confirm(t(locale, "cloudSyncReplaceConfirm"))) return;
    setLastAction("replace");
    const ok = await replaceCloudWithThisDevice();
    if (ok) {
      toast(t(locale, "cloudSyncSuccessReplace"), "success");
    } else {
      toast(t(locale, "cloudSyncFailed"), "error");
    }
    setLastAction(null);
  };

  return (
    <div
      className={
        embedded
          ? "min-w-0 space-y-2 overflow-hidden"
          : "space-y-2 rounded-lg border bg-muted/30 p-3"
      }
    >
      {!embedded && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{t(locale, "cloudSyncTitle")}</p>
          <p className="text-xs text-muted-foreground">
            {t(locale, "cloudSyncLast", { time: formatLastSync(lastSyncedAt, locale) })}
          </p>
        </div>
      )}

      {embedded && (
        <p className="text-xs text-muted-foreground">
          {t(locale, "cloudSyncLast", { time: formatLastSync(lastSyncedAt, locale) })}
        </p>
      )}

      {showReplace ? (
        <Button
          type="button"
          variant="outline"
          className="h-auto min-h-11 w-full min-w-0 whitespace-normal flex-col items-start gap-0.5 px-3 py-2 text-left"
          disabled={loading}
          onClick={() => void handleReplace()}
        >
          <span className="flex w-full min-w-0 items-center gap-2 font-medium leading-snug">
            {loading && lastAction === "replace" ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4 shrink-0" />
            )}
            <span className="min-w-0 break-words">{t(locale, "cloudSyncReplace")}</span>
          </span>
          <span className="w-full break-words text-xs font-normal leading-snug text-muted-foreground">
            {t(locale, "cloudSyncReplaceHint", { count: String(txCount) })}
          </span>
        </Button>
      ) : null}

      {error && (
        <p className="text-xs text-destructive">
          {error === "sync_failed" || error === "import_failed"
            ? t(locale, "cloudSyncFailed")
            : error}
        </p>
      )}

      {onDisconnect && (
        <Button type="button" variant="ghost" className="w-full text-xs text-muted-foreground" onClick={onDisconnect}>
          {t(locale, "cloudDisconnect")}
        </Button>
      )}
    </div>
  );
}

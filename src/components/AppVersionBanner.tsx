"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { checkForAppUpdate, storeBuildTag } from "@/lib/app-update";
import { t } from "@/lib/i18n";
import { softReloadApp } from "@/lib/storage-reset";
import { useStore } from "@/store/useStore";

export function AppVersionBanner() {
  const locale = useStore((s) => s.locale);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [serverTag, setServerTag] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    const result = await checkForAppUpdate();
    setServerTag(result.serverTag);
    setUpdateAvailable(result.updateAvailable);
  }, []);

  useEffect(() => {
    void runCheck();
    const onVisible = () => {
      if (document.visibilityState === "visible") void runCheck();
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => void runCheck(), 5 * 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [runCheck]);

  const applyUpdate = () => {
    if (serverTag) storeBuildTag(serverTag);
    softReloadApp();
  };

  if (!updateAvailable) return null;

  return (
    <div
      className="rounded-lg border border-amber-300/80 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
      role="status"
    >
      <p className="font-medium">{t(locale, "updateAvailableTitle")}</p>
      <p className="mt-0.5 text-xs opacity-90">{t(locale, "updateAvailableHint")}</p>
      {serverTag ? (
        <p className="mt-1 text-[10px] opacity-70 tabular-nums">
          {t(locale, "updateAvailableBuild", { tag: serverTag })}
        </p>
      ) : null}
      <Button type="button" size="sm" className="mt-2 w-full" onClick={applyUpdate}>
        {t(locale, "updateAvailableButton")}
      </Button>
    </div>
  );
}

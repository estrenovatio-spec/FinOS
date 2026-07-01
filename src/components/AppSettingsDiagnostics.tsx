"use client";

import { useEffect, useState } from "react";
import { fetchServerBuildTag, getStoredBuildTag } from "@/lib/app-update";
import {
  decodeUserIdFromHouseholdToken,
  ensureCloudViewerUserId,
} from "@/lib/cloud/viewer-identity";
import { t } from "@/lib/i18n";
import { useCloudStore } from "@/store/useCloudStore";
import { useStore } from "@/store/useStore";

export function AppSettingsDiagnostics() {
  const locale = useStore((s) => s.locale);
  const household = useCloudStore((s) => s.household);
  const [serverTag, setServerTag] = useState<string | null>(null);

  const cloudToken = useCloudStore((s) => s.token);
  const storedCloudUserId = useCloudStore((s) => s.cloudUserId);

  useEffect(() => {
    ensureCloudViewerUserId();
    void fetchServerBuildTag().then(setServerTag);
  }, [cloudToken]);

  const storedTag = getStoredBuildTag();
  const fromToken = decodeUserIdFromHouseholdToken(cloudToken);
  const idMismatch = Boolean(
    fromToken && storedCloudUserId && fromToken !== storedCloudUserId,
  );
  const viewerId = ensureCloudViewerUserId();
  const shortId = viewerId ? `…${viewerId.slice(-6)}` : "—";
  const outdated = Boolean(serverTag && storedTag && serverTag !== storedTag);

  return (
    <div className="space-y-1 rounded-md border border-dashed px-2 py-2 text-[11px] text-muted-foreground">
      <p>
        {t(locale, "settingsBuildServer", { tag: serverTag ?? "…" })}
        {storedTag ? ` · ${t(locale, "settingsBuildLocal", { tag: storedTag })}` : null}
      </p>
      {household ? (
        <p>{t(locale, "settingsCloudAccount", { id: shortId })}</p>
      ) : null}
      {outdated ? (
        <p className="text-amber-700 dark:text-amber-300">{t(locale, "settingsBuildOutdated")}</p>
      ) : null}
      {idMismatch ? (
        <p className="text-destructive">{t(locale, "settingsIdentityMismatch")}</p>
      ) : null}
      {household ? (
        <p>{t(locale, "settingsBalanceSwapHint")}</p>
      ) : null}
    </div>
  );
}

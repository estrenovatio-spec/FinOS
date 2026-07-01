"use client";

import { useEffect } from "react";
import { canRunCloudBootstrap, runHouseholdBootstrap } from "@/lib/cloud/bootstrap";
import { apiConsumeWebLoginToken } from "@/lib/cloud/client";
import { hasCloudAuth } from "@/lib/cloud/auth-payload";
import { isCloudPaused, setCloudPaused } from "@/lib/cloud/cloud-pause";
import { applyHouseholdSync } from "@/lib/cloud/apply-sync";
import { waitForTelegramInitData, shouldWaitForTelegramInitData } from "@/lib/cloud/wait-telegram-init";
import { hasTelegramWebApp } from "@/lib/cloud/telegram";
import { useCloudAutoSync } from "@/hooks/useCloudAutoSync";
import { useCloudStore } from "@/store/useCloudStore";

/** Cloud bootstrap on load (after persist rehydrate) + auto-sync while tab is open. */
export function HouseholdCloudBootstrap() {
  useCloudAutoSync();

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      if (cancelled) return;

      const url = new URL(window.location.href);
      const webLogin = url.searchParams.get("web_login")?.trim();
      if (webLogin) {
        url.searchParams.delete("web_login");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
        const res = await apiConsumeWebLoginToken(webLogin);
        if (cancelled) return;
        if (res.ok && res.token && res.household) {
          setCloudPaused(false);
          if (res.subscription) useCloudStore.getState().setSubscription(res.subscription);
          useCloudStore.getState().setAccessSummary(res.accessSummary ?? null);
          if (res.user?.id) useCloudStore.getState().setCloudUserId(res.user.id);
          if (res.sync) applyHouseholdSync(res.sync, res.token);
          else useCloudStore.getState().setSession(res.token, res.household);
          useCloudStore.getState().touchSync();
          return;
        }
      }

      if (shouldWaitForTelegramInitData()) {
        await waitForTelegramInitData(6000);
        if (cancelled) return;
      }

      if (isCloudPaused()) return;

      if (!canRunCloudBootstrap()) return;
      await runHouseholdBootstrap();
    };

    const persistApi = useCloudStore.persist;
    const afterHydrate = () => {
      void boot();
    };

    if (persistApi?.hasHydrated?.()) {
      void boot();
    } else {
      const unsub = persistApi?.onFinishHydration?.(afterHydrate);
      if (unsub) {
        return () => {
          cancelled = true;
          unsub();
        };
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void boot();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}

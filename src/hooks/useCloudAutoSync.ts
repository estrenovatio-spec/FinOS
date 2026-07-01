"use client";

import { useEffect, useRef } from "react";
import { applyHouseholdSync } from "@/lib/cloud/apply-sync";
import { hasCloudAuth } from "@/lib/cloud/auth-payload";
import { refreshCloudSessionFromTelegram, runHouseholdBootstrap } from "@/lib/cloud/bootstrap";
import { isCloudPaused } from "@/lib/cloud/cloud-pause";
import { isCloudRestoreInProgress } from "@/lib/cloud/restore-lock";
import { isAuthSyncError } from "@/lib/cloud/sync-errors";
import { isTransientHttpError } from "@/lib/fetch-retry";
import { apiSync } from "@/lib/cloud/client";
import { useCloudStore } from "@/store/useCloudStore";

const MIN_PULL_MS = 5_000;
/** Browser tab may stay open while phone records — poll occasionally */
const POLL_MS = 5_000;

function shouldReplaceOnPull(): boolean {
  return false;
}

/** Pull cloud on load, when tab becomes visible, and on a timer while visible. */
export function useCloudAutoSync() {
  const lastPullAt = useRef(0);

  useEffect(() => {
    const pull = () => {
      if (isCloudRestoreInProgress()) return;
      if (isCloudPaused()) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

      const now = Date.now();
      if (now - lastPullAt.current < MIN_PULL_MS) return;

      const token = useCloudStore.getState().token;
      const household = useCloudStore.getState().household;
      if (!token) {
        if (hasCloudAuth()) {
          void runHouseholdBootstrap();
        }
        return;
      }
      if (!household) {
        void runHouseholdBootstrap();
      }

      lastPullAt.current = now;
      void apiSync(token)
        .then((res) => {
          applyHouseholdSync(res.sync, token, { replace: shouldReplaceOnPull() });
          useCloudStore.getState().touchSync();
        })
        .catch((e) => {
          if (isAuthSyncError(e)) {
            void refreshCloudSessionFromTelegram().then((ok) => {
              if (!ok) {
                /* Не рвём существующую сессию: при временной auth-проблеме
                   следующий bootstrap/pull сможет восстановиться сам. */
              }
            });
            return;
          }
          /* transient deploy/network — next poll retries silently */
          if (isTransientHttpError(e)) return;
        });
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        lastPullAt.current = 0;
        pull();
      }
    };

    const onFocus = () => {
      lastPullAt.current = 0;
      pull();
    };

    const onPageShow = () => {
      lastPullAt.current = 0;
      pull();
    };

    pull();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    const interval = window.setInterval(pull, POLL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
      window.clearInterval(interval);
    };
  }, []);
}

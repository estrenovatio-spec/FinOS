"use client";

import { useEffect } from "react";

const CHUNK_RETRY_KEY = "vb-chunk-reload-once";

/**
 * Мягкая устойчивость к деплою: не блокируем UI, один тихий reload при сбое загрузки нового JS.
 */
export function DeployResilience() {
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as { message?: string } | string | undefined;
      const message =
        typeof reason === "string" ? reason : (reason?.message ?? String(reason ?? ""));

      if (
        !/Failed to fetch dynamically imported module|Loading chunk|ChunkLoadError|Importing a module script failed/i.test(
          message,
        )
      ) {
        return;
      }

      if (sessionStorage.getItem(CHUNK_RETRY_KEY)) return;
      sessionStorage.setItem(CHUNK_RETRY_KEY, "1");
      event.preventDefault();

      window.setTimeout(() => {
        if (document.visibilityState === "visible") {
          window.location.reload();
        }
      }, 2500);
    };

    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);

  return null;
}

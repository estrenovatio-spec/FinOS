"use client";

import { useEffect, useState } from "react";
import { hasTelegramWebApp } from "@/lib/cloud/telegram";

/** Telegram.WebApp is injected shortly after page load — not always on first paint. */
export function useTelegramWebAppReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (hasTelegramWebApp()) {
      setReady(true);
      return;
    }

    let attempts = 0;
    const id = window.setInterval(() => {
      attempts += 1;
      if (hasTelegramWebApp()) {
        setReady(true);
        window.clearInterval(id);
      } else if (attempts > 80) {
        window.clearInterval(id);
      }
    }, 100);

    return () => window.clearInterval(id);
  }, []);

  return ready;
}

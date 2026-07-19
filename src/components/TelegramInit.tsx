"use client";

import { useEffect } from "react";
import { applyLightTheme, syncThemeFromTelegram } from "@/lib/app-theme";
import { detectAppLocale } from "@/lib/locale-infer";
import { applyTelegramDefaultUserName, whenStoreHydrated } from "@/lib/telegram-default-names";
import { runTelegramBack } from "@/lib/telegram-back";
import { useStore } from "@/store/useStore";

export function TelegramInit() {
  const setLocale = useStore((s) => s.setLocale);
  const ensureTrackingStarted = useStore((s) => s.ensureTrackingStarted);

  useEffect(() => {
    ensureTrackingStarted();

    const tg = window.Telegram?.WebApp;
    if (!tg) {
      applyLightTheme();
      return;
    }

    tg.ready();
    tg.expand();
    const offTheme = syncThemeFromTelegram();

    const unsubHydrate = whenStoreHydrated(() => {
      applyTelegramDefaultUserName(tg.initDataUnsafe?.user?.first_name);
    });

    const user = tg.initDataUnsafe?.user;
    setLocale(detectAppLocale(user?.language_code));

    const onBack = () => runTelegramBack();
    if (tg.BackButton) {
      tg.BackButton.show();
      tg.BackButton.onClick(onBack);
    }

    const height = tg.viewportStableHeight || tg.viewportHeight;
    if (height) {
      document.documentElement.style.setProperty("--tg-viewport-height", `${height}px`);
      document.documentElement.style.setProperty("--app-viewport-height", `${height}px`);
    }

    return () => {
      unsubHydrate?.();
      offTheme?.();
      if (tg.BackButton) {
        tg.BackButton.offClick(onBack);
        tg.BackButton.hide();
      }
    };
  }, [ensureTrackingStarted, setLocale]);

  return null;
}

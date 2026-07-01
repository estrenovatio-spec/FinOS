"use client";

import { useEffect } from "react";
import { registerTelegramBackHandler } from "@/lib/telegram-back";

/** Регистрирует обработчик «Назад» (LIFO). Верните true, если событие обработано. */
export function useTelegramBackHandler(
  handler: () => boolean,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;
    return registerTelegramBackHandler(handler);
  }, [enabled, handler]);
}

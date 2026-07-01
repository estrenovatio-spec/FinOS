import type { Locale } from "@/types";
import { detectLocale } from "@/lib/i18n";

/** Язык интерфейса в Mini App: Telegram en + телефон ru → русский (часто ZTE / Android). */
export function detectAppLocale(telegramLanguageCode?: string): Locale {
  const fromTelegram = detectLocale(telegramLanguageCode);
  if (fromTelegram === "ru") return "ru";
  if (typeof navigator !== "undefined") {
    const nav = navigator.language.toLowerCase();
    if (
      nav.startsWith("ru") ||
      nav.startsWith("uk") ||
      nav.startsWith("be") ||
      nav.startsWith("kk")
    ) {
      return "ru";
    }
  }
  return fromTelegram;
}

/** Разбор фразы: кириллица → ru, иначе язык интерфейса. */
export function inferParseLocale(transcript: string, uiLocale: Locale): Locale {
  if (/[а-яёА-ЯЁ]/.test(transcript)) return "ru";
  return uiLocale;
}

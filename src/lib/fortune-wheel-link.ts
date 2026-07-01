import { openExternalAppLink } from "@/lib/education-links";

const DEFAULT_WHEEL_URL = "https://t.me/Fortuna_Fin_Bot";

export function getFortuneWheelUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_FORTUNE_WHEEL_URL?.trim() ||
    process.env.NEXT_PUBLIC_FORTUNE_WHEEL_URL_PREVIEW?.trim() ||
    DEFAULT_WHEEL_URL;
  return url.startsWith("http") ? url : DEFAULT_WHEEL_URL;
}

/** Колесо фортуны: бот / Mini App в Telegram */
export function openFortuneWheelLink(): void {
  const url = getFortuneWheelUrl();
  const tg = window.Telegram?.WebApp;
  const openTgLink = (
    tg as { openTelegramLink?: (link: string) => void } | undefined
  )?.openTelegramLink;

  try {
    if (url.includes("t.me") && openTgLink) {
      openTgLink(url);
      return;
    }
    if (tg?.openLink) {
      tg.openLink(url, { try_instant_view: false });
      return;
    }
  } catch {
    /* fallback */
  }
  openExternalAppLink(url);
}

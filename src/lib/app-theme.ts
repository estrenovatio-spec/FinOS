/** Всегда светлая тема (без тёмной и без следования за Telegram/OS). */
export function applyLightTheme(): void {
  const root = document.documentElement;
  root.classList.remove("dark");

  // Keep the native WebView and the first painted app frame in the same
  // warm FinOS colour, so no green/white flash is visible before React loads.
  root.style.setProperty("--tg-bg", "#f7f1ea");
  root.style.setProperty("--tg-text", "#24211e");
  root.style.setProperty("--tg-secondary", "#efe8df");
  document.body.style.backgroundColor = "#f7f1ea";
  document.body.style.color = "#24211e";
}

/** Telegram: только viewport; цвета приложения — светлые. */
export function syncThemeFromTelegram(): (() => void) | void {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  const apply = () => applyLightTheme();

  apply();
  tg.onEvent?.("themeChanged", apply);
  return () => {
    /* lifetime listener */
  };
}

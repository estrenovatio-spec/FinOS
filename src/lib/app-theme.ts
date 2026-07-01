/** Всегда светлая тема (без тёмной и без следования за Telegram/OS). */
export function applyLightTheme(): void {
  const root = document.documentElement;
  root.classList.remove("dark");

  root.style.setProperty("--tg-bg", "#ffffff");
  root.style.setProperty("--tg-text", "#0a0a0a");
  root.style.setProperty("--tg-secondary", "#f4f4f5");
  document.body.style.backgroundColor = "#ffffff";
  document.body.style.color = "#0a0a0a";
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

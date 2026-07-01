export function getTelegramInitData(): string {
  if (typeof window === "undefined") return "";
  return window.Telegram?.WebApp?.initData?.trim() ?? "";
}

export function hasTelegramWebApp(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.Telegram?.WebApp);
}

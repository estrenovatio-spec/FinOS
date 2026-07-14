export type AppTabId =
  | "today"
  | "operations"
  | "forecast"
  | "plan"
  | "settings";

const TAB_STORAGE_KEY = "vb_app_tab_v1";

/** Дом + Операции + Финсоветник + Биз + Ещё. Отключить: NEXT_PUBLIC_APP_BOTTOM_NAV=false на Vercel. */
export function bottomNavEnabled(): boolean {
  return process.env.NEXT_PUBLIC_APP_BOTTOM_NAV !== "false";
}

export function readStoredAppTab(): AppTabId {
  if (typeof window === "undefined") return "today";
  const requested = readRequestedAppTab();
  if (requested) return requested;
  try {
    const raw = sessionStorage.getItem(TAB_STORAGE_KEY);
    if (
      raw === "today" ||
      raw === "operations" ||
      raw === "forecast" ||
      raw === "plan" ||
      raw === "settings"
    ) {
      return raw;
    }
    if (raw === "home" || raw === "family") return "today";
    if (raw === "advisor" || raw === "learn") return "forecast";
    if (raw === "business" || raw === "recurring" || raw === "regulars") return "plan";
    if (raw === "more") return "settings";
  } catch {
    /* ignore */
  }
  return "today";
}

export function readRequestedAppTab(): AppTabId | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = new URLSearchParams(window.location.search).get("tab");
    if (
      raw === "today" ||
      raw === "operations" ||
      raw === "forecast" ||
      raw === "plan" ||
      raw === "settings"
    ) {
      return raw;
    }
    if (raw === "home" || raw === "family") return "today";
    if (raw === "advisor" || raw === "learn") return "forecast";
    if (raw === "business" || raw === "recurring" || raw === "regulars") return "plan";
    if (raw === "more") return "settings";
  } catch {
    /* ignore */
  }
  return null;
}

export function writeStoredAppTab(tab: AppTabId): void {
  try {
    sessionStorage.setItem(TAB_STORAGE_KEY, tab);
  } catch {
    /* ignore */
  }
}

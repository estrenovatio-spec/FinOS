const STORE_KEY = "voicebudget-store";
export const BUSINESS_STORE_KEY = "voicebudget-business-preview-v2";
const CLOUD_KEY = "voicebudget-cloud";
const WEB_LOGIN_KEY = "voicebudget-tg-web-login";
const CLOUD_PAUSE_KEY = "voicebudget-cloud-paused";
const RECOMMENDATIONS_KEY = "voicebudget-recommendations";
const RECOMMENDATIONS_TS_KEY = "voicebudget-recommendations-ts";
const WEEKLY_KEY = "voicebudget-weekly-analysis-v3";
const WEEKLY_TS_KEY = "voicebudget-weekly-analysis-ts-v3";
const WEEKLY_CHAT_KEY = "voicebudget-weekly-chat-v1";
const MONTHLY_KEY = "voicebudget-monthly-analysis-v2";
const MONTHLY_TS_KEY = "voicebudget-monthly-analysis-ts-v2";
const MONTHLY_CHAT_KEY = "voicebudget-monthly-chat-v1";
export const TIPS_TAB_ORDER_KEY = "voicebudget-tips-tab-order";
export const TRANSACTIONS_HIDDEN_KEY = "voicebudget-transactions-hidden";
/** Вкладка «Все / Доходы / Расходы» в списке транзакций */
export const TRANSACTIONS_TYPE_FILTER_KEY = "voicebudget-transactions-type-filter";
export const TIPS_PANEL_HIDDEN_KEY = "voicebudget-tips-panel-hidden";
export const PLANNING_TIPS_HIDDEN_KEY = "voicebudget-planning-tips-hidden";
export const PLANNING_PANEL_HIDDEN_KEY = "voicebudget-planning-panel-hidden";
export const AI_RECOMMENDATIONS_HIDDEN_KEY = "voicebudget-ai-recommendations-hidden";
export const WEEKLY_ANALYSIS_HIDDEN_KEY = "voicebudget-weekly-analysis-hidden";
export const MONTHLY_ANALYSIS_HIDDEN_KEY = "voicebudget-monthly-analysis-hidden";
export const SUMMARY_INCOME_HIDDEN_KEY = "voicebudget-summary-income-hidden";
export const SUMMARY_EXPENSE_HIDDEN_KEY = "voicebudget-summary-expense-hidden";
export const CHART_HIDDEN_KEY = "voicebudget-chart-hidden";
export const BALANCE_AMOUNTS_HIDDEN_KEY = "voicebudget-balance-amounts-hidden";
const HOME_SECTION_ORDER_KEY = "voicebudget-home-section-order";
export const APP_BUILD_KEY = "voicebudget-app-build";
export const FAMILY_ONBOARDING_DONE_KEY = "voicebudget-family-onboarding-v1";

const DISMISSIBLE_HINTS_PREFIX = "voicebudget-hints-hidden:";

/** Legacy tap-to-hide hints under balance/voice — remove leftover keys */
export function clearDismissibleHintKeys(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(DISMISSIBLE_HINTS_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* ignore */
  }
}

export function clearAppStorage(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CLOUD_PAUSE_KEY, "1");
    localStorage.setItem(CLOUD_PAUSE_KEY, "1");
    localStorage.removeItem(STORE_KEY);
    localStorage.removeItem(BUSINESS_STORE_KEY);
    localStorage.removeItem(RECOMMENDATIONS_KEY);
    localStorage.removeItem(RECOMMENDATIONS_TS_KEY);
    localStorage.removeItem(WEEKLY_KEY);
    localStorage.removeItem(WEEKLY_TS_KEY);
    localStorage.removeItem(WEEKLY_CHAT_KEY);
    localStorage.removeItem(MONTHLY_KEY);
    localStorage.removeItem(MONTHLY_TS_KEY);
    localStorage.removeItem(MONTHLY_CHAT_KEY);
    localStorage.removeItem(TIPS_TAB_ORDER_KEY);
    localStorage.removeItem(TRANSACTIONS_HIDDEN_KEY);
    localStorage.removeItem(TIPS_PANEL_HIDDEN_KEY);
    localStorage.removeItem(PLANNING_TIPS_HIDDEN_KEY);
    localStorage.removeItem(PLANNING_PANEL_HIDDEN_KEY);
    localStorage.removeItem(AI_RECOMMENDATIONS_HIDDEN_KEY);
    localStorage.removeItem(WEEKLY_ANALYSIS_HIDDEN_KEY);
    localStorage.removeItem(MONTHLY_ANALYSIS_HIDDEN_KEY);
    localStorage.removeItem(SUMMARY_INCOME_HIDDEN_KEY);
    localStorage.removeItem(SUMMARY_EXPENSE_HIDDEN_KEY);
    localStorage.removeItem(CHART_HIDDEN_KEY);
    localStorage.removeItem(BALANCE_AMOUNTS_HIDDEN_KEY);
    localStorage.removeItem(HOME_SECTION_ORDER_KEY);
    localStorage.removeItem(FAMILY_ONBOARDING_DONE_KEY);
    clearDismissibleHintKeys();
    localStorage.removeItem(CLOUD_KEY);
    localStorage.removeItem(WEB_LOGIN_KEY);
    localStorage.setItem(CLOUD_PAUSE_KEY, "1");
    sessionStorage.removeItem(WEB_LOGIN_KEY);
    sessionStorage.removeItem("vb_app_tab_v1");
    sessionStorage.removeItem("vb-chunk-reload-once");
  } catch {
    /* ignore */
  }
}

/** Перезагрузка без удаления операций (обход кэша Telegram / Safari) */
export function softReloadApp(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem("vb-soft-reload", String(Date.now()));
  } catch {
    /* ignore */
  }
  const url = new URL(window.location.href);
  url.searchParams.set("vb", String(Date.now()));
  window.location.replace(url.toString());
}

/** Полный сброс данных и перезагрузка страницы */
export function hardReloadApp(): void {
  clearAppStorage();
  if (typeof window === "undefined") return;
  softReloadApp();
}

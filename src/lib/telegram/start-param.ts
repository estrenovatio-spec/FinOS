/** start_param from Telegram WebApp initData (unvalidated — use only after initData hash check). */
export function getStartParamFromInitData(initData: string): string | null {
  const raw = new URLSearchParams(initData.trim()).get("start_param");
  return raw?.trim() || null;
}

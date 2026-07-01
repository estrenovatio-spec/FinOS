import { hasTelegramWebApp, getTelegramInitData } from "@/lib/cloud/telegram";

/** In Mini App, initData can appear a few hundred ms after mount. */
export function shouldWaitForTelegramInitData(): boolean {
  return hasTelegramWebApp() && !getTelegramInitData();
}

export function waitForTelegramInitData(maxMs = 5000): Promise<string> {
  return new Promise((resolve) => {
    const existing = getTelegramInitData();
    if (existing) {
      resolve(existing);
      return;
    }
    if (!hasTelegramWebApp()) {
      resolve("");
      return;
    }

    const started = Date.now();
    const tick = () => {
      const data = getTelegramInitData();
      if (data) {
        resolve(data);
        return;
      }
      if (Date.now() - started >= maxMs) {
        resolve("");
        return;
      }
      window.setTimeout(tick, 150);
    };
    tick();
  });
}

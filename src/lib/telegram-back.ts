/** Обработка Telegram BackButton: сначала внутр. навигация, иначе закрыть Mini App. */

export type TelegramBackHandler = () => boolean;

const handlers: TelegramBackHandler[] = [];

export function registerTelegramBackHandler(handler: TelegramBackHandler): () => void {
  handlers.push(handler);
  return () => {
    const idx = handlers.indexOf(handler);
    if (idx >= 0) handlers.splice(idx, 1);
  };
}

/** Вызвать из Telegram.WebApp.BackButton.onClick */
export function runTelegramBack(): void {
  for (let i = handlers.length - 1; i >= 0; i--) {
    try {
      if (handlers[i]()) return;
    } catch (err) {
      console.warn("[telegram-back] handler error", err);
    }
  }
  window.Telegram?.WebApp?.close();
}

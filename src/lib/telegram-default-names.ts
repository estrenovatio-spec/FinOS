import { useStore } from "@/store/useStore";

/** Подставить имя из Telegram только если пользователь ещё не задал своё (после rehydrate). */
export function applyTelegramDefaultUserName(firstName: string | undefined): void {
  const trimmed = firstName?.trim();
  if (!trimmed) return;

  const { userName, userNameCustomized } = useStore.getState();
  if (userNameCustomized || userName?.trim()) return;

  useStore.setState({ userName: trimmed });
}

export function whenStoreHydrated(run: () => void): (() => void) | void {
  const persist = useStore.persist;
  if (persist.hasHydrated()) {
    run();
    return;
  }
  return persist.onFinishHydration(run);
}

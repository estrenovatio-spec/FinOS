"use client";

import { BUSINESS_STORE_KEY, clearAppStorage, softReloadApp } from "@/lib/storage-reset";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  chunkLike: boolean;
}

function isChunkOrStaleBundleError(error: Error): boolean {
  const msg = `${error.message} ${error.name}`;
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed|Unexpected token|is not valid JSON/i.test(
    msg,
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, chunkLike: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, chunkLike: isChunkOrStaleBundleError(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[voicebudget]", error, info);
    if (isChunkOrStaleBundleError(error)) {
      softReloadApp();
    }
  }

  handleReset = () => {
    clearAppStorage();
    softReloadApp();
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-lg font-semibold">Ошибка загрузки</h1>
          <p className="text-sm text-muted-foreground">
            {this.state.chunkLike
              ? "После обновления приложения браузер мог подгрузить старый кэш. Сейчас попробуем перезагрузить страницу автоматически — или нажмите кнопку ниже."
              : "Скорее всего повреждён кэш в браузере. Нажмите кнопку ниже — данные приложения на этом устройстве сбросятся, страница откроется заново."}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Сбросить данные и открыть снова
          </button>
          <p className="text-xs text-muted-foreground">
            Или: Cmd+Shift+R и удалите в DevTools → Application → Local Storage ключи{" "}
            <code className="text-foreground">voicebudget-store</code>,{" "}
            <code className="text-foreground">{BUSINESS_STORE_KEY}</code>
          </p>
        </main>
      );
    }
    return this.props.children;
  }
}

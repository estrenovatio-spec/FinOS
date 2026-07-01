"use client";

import { useEffect, useRef } from "react";
import type { TelegramLoginPayload } from "@/lib/telegram/login-widget";

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramLoginPayload) => void;
  }
}

type Props = {
  botUsername: string;
  onAuth: (user: TelegramLoginPayload) => void;
};

export function TelegramLoginButton({ botUsername, onAuth }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onAuthRef = useRef(onAuth);
  onAuthRef.current = onAuth;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !botUsername) return;

    window.onTelegramAuth = (user) => {
      onAuthRef.current(user);
    };

    host.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    host.appendChild(script);

    return () => {
      host.innerHTML = "";
      if (window.onTelegramAuth) delete window.onTelegramAuth;
    };
  }, [botUsername]);

  if (!botUsername) {
    return (
      <p className="text-xs text-amber-700 dark:text-amber-200">
        Задайте NEXT_PUBLIC_TG_BOT_NAME на сервере (имя бота без @).
      </p>
    );
  }

  return <div ref={hostRef} className="flex justify-center py-1" />;
}

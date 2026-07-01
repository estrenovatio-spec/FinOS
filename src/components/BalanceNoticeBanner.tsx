"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

const BALANCE_NOTICE_DISMISSED_KEY = "voicebudget-balance-notice-dismissed-v1";

export function BalanceNoticeBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(localStorage.getItem(BALANCE_NOTICE_DISMISSED_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(BALANCE_NOTICE_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <section className="rounded-lg border border-amber-400/70 bg-amber-100 px-3 py-2.5 text-amber-950 shadow-sm">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-xs leading-snug">
          <span className="font-semibold">Уважаемые пользователи</span> — есть вероятность
          корректировки баланса. Рекомендую посмотреть, проверить и при необходимости
          поправить. Команда Просто Бюджет.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-md p-1 text-amber-900/80 transition-colors hover:bg-amber-200 hover:text-amber-950"
          aria-label="Скрыть уведомление"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </section>
  );
}

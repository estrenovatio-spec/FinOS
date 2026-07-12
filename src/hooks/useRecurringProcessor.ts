"use client";

import { useEffect } from "react";
import { useStore } from "@/store/useStore";

/** Создаёт операции из просроченных регулярных записей при загрузке и возврате на вкладку */
export function useRecurringProcessor() {
  const processRecurringDue = useStore((s) => s.processRecurringDue);
  const recurringTransactions = useStore((s) => s.recurringTransactions);

  useEffect(() => {
    processRecurringDue();
  }, [processRecurringDue, recurringTransactions]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") processRecurringDue();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [processRecurringDue]);
}

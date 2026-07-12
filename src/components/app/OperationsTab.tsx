"use client";

import { TransactionList } from "@/components/TransactionList";
import { useStore } from "@/store/useStore";

export function OperationsTab() {
  const locale = useStore((s) => s.locale);

  return (
    <div className="space-y-3 py-1">
      <div>
        <h2 className="text-lg font-bold">
          {locale === "ru" ? "Операции" : "Operations"}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {locale === "ru"
            ? "Полная история доходов и расходов."
            : "Full history of income and expenses."}
        </p>
      </div>
      <TransactionList collapsible={false} />
    </div>
  );
}

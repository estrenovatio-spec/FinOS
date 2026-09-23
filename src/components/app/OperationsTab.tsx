"use client";

import { TransactionList } from "@/components/TransactionList";
import { useStore } from "@/store/useStore";

export function OperationsTab() {
  const locale = useStore((s) => s.locale);

  return (
    <div className="space-y-5 py-3">
      <div>
        <h2 className="finos-page-title">
          {locale === "ru" ? "Операции" : "Operations"}
        </h2>
        <p className="finos-page-subtitle">
          {locale === "ru"
            ? "Полная история доходов и расходов."
            : "Full history of income and expenses."}
        </p>
      </div>
      <TransactionList collapsible={false} />
    </div>
  );
}

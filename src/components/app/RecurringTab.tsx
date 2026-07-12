"use client";

import { useMemo, useState } from "react";
import { MoneySetupDialog } from "@/components/MoneySetupDialog";
import { PendingRecurringCard } from "@/components/PendingRecurringCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/format-money";
import { formatTransactionDateShort } from "@/lib/format-date";
import { hasPartnerBudget } from "@/lib/owner-labels";
import { useStore } from "@/store/useStore";

export function RecurringTab() {
  const locale = useStore((s) => s.locale);
  const recurringTransactions = useStore((s) => s.recurringTransactions);
  const partnerName = useStore((s) => s.partnerName);
  const partnerKeywords = useStore((s) => s.partnerKeywords);
  const [moneySetupOpen, setMoneySetupOpen] = useState(false);
  const showHouseholdToggle = hasPartnerBudget(partnerName, partnerKeywords);

  const activeRecurring = useMemo(
    () =>
      recurringTransactions
        .filter((item) => item.enabled)
        .sort((left, right) => left.nextRunDate.localeCompare(right.nextRunDate)),
    [recurringTransactions],
  );

  return (
    <div className="space-y-3 py-1">
      <div>
        <h2 className="text-lg font-bold">
          {locale === "ru" ? "Регулярные операции" : "Recurring"}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {locale === "ru"
            ? "Ближайшие регулярные списания и напоминания."
            : "Upcoming recurring payments and reminders."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => setMoneySetupOpen(true)}>
            {locale === "ru" ? "Добавить доход" : "Add income"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {locale === "ru"
            ? "Для регулярного или планового дохода откроется финансовая база. Разовое поступление добавляйте через «Добавить операцию»."
            : "Regular or planned income opens Money setup. One-off income still goes through Add entry."}
        </p>
      </div>

      <PendingRecurringCard />

      <Card className="border-border/25 bg-card/95 shadow-none">
        <CardContent className="space-y-3 p-4">
          {activeRecurring.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {locale === "ru"
                ? "Пока нет активных регулярных операций."
                : "No active recurring items yet."}
            </p>
          ) : (
            activeRecurring.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/80 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {item.note}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {locale === "ru" ? "Следующая дата:" : "Next date:"}{" "}
                    {formatTransactionDateShort(item.nextRunDate, locale)}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-foreground">
                  {formatMoney(item.amount, locale)} {locale === "ru" ? "₽" : "RUB"}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <MoneySetupDialog
        open={moneySetupOpen}
        onOpenChange={setMoneySetupOpen}
        showHouseholdToggle={showHouseholdToggle}
        initialSection="income"
      />
    </div>
  );
}

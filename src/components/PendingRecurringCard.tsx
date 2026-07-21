"use client";

import { useMemo, useState } from "react";
import { ExpectedEventActionDialog } from "@/components/ExpectedEventActionDialog";
import type { ExpectedEvent } from "@/lib/expected-events";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCategoryLabel } from "@/lib/categories";
import { recurringDisplayName } from "@/lib/planning/recurring-skipped";
import { resolveRecurringOccurrenceDate } from "@/lib/recurring-occurrence";
import { formatTransactionDate } from "@/lib/format-date";
import { formatMoney } from "@/lib/format-money";
import { t } from "@/lib/i18n";
import { isPendingTransaction } from "@/lib/transaction-confirmed";
import { useCategories, useStore, useTransactions } from "@/store/useStore";
import {
  collectHouseholdMemberUserIds,
  decodeUserIdFromHouseholdToken,
} from "@/lib/cloud/viewer-identity";
import { mapTransactionsForViewer } from "@/lib/transaction-owner";
import { useCloudStore } from "@/store/useCloudStore";

export function PendingRecurringCard() {
  const locale = useStore((s) => s.locale);
  const transactions = useTransactions();
  const categories = useCategories();
  const recurringTransactions = useStore((s) => s.recurringTransactions);
  const cloudUserId = useCloudStore((s) => s.cloudUserId);
  const token = useCloudStore((s) => s.token);
  const storedMemberIds = useCloudStore((s) => s.householdMemberUserIds);
  const [expectedEvent, setExpectedEvent] = useState<ExpectedEvent | null>(null);
  const [dialogMode, setDialogMode] = useState<"confirm" | "skip">("confirm");

  const pending = useMemo(() => {
    const viewerUserId = decodeUserIdFromHouseholdToken(token) ?? cloudUserId ?? null;
    const memberIds = collectHouseholdMemberUserIds(
      storedMemberIds,
      transactions,
      viewerUserId,
    );
    return mapTransactionsForViewer(transactions, viewerUserId, memberIds).filter(
      isPendingTransaction,
    );
  }, [transactions, cloudUserId, token, storedMemberIds]);

  if (pending.length === 0) return null;

  return (
    <>
      <Card className="border-amber-500/50 bg-amber-500/5">
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-base font-semibold">
            {t(locale, "recurringPendingTitle")}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{t(locale, "recurringPendingHint")}</p>
        </CardHeader>
        <CardContent className="space-y-1.5 pb-3">
          {pending.map((tx) => {
            const meta = formatTransactionDate(tx.date, locale);
            const category = getCategoryLabel(tx.categoryId, categories, locale);
            const recurring = tx.recurringId
              ? recurringTransactions.find((r) => r.id === tx.recurringId)
              : undefined;
            const title = recurring
              ? recurringDisplayName(recurring, category)
              : category;
            const event: ExpectedEvent = {
              kind: "expense",
              transactionId: tx.id,
              title,
              amount: tx.amount,
              date: tx.date,
              recurringOccurrenceDate: tx.recurringId
                ? resolveRecurringOccurrenceDate(tx)
                : null,
            };
            return (
              <div
                key={tx.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto] items-center gap-x-3 gap-y-1.5 rounded-md border border-amber-500/30 bg-background/80 p-2.5 text-sm"
              >
                <p className="min-w-0 truncate font-medium leading-tight">{title}</p>
                <p className="justify-self-end whitespace-nowrap text-sm font-semibold tabular-nums leading-none">
                  −{formatMoney(tx.amount, locale)}
                </p>
                <p className="min-w-0 truncate text-xs leading-snug text-muted-foreground tabular-nums">
                  {meta}
                </p>
                <div className="flex flex-wrap justify-end gap-1.5 justify-self-end">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 shrink-0 px-2.5 text-xs"
                    onClick={() => {
                      setExpectedEvent(event);
                      setDialogMode("confirm");
                    }}
                  >
                    <Check className="mr-1 h-3.5 w-3.5 shrink-0" />
                    {locale === "ru" ? "Оплатить" : "Pay"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 px-2.5 text-xs"
                    onClick={() => {
                      setExpectedEvent(event);
                      setDialogMode("skip");
                    }}
                  >
                    {locale === "ru" ? "Не оплатил" : "Not paid"}
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <ExpectedEventActionDialog
        open={expectedEvent != null}
        mode={dialogMode}
        event={expectedEvent}
        onOpenChange={(open) => {
          if (!open) setExpectedEvent(null);
        }}
      />
    </>
  );
}

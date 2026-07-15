"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Clock3,
  MoveRight,
  XCircle,
} from "lucide-react";
import {
  TransactionEditDialog,
  type TransactionDialogDraft,
  type TransactionDialogSaveResult,
} from "@/components/TransactionEditDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  cancelIncomeOccurrenceInSetup,
  clearExpectedEventReminderInSetup,
  expectedEventDate,
  expectedEventKey,
  nextLocalIsoDate,
  rescheduleIncomeSourceInSetup,
  setExpectedEventReminderInSetup,
  shouldSuggestRecurringAmountUpdate,
  type ExpectedEvent,
} from "@/lib/expected-events";
import { formatTransactionDate, getLocalTodayIsoDate } from "@/lib/format-date";
import { formatMoney } from "@/lib/format-money";
import { upsertIncomeSourceInSetup } from "@/lib/expected-events";
import { listConfiguredIncomeSources } from "@/lib/money-setup";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/store/useStore";
import { useTransactions } from "@/store/useStore";

type ExpectedEventDialogMode = "confirm" | "skip";
type SkipChoice = "reschedule" | "remind_tomorrow" | "cancel";

type RecurringAmountSuggestion =
  | {
      kind: "income";
      sourceId: string;
      title: string;
      expectedAmount: number;
      actualAmount: number;
    }
  | {
      kind: "expense";
      recurringId: string;
      title: string;
      expectedAmount: number;
      actualAmount: number;
    };

function buildIncomeDraft(
  event: Extract<ExpectedEvent, { kind: "income" }>,
  today: string,
  locale: "ru" | "en",
): TransactionDialogDraft {
  return {
    amount: event.amount,
    type: "income",
    categoryId: "salary",
    currency: "RUB",
    note: event.title,
    date: event.status === "due_today" ? today : event.occurrenceDate,
    incomeSourceId: event.incomeSourceId,
    incomeOccurrenceDate: event.occurrenceDate,
    title: locale === "ru" ? "Подтвердить получение" : "Confirm receipt",
    subtitle:
      event.status === "overdue_unconfirmed"
        ? locale === "ru"
          ? `Ожидалось ${formatTransactionDate(event.occurrenceDate, locale)}`
          : `Expected on ${formatTransactionDate(event.occurrenceDate, locale)}`
        : formatTransactionDate(event.occurrenceDate, locale),
    submitLabel: locale === "ru" ? "Сохранить" : "Save",
    sourceEditLabel: null,
  };
}

export function ExpectedEventActionDialog({
  open,
  mode,
  event,
  onOpenChange,
}: {
  open: boolean;
  mode: ExpectedEventDialogMode;
  event: ExpectedEvent | null;
  onOpenChange: (open: boolean) => void;
}) {
  const locale = useStore((s) => s.locale);
  const moneySetup = useStore((s) => s.moneySetup);
  const setMoneySetup = useStore((s) => s.setMoneySetup);
  const recurringTransactions = useStore((s) => s.recurringTransactions);
  const updateRecurring = useStore((s) => s.updateRecurring);
  const updateTransaction = useStore((s) => s.updateTransaction);
  const deleteTransaction = useStore((s) => s.deleteTransaction);
  const dismissPendingTransaction = useStore((s) => s.dismissPendingTransaction);
  const addExpectedEventHistory = useStore((s) => s.addExpectedEventHistory);
  const addExpectedEventReminder = useStore((s) => s.addExpectedEventReminder);
  const removeExpectedEventReminderByEventKey = useStore(
    (s) => s.removeExpectedEventReminderByEventKey,
  );
  const transactions = useTransactions();
  const { toast } = useToast();

  const [skipChoice, setSkipChoice] = useState<SkipChoice>("reschedule");
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [amountSuggestion, setAmountSuggestion] = useState<RecurringAmountSuggestion | null>(null);

  useEffect(() => {
    if (!open || !event) return;
    setSkipChoice("reschedule");
    setRescheduleDate(expectedEventDate(event));
  }, [event, open]);

  const pendingTransaction =
    event?.kind === "expense"
      ? transactions.find((item) => item.id === event.transactionId) ?? null
      : null;
  const recurringItem =
    pendingTransaction?.recurringId != null
      ? recurringTransactions.find((item) => item.id === pendingTransaction.recurringId) ?? null
      : null;
  const incomeSource =
    event?.kind === "income"
      ? listConfiguredIncomeSources(moneySetup, locale).find(
          (item) => item.id === event.incomeSourceId,
        ) ?? null
      : null;

  const incomeDraft = useMemo(
    () =>
      event?.kind === "income"
        ? buildIncomeDraft(event, getLocalTodayIsoDate(), locale)
        : null,
    [event, locale],
  );

  const confirmOpen = open && mode === "confirm" && event != null;
  const skipOpen = open && mode === "skip" && event != null;
  const isRescheduleMode = skipChoice === "reschedule";
  const isCancelMode = skipChoice === "cancel";

  function appendHistory(
    action:
      | "confirmed"
      | "rescheduled"
      | "snoozed_until_tomorrow"
      | "cancelled",
    options?: { resultingDate?: string | null; amount?: number | null },
  ) {
    if (!event) return;
    addExpectedEventHistory({
      id: `${expectedEventKey(event)}:${action}:${Date.now()}`,
      eventKey: expectedEventKey(event),
      kind: event.kind,
      title: event.title,
      originalDate: expectedEventDate(event),
      action,
      resultingDate: options?.resultingDate ?? null,
      amount: options?.amount ?? null,
      createdAt: new Date().toISOString(),
    });
  }

  function clearReminderState(targetEvent: ExpectedEvent) {
    const eventKey = expectedEventKey(targetEvent);
    removeExpectedEventReminderByEventKey(eventKey);
    setMoneySetup(clearExpectedEventReminderInSetup(moneySetup, eventKey));
  }

  function maybeSuggestRecurringAmountUpdate(actualAmount: number) {
    if (!event) return;
    if (event.kind === "income") {
      const expectedAmount = event.amount;
      if (
        incomeSource?.recurrence === "monthly" &&
        shouldSuggestRecurringAmountUpdate(expectedAmount, actualAmount)
      ) {
        setAmountSuggestion({
          kind: "income",
          sourceId: event.incomeSourceId,
          title: event.title,
          expectedAmount,
          actualAmount,
        });
      }
      return;
    }

    if (
      recurringItem &&
      shouldSuggestRecurringAmountUpdate(event.amount, actualAmount)
    ) {
      setAmountSuggestion({
        kind: "expense",
        recurringId: recurringItem.id,
        title: event.title,
        expectedAmount: event.amount,
        actualAmount,
      });
    }
  }

  function handleConfirmSaved(result: TransactionDialogSaveResult) {
    if (!event) return;

    clearReminderState(event);
    appendHistory("confirmed", { amount: result.amount, resultingDate: result.date });

    if (event.kind === "income") {
      toast(
        locale === "ru"
          ? `Доход подтверждён · +${formatMoney(result.amount, locale)} · Баланс обновлён`
          : `Income confirmed · +${formatMoney(result.amount, locale)} · Balance updated`,
        "success",
      );
    } else {
      toast(
        locale === "ru"
          ? `Платёж проведён · −${formatMoney(result.amount, locale)} · Прогноз пересчитан`
          : `Payment confirmed · -${formatMoney(result.amount, locale)} · Forecast refreshed`,
        "success",
      );
    }

    maybeSuggestRecurringAmountUpdate(result.amount);
  }

  function handleSnoozeUntilTomorrow() {
    if (!event) return;
    const remindOn = nextLocalIsoDate(getLocalTodayIsoDate());
    const eventKey = expectedEventKey(event);
    addExpectedEventReminder({
      id: `${eventKey}:tomorrow`,
      eventKey,
      kind: event.kind,
      title: event.title,
      amount: event.amount,
      originalDate: expectedEventDate(event),
      remindOn,
      createdAt: new Date().toISOString(),
    });
    setMoneySetup(setExpectedEventReminderInSetup(moneySetup, eventKey, remindOn));
    appendHistory("snoozed_until_tomorrow", { resultingDate: remindOn });
    toast(
      locale === "ru"
        ? `Напомним завтра\n${formatTransactionDate(remindOn, locale)}`
        : `We will remind you tomorrow\n${formatTransactionDate(remindOn, locale)}`,
      "success",
    );
    onOpenChange(false);
  }

  function applySkipChoice() {
    if (!event) return;

    if (skipChoice === "remind_tomorrow") {
      handleSnoozeUntilTomorrow();
      return;
    }

    if (event.kind === "income") {
      if (skipChoice === "reschedule" && rescheduleDate) {
        setMoneySetup(
          clearExpectedEventReminderInSetup(
            rescheduleIncomeSourceInSetup(
              moneySetup,
              event.incomeSourceId,
              rescheduleDate,
              locale,
            ),
            expectedEventKey(event),
          ),
        );
        removeExpectedEventReminderByEventKey(expectedEventKey(event));
        appendHistory("rescheduled", { resultingDate: rescheduleDate });
        toast(
          locale === "ru"
            ? `Доход перенесён\nНовое ожидание: ${formatTransactionDate(rescheduleDate, locale)}`
            : `Income moved\nNext expected date: ${formatTransactionDate(rescheduleDate, locale)}`,
          "success",
        );
      } else if (skipChoice === "cancel") {
        setMoneySetup(
          clearExpectedEventReminderInSetup(
            cancelIncomeOccurrenceInSetup(
              moneySetup,
              event.incomeSourceId,
              event.occurrenceDate,
              locale,
            ),
            expectedEventKey(event),
          ),
        );
        removeExpectedEventReminderByEventKey(expectedEventKey(event));
        appendHistory("cancelled");
        toast(
          locale === "ru" ? "Ожидание отменено" : "Expected event cancelled",
          "success",
        );
      }
      onOpenChange(false);
      return;
    }

    if (skipChoice === "reschedule" && rescheduleDate) {
      updateTransaction(event.transactionId, { date: rescheduleDate, confirmed: false });
      if (recurringItem) {
        updateRecurring(recurringItem.id, { nextRunDate: rescheduleDate });
      }
      clearReminderState(event);
      appendHistory("rescheduled", { resultingDate: rescheduleDate });
      toast(
        locale === "ru"
          ? `Платёж перенесён\nНовое ожидание: ${formatTransactionDate(rescheduleDate, locale)}`
          : `Payment moved\nNext expected date: ${formatTransactionDate(rescheduleDate, locale)}`,
        "success",
      );
      onOpenChange(false);
      return;
    }

    if (skipChoice === "cancel") {
      if (pendingTransaction?.recurringId) {
        dismissPendingTransaction(event.transactionId);
      } else {
        deleteTransaction(event.transactionId);
      }
      clearReminderState(event);
      appendHistory("cancelled");
      toast(
        locale === "ru" ? "Ожидание отменено" : "Expected event cancelled",
        "success",
      );
      onOpenChange(false);
    }
  }

  function applyRecurringAmountSuggestion() {
    if (!amountSuggestion) return;

    if (amountSuggestion.kind === "income") {
      const source = listConfiguredIncomeSources(moneySetup, locale).find(
        (item) => item.id === amountSuggestion.sourceId,
      );
      if (source) {
        setMoneySetup(
          upsertIncomeSourceInSetup(
            moneySetup,
            {
              ...source,
              expectedAmount: amountSuggestion.actualAmount,
            },
            locale,
          ),
        );
      }
    } else {
      updateRecurring(amountSuggestion.recurringId, { amount: amountSuggestion.actualAmount });
    }

    toast(
      locale === "ru" ? "Плановая сумма обновлена" : "Planned amount updated",
      "success",
    );
    setAmountSuggestion(null);
  }

  return (
    <>
      {event?.kind === "income" ? (
        <TransactionEditDialog
          transaction={null}
          draft={incomeDraft}
          open={confirmOpen}
          onOpenChange={onOpenChange}
          onRequestSourceEdit={null}
          fieldMode="expected_event"
          onDidSave={handleConfirmSaved}
        />
      ) : null}

      {event?.kind === "expense" && pendingTransaction ? (
        <TransactionEditDialog
          transaction={pendingTransaction}
          open={confirmOpen}
          onOpenChange={onOpenChange}
          dialogTitle={locale === "ru" ? "Подтвердить оплату" : "Confirm payment"}
          dialogSubtitle={formatTransactionDate(pendingTransaction.date, locale)}
          submitLabel={locale === "ru" ? "Сохранить" : "Save"}
          forceConfirmOnSave
          hideDelete
          fieldMode="expected_event"
          onDidSave={handleConfirmSaved}
        />
      ) : null}

      <Dialog open={skipOpen} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {event?.kind === "income"
                ? locale === "ru"
                  ? "Что сделать, если деньги ещё не пришли?"
                  : "What should happen if the income did not arrive?"
                : locale === "ru"
                  ? "Что сделать, если платёж ещё не оплачен?"
                  : "What should happen if the payment was not made?"}
            </DialogTitle>
          </DialogHeader>

          {event ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {event.kind === "income"
                  ? locale === "ru"
                    ? `Мы ждали «${event.title}» ${formatTransactionDate(event.occurrenceDate, locale)}.`
                    : `Expected "${event.title}" on ${formatTransactionDate(event.occurrenceDate, locale)}.`
                  : locale === "ru"
                    ? `Платёж «${event.title}» ожидался ${formatTransactionDate(event.date, locale)}.`
                    : `Expected payment "${event.title}" on ${formatTransactionDate(event.date, locale)}.`}
              </p>

              <div className="space-y-2">
                <Button
                  type="button"
                  variant={skipChoice === "reschedule" ? "default" : "outline"}
                  className="flex w-full items-center justify-start gap-2 text-left"
                  onClick={() => setSkipChoice("reschedule")}
                >
                  <MoveRight className="h-4 w-4 shrink-0" />
                  {locale === "ru" ? "Перенести" : "Reschedule"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex w-full items-center justify-start gap-2 text-left"
                  onClick={handleSnoozeUntilTomorrow}
                >
                  <Clock3 className="h-4 w-4 shrink-0" />
                  {locale === "ru" ? "Напомнить завтра" : "Remind me tomorrow"}
                </Button>
                <Button
                  type="button"
                  variant={skipChoice === "cancel" ? "default" : "outline"}
                  className="flex w-full items-center justify-start gap-2 text-left"
                  onClick={() => setSkipChoice("cancel")}
                >
                  <XCircle className="h-4 w-4 shrink-0" />
                  {locale === "ru" ? "Отменить" : "Cancel"}
                </Button>
              </div>

              {isRescheduleMode ? (
                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="expected-event-date">
                    {locale === "ru" ? "Новая дата" : "New date"}
                  </label>
                  <Input
                    id="expected-event-date"
                    type="date"
                    value={rescheduleDate}
                    onChange={(next) => setRescheduleDate(next.target.value)}
                  />
                </div>
              ) : null}

              {isCancelMode ? (
                <div className="space-y-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-3">
                  <p className="text-sm font-medium">
                    {locale === "ru" ? "Отменить событие?" : "Cancel this event?"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {locale === "ru"
                      ? "Оно больше не будет учитываться в прогнозе."
                      : "It will no longer be included in the forecast."}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => onOpenChange(false)}
                    >
                      {locale === "ru" ? "Отмена" : "Keep event"}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      className="flex-1"
                      onClick={applySkipChoice}
                    >
                      {locale === "ru" ? "Отменить событие" : "Cancel event"}
                    </Button>
                  </div>
                </div>
              ) : null}

              {isRescheduleMode ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => onOpenChange(false)}
                  >
                    {locale === "ru" ? "Назад" : "Back"}
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={applySkipChoice}
                    disabled={!rescheduleDate}
                  >
                    {locale === "ru" ? "Сохранить перенос" : "Save reschedule"}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={amountSuggestion != null} onOpenChange={(nextOpen) => {
        if (!nextOpen) setAmountSuggestion(null);
      }}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {locale === "ru"
                ? "Обновить регулярную сумму?"
                : "Update the recurring amount?"}
            </DialogTitle>
          </DialogHeader>
          {amountSuggestion ? (
            <div className="space-y-4">
              <div className="space-y-2 rounded-xl border bg-muted/30 p-3 text-sm">
                <p className="font-medium">{amountSuggestion.title}</p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {locale === "ru" ? "Ожидалось" : "Expected"}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatMoney(amountSuggestion.expectedAmount, locale)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {locale === "ru"
                      ? amountSuggestion.kind === "income"
                        ? "Получено"
                        : "Оплачено"
                      : amountSuggestion.kind === "income"
                        ? "Received"
                        : "Paid"}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatMoney(amountSuggestion.actualAmount, locale)}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" onClick={applyRecurringAmountSuggestion}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {locale === "ru" ? "Да" : "Yes"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setAmountSuggestion(null)}>
                  <Circle className="mr-2 h-4 w-4" />
                  {locale === "ru" ? "Нет" : "No"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  cancelIncomeOccurrenceInSetup,
  clearExpectedEventReminderInSetup,
  isExpectedEventVisibleToday,
  rescheduleIncomeSourceInSetup,
  setExpectedEventReminderInSetup,
  shouldSuggestRecurringAmountUpdate,
} from "@/lib/expected-events";
import { emptyMoneySetup, resolveMoneySetupIncomeSources } from "@/lib/money-setup";

test("rescheduling legacy income source materializes it into incomeSources and updates primary date", () => {
  const setup = {
    ...emptyMoneySetup(),
    nextIncomeDate: "2026-07-14",
    expectedIncomeAmount: 24000,
  };

  const next = rescheduleIncomeSourceInSetup(setup, "legacy-primary-income", "2026-07-20", "ru");

  assert.equal(next.incomeSources.length, 1);
  assert.equal(next.incomeSources[0]?.expectedDate, "2026-07-20");
  assert.equal(next.nextIncomeDate, "2026-07-20");
  assert.equal(next.expectedIncomeAmount, 24000);
});

test("canceling one-off income removes the expectation completely", () => {
  const setup = {
    ...emptyMoneySetup(),
    incomeSources: [
      {
        id: "freelance-july",
        label: "Фриланс",
        expectedDate: "2026-07-20",
        expectedAmount: 12000,
        kind: "freelance" as const,
        recurrence: "once" as const,
        intervalMonths: 1,
        dayOfMonth: 20,
        endDate: null,
        isPrimary: true,
      },
    ],
  };

  const next = cancelIncomeOccurrenceInSetup(setup, "freelance-july", "2026-07-20", "ru");

  assert.equal(next.incomeSources.length, 0);
  assert.equal(next.nextIncomeDate, null);
  assert.equal(next.expectedIncomeAmount, null);
});

test("canceling recurring income skips the current occurrence and advances to the next one", () => {
  const setup = {
    ...emptyMoneySetup(),
    incomeSources: [
      {
        id: "salary-main",
        label: "Зарплата",
        expectedDate: "2026-07-14",
        expectedAmount: 24000,
        kind: "salary" as const,
        recurrence: "monthly" as const,
        intervalMonths: 1,
        dayOfMonth: 14,
        endDate: null,
        isPrimary: true,
      },
    ],
  };

  const next = cancelIncomeOccurrenceInSetup(setup, "salary-main", "2026-07-14", "ru");

  assert.equal(next.incomeSources[0]?.expectedDate, "2026-08-14");
  assert.equal(next.nextIncomeDate, "2026-08-14");
});

test("rescheduling recurring income closes the overdue occurrence and keeps the original monthly cadence", () => {
  const setup = {
    ...emptyMoneySetup(),
    incomeSources: [
      {
        id: "salary-main",
        label: "Зарплата",
        expectedDate: "2026-07-06",
        expectedAmount: 50000,
        kind: "salary" as const,
        recurrence: "monthly" as const,
        intervalMonths: 1,
        dayOfMonth: 6,
        endDate: null,
        isPrimary: true,
      },
    ],
  };

  const next = rescheduleIncomeSourceInSetup(setup, "salary-main", "2026-07-16", "ru");
  const resolved = resolveMoneySetupIncomeSources({
    moneySetup: next,
    confirmedTransactions: [],
    today: "2026-07-10",
    forecastHorizonMonths: 3,
    locale: "ru",
  });

  assert.deepEqual(
    resolved.map((source) => [source.occurrenceDate, source.status]),
    [
      ["2026-07-16", "scheduled"],
      ["2026-08-06", "scheduled"],
      ["2026-09-06", "scheduled"],
      ["2026-10-06", "scheduled"],
    ],
  );
  assert.equal(
    resolved.some((source) => source.occurrenceDate === "2026-07-06"),
    false,
  );
});

test("recurring amount suggestion appears only when the actual amount differs by more than ten percent", () => {
  assert.equal(shouldSuggestRecurringAmountUpdate(24000, 26000), false);
  assert.equal(shouldSuggestRecurringAmountUpdate(24000, 27000), true);
  assert.equal(shouldSuggestRecurringAmountUpdate(10000, 8800), true);
});

test("snoozing an expected event stores one stable reminder entry and hides it only until the requested day", () => {
  const setup = setExpectedEventReminderInSetup(
    emptyMoneySetup(),
    "income:salary-main:2026-07-06",
    "2026-07-16",
  );
  const updated = setExpectedEventReminderInSetup(
    setup,
    "income:salary-main:2026-07-06",
    "2026-07-17",
  );

  assert.deepEqual(updated.expectedEventReminderStates, [
    {
      eventKey: "income:salary-main:2026-07-06",
      remindOn: "2026-07-17",
    },
  ]);
  assert.equal(
    isExpectedEventVisibleToday(
      "income:salary-main:2026-07-06",
      updated.expectedEventReminderStates,
      "2026-07-16",
    ),
    false,
  );
  assert.equal(
    isExpectedEventVisibleToday(
      "income:salary-main:2026-07-06",
      updated.expectedEventReminderStates,
      "2026-07-17",
    ),
    true,
  );
  assert.deepEqual(
    clearExpectedEventReminderInSetup(
      updated,
      "income:salary-main:2026-07-06",
    ).expectedEventReminderStates,
    [],
  );
});

test("expected event dialog uses human labels and keeps the confirmation form restricted", () => {
  const dialogSource = fs.readFileSync(
    path.join(process.cwd(), "src/components/ExpectedEventActionDialog.tsx"),
    "utf8",
  );
  const todaySource = fs.readFileSync(
    path.join(process.cwd(), "src/components/TodayScreen.tsx"),
    "utf8",
  );
  const recurringSource = fs.readFileSync(
    path.join(process.cwd(), "src/components/PendingRecurringCard.tsx"),
    "utf8",
  );
  const txDialogSource = fs.readFileSync(
    path.join(process.cwd(), "src/components/TransactionEditDialog.tsx"),
    "utf8",
  );

  assert.match(todaySource, /Оплатил/);
  assert.match(recurringSource, /Не оплатил/);
  assert.match(dialogSource, /Напомнить завтра/);
  assert.match(dialogSource, /onClick=\{handleSnoozeUntilTomorrow\}/);
  assert.match(dialogSource, /Сохранить перенос/);
  assert.match(dialogSource, /Отменить событие\?/);
  assert.match(dialogSource, /Оно больше не будет учитываться в прогнозе\./);
  assert.match(dialogSource, /Обновить регулярную сумму/);
  assert.match(dialogSource, /Доход перенесён\\nНовое ожидание/);
  assert.match(dialogSource, /Платёж перенесён\\nНовое ожидание/);
  assert.doesNotMatch(dialogSource, /onClick=\{\(\) => setSkipChoice\("remind_tomorrow"\)\}/);
  assert.doesNotMatch(dialogSource, /Готово/);
  assert.match(txDialogSource, /fieldMode\?: "full" \| "expected_event"/);
  assert.match(txDialogSource, /!expectedEventMode \? \(/);
});

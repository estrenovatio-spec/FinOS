import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  cancelIncomeOccurrenceInSetup,
  rescheduleIncomeSourceInSetup,
  shouldSuggestRecurringAmountUpdate,
} from "@/lib/expected-events";
import { emptyMoneySetup } from "@/lib/money-setup";

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

test("recurring amount suggestion appears only when the actual amount differs by more than ten percent", () => {
  assert.equal(shouldSuggestRecurringAmountUpdate(24000, 26000), false);
  assert.equal(shouldSuggestRecurringAmountUpdate(24000, 27000), true);
  assert.equal(shouldSuggestRecurringAmountUpdate(10000, 8800), true);
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
  assert.match(dialogSource, /Обновить регулярную сумму/);
  assert.match(txDialogSource, /fieldMode\?: "full" \| "expected_event"/);
  assert.match(txDialogSource, /!expectedEventMode \? \(/);
});

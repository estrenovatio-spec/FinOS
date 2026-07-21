import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  cancelIncomeOccurrenceInSetup,
  clearExpectedEventReminderInSetup,
  expectedExpenseStatusLabel,
  isExpectedEventVisibleToday,
  resolveExpectedEventDisplayStatus,
  rescheduleIncomeSourceInSetup,
  setExpectedEventReminderInSetup,
  shouldSuggestRecurringAmountUpdate,
} from "@/lib/expected-events";
import {
  buildMatcherState,
  matchInputToExpectedPayments,
} from "@/lib/expected-payment-matcher";
import { emptyMoneySetup, resolveMoneySetupIncomeSources } from "@/lib/money-setup";
import { getDefaultCategories } from "@/lib/categories";
import type { Transaction } from "@/types";
import type { DebtItem, RecurringTransaction } from "@/types/planning";

function tx(
  partial: Partial<Transaction> &
    Pick<Transaction, "id" | "amount" | "type" | "categoryId" | "date">,
): Transaction {
  return {
    id: partial.id,
    amount: partial.amount,
    type: partial.type,
    categoryId: partial.categoryId,
    currency: "RUB",
    note: partial.note ?? "",
    date: partial.date,
    owner: partial.owner ?? "me",
    confirmed: partial.confirmed,
    goalId: null,
    goalAmount: null,
    recurringId: partial.recurringId ?? null,
    odometerKm: null,
    fuelLiters: null,
    vehicleId: null,
    transferPairId: null,
    businessTxId: null,
  };
}

function recurring(
  partial: Partial<RecurringTransaction> &
    Pick<
      RecurringTransaction,
      "id" | "amount" | "type" | "categoryId" | "nextRunDate" | "frequency"
    >,
): RecurringTransaction {
  return {
    id: partial.id,
    amount: partial.amount,
    type: partial.type,
    categoryId: partial.categoryId,
    note: partial.note ?? "",
    skippedDates: partial.skippedDates ?? [],
    owner: partial.owner ?? "me",
    frequency: partial.frequency,
    intervalMonths: partial.intervalMonths ?? 1,
    dayOfMonth: partial.dayOfMonth ?? 20,
    nextRunDate: partial.nextRunDate,
    endDate: partial.endDate ?? null,
    enabled: partial.enabled ?? true,
    updatedAt: partial.updatedAt,
  };
}

function debt(
  partial: Partial<DebtItem> &
    Pick<DebtItem, "id" | "name" | "balance" | "minPayment">,
): DebtItem {
  return {
    id: partial.id,
    name: partial.name,
    owner: partial.owner ?? "me",
    balance: partial.balance,
    minPayment: partial.minPayment,
    ratePct: partial.ratePct ?? null,
    nextPaymentDate: partial.nextPaymentDate ?? null,
    strategy: partial.strategy ?? "avalanche",
    priority: partial.priority ?? "normal",
    updatedAt: partial.updatedAt,
  };
}

function matcherState(args?: {
  today?: string;
  transactions?: Transaction[];
  recurringTransactions?: RecurringTransaction[];
  debts?: DebtItem[];
}) {
  return buildMatcherState({
    locale: "ru",
    today: args?.today ?? "2026-07-20",
    forecastHorizonMonths: 3,
    categories: getDefaultCategories(),
    transactions: args?.transactions ?? [],
    householdFilter: "me",
    recurringTransactions: args?.recurringTransactions ?? [],
    debts: args?.debts ?? [],
    moneySetup: {
      ...emptyMoneySetup(),
      hasNoRequiredFixedExpenses: true,
    },
    categoryBudgets: [],
    budgetMonthStartDay: 1,
    balances: { all: 50000, me: 50000, partner: 0 },
  });
}

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

test("expected expense status explains when a payment was moved to a new date", () => {
  const label = expectedExpenseStatusLabel({
    event: {
      date: "2026-07-18",
      debtId: null,
      paymentSource: "recurring",
      linkedEntityId: "mortgage-recurring",
    },
    history: [
      {
        id: "history-1",
        eventKey: "expense:mortgage-july:2026-07-17",
        kind: "expense",
        title: "Ипотека",
        originalDate: "2026-07-17",
        action: "rescheduled",
        resultingDate: "2026-07-18",
        paymentSource: "recurring",
        linkedEntityId: "mortgage-recurring",
        debtId: null,
        createdAt: "2026-07-17T09:00:00.000Z",
      },
    ],
    today: "2026-07-18",
    locale: "ru",
  });

  assert.equal(label, "Перенесено с 17.07.2026 на 18.07.2026");
});

test("expected expense status uses recurring occurrence date as the canonical original date", () => {
  const label = expectedExpenseStatusLabel({
    event: {
      date: "2026-07-18",
      recurringOccurrenceDate: "2026-07-17",
      debtId: null,
      paymentSource: "recurring",
      linkedEntityId: "mortgage-recurring",
    },
    history: [],
    today: "2026-07-18",
    locale: "ru",
  });

  assert.equal(label, "Перенесено с 17.07.2026 на 18.07.2026");
});

test("Today, Forecast Calendar, and Focused Forecast Card use the same expected-event status helper", () => {
  const status = resolveExpectedEventDisplayStatus({
    kind: "expense",
    event: {
      date: "2026-07-18",
      debtId: null,
      paymentSource: "recurring",
      linkedEntityId: "mortgage-recurring",
    },
    history: [
      {
        id: "history-1",
        eventKey: "expense:mortgage-july:2026-07-17",
        kind: "expense",
        title: "Ипотека",
        originalDate: "2026-07-17",
        action: "rescheduled",
        resultingDate: "2026-07-18",
        paymentSource: "recurring",
        linkedEntityId: "mortgage-recurring",
        debtId: null,
        createdAt: "2026-07-17T09:00:00.000Z",
      },
    ],
    today: "2026-07-18",
    locale: "ru",
  });

  assert.equal(status.label, "Перенесено с 17.07.2026 на 18.07.2026");

  const todaySource = fs.readFileSync(
    path.join(process.cwd(), "src/components/TodayScreen.tsx"),
    "utf8",
  );
  const calendarSource = fs.readFileSync(
    path.join(process.cwd(), "src/components/app/ForecastCalendarView.tsx"),
    "utf8",
  );
  const focusedSource = fs.readFileSync(
    path.join(process.cwd(), "src/components/app/FocusedForecastCard.tsx"),
    "utf8",
  );

  assert.match(todaySource, /resolveExpectedEventDisplayStatus\(/);
  assert.match(calendarSource, /resolveExpectedEventDisplayStatus\(/);
  assert.match(focusedSource, /resolveExpectedEventDisplayStatus\(/);
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

  assert.match(todaySource, /Оплатить/);
  assert.match(recurringSource, /Не оплатил/);
  assert.match(recurringSource, /Оплатить/);
  assert.match(dialogSource, /Напомнить завтра/);
  assert.match(dialogSource, /Подтвердить оплату\?/);
  assert.match(dialogSource, /Что сделать, если деньги ещё не пришли/);
  assert.match(dialogSource, /Что сделать, если платёж ещё не оплачен/);
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

test("matcher finds a debt payment by amount and normalized title", () => {
  const match = matchInputToExpectedPayments({
    state: matcherState({
      debts: [
        debt({
          id: "bankrot-ksyu",
          name: "банкрот ксю",
          balance: 17850,
          minPayment: 17850,
          nextPaymentDate: "2026-07-20",
        }),
      ],
    }),
    input: "17850 банкрот ксю",
    parsed: {
      amount: 17850,
      type: "expense",
      categoryId: "banking",
      currency: "RUB",
      note: "банкрот ксю",
      date: "2026-07-20",
    },
    today: "2026-07-20",
  });

  assert.equal(match.kind, "single");
  if (match.kind !== "single") return;
  assert.equal(match.candidate.debtId, "bankrot-ksyu");
});

test("matcher resolves partial title overlap for ЖКХ water payment", () => {
  const match = matchInputToExpectedPayments({
    state: matcherState({
      debts: [
        debt({
          id: "water-debt",
          name: "ЖКХ вода трудовая",
          balance: 5000,
          minPayment: 5000,
          nextPaymentDate: "2026-07-20",
        }),
      ],
    }),
    input: "5000 жкх вода",
    parsed: {
      amount: 5000,
      type: "expense",
      categoryId: "banking",
      currency: "RUB",
      note: "жкх вода",
      date: "2026-07-20",
    },
    today: "2026-07-20",
  });

  assert.equal(match.kind, "single");
  if (match.kind !== "single") return;
  assert.equal(match.candidate.debtId, "water-debt");
});

test("matcher can find a single expected payment even when the user entered no amount", () => {
  const match = matchInputToExpectedPayments({
    state: matcherState({
      transactions: [
        tx({
          id: "mortgage-pending",
          amount: 5000,
          type: "expense",
          categoryId: "home_housing",
          date: "2026-07-20",
          note: "Ипотека",
          confirmed: false,
          recurringId: "mortgage-recurring",
        }),
      ],
      recurringTransactions: [
        recurring({
          id: "mortgage-recurring",
          amount: 5000,
          type: "expense",
          categoryId: "home_housing",
          nextRunDate: "2026-07-20",
          frequency: "monthly",
          note: "Ипотека",
        }),
      ],
    }),
    input: "оплатил ипотеку",
    parsed: null,
    today: "2026-07-20",
  });

  assert.equal(match.kind, "single");
  if (match.kind !== "single") return;
  assert.equal(match.candidate.transactionId, "mortgage-pending");
});

test("matcher offers multiple candidates when the phrase is ambiguous", () => {
  const match = matchInputToExpectedPayments({
    state: matcherState({
      debts: [
        debt({
          id: "water-a",
          name: "ЖКХ вода трудовая",
          balance: 5000,
          minPayment: 5000,
          nextPaymentDate: "2026-07-20",
        }),
        debt({
          id: "water-b",
          name: "ЖКХ вода дмитров",
          balance: 5000,
          minPayment: 5000,
          nextPaymentDate: "2026-07-20",
        }),
      ],
    }),
    input: "5000 жкх вода",
    parsed: {
      amount: 5000,
      type: "expense",
      categoryId: "banking",
      currency: "RUB",
      note: "жкх вода",
      date: "2026-07-20",
    },
    today: "2026-07-20",
  });

  assert.equal(match.kind, "multiple");
  if (match.kind !== "multiple") return;
  assert.equal(match.candidates.length, 2);
});

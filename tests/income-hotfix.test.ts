import assert from "node:assert/strict";
import test from "node:test";
import {
  buildIncomeSetupSavePayload,
  startIncomeSourcesEditing,
  type IncomeSourceDraft,
} from "@/components/today/income-sources-helpers";
import { decisionCoreSnapshot } from "@/lib/decision-core";
import { getDefaultCategories } from "@/lib/categories";
import { emptyMoneySetup } from "@/lib/money-setup";
import type { DecisionCoreState } from "@/lib/decision-core/types";

function buildState(overrides?: Partial<DecisionCoreState>): DecisionCoreState {
  return {
    locale: "ru",
    today: "2026-07-12",
    categories: getDefaultCategories(),
    transactions: [],
    householdFilter: "all",
    recurringTransactions: [],
    debts: [],
    moneySetup: emptyMoneySetup(),
    categoryBudgets: [],
    budgetMonthStartDay: 1,
    balances: { all: 50000, me: 50000, partner: 0 },
    ...overrides,
    forecastHorizonMonths: overrides?.forecastHorizonMonths ?? 3,
  };
}

test("adding another income from a legacy single income keeps the first one and adds a blank second slot", () => {
  const setup = {
    ...emptyMoneySetup(),
    nextIncomeDate: "2026-07-25",
    expectedIncomeAmount: 120000,
  };

  const drafts = startIncomeSourcesEditing({
    moneySetup: setup,
    currentDrafts: [],
    locale: "ru",
    appendBlank: true,
  });

  assert.equal(drafts.length, 2);
  assert.equal(drafts[0]?.label, "Основной доход");
  assert.equal(drafts[0]?.expectedDate, "2026-07-25");
  assert.equal(drafts[0]?.expectedAmount, "120000");
  assert.equal(drafts[1]?.label, "");
});

test("adding income from an empty state creates only one new editable source", () => {
  const drafts = startIncomeSourcesEditing({
    moneySetup: emptyMoneySetup(),
    currentDrafts: [],
    locale: "ru",
    appendBlank: true,
  });

  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]?.isPrimary, true);
  assert.ok(drafts[0]?.id);
});

test("existing sources stay in place when a new one is added", () => {
  const existing: IncomeSourceDraft[] = [
    {
      id: "salary-1",
      label: "Зарплата",
      expectedDate: "2026-07-25",
      expectedAmount: "120000",
      kind: "salary",
      recurrence: "once",
      intervalMonths: null,
      dayOfMonth: null,
      endDate: "",
      isPrimary: true,
    },
  ];

  const drafts = startIncomeSourcesEditing({
    moneySetup: emptyMoneySetup(),
    currentDrafts: existing,
    locale: "ru",
    appendBlank: true,
  });

  assert.equal(drafts.length, 2);
  assert.equal(drafts[0]?.id, "salary-1");
  assert.equal(drafts[1]?.label, "");
  assert.notEqual(drafts[0]?.id, drafts[1]?.id);
});

test("saving multiple income sources does not overwrite the first one", () => {
  const payload = buildIncomeSetupSavePayload({
    showIncomeSources: true,
    nextIncomeDate: "2026-07-25",
    expectedIncomeAmount: "120000",
    incomeSources: [
      {
        id: "salary-1",
        label: "Зарплата",
        expectedDate: "2026-07-25",
        expectedAmount: "120000",
        kind: "salary",
        recurrence: "once",
        intervalMonths: null,
        dayOfMonth: null,
        endDate: "",
        isPrimary: true,
      },
      {
        id: "passive-1",
        label: "Пассивный доход",
        expectedDate: "2026-07-18",
        expectedAmount: "40000",
        kind: "passive",
        recurrence: "once",
        intervalMonths: null,
        dayOfMonth: null,
        endDate: "",
        isPrimary: false,
      },
    ],
  });

  assert.equal(payload.incomeSources.length, 2);
  assert.equal(payload.incomeSources[0]?.id, "salary-1");
  assert.equal(payload.incomeSources[1]?.id, "passive-1");
  assert.equal(payload.nextIncomeDate, "2026-07-25");
  assert.equal(payload.expectedIncomeAmount, 120000);
});

test("saving income sources preserves hidden recurrence fields for cloud persistence", () => {
  const payload = buildIncomeSetupSavePayload({
    showIncomeSources: true,
    nextIncomeDate: "2026-07-25",
    expectedIncomeAmount: "120000",
    incomeSources: [
      {
        id: "salary-1",
        label: "Зарплата",
        expectedDate: "2026-07-25",
        expectedAmount: "120000",
        kind: "salary",
        recurrence: "monthly",
        intervalMonths: 2,
        dayOfMonth: 25,
        endDate: "2026-11-25",
        isPrimary: true,
      },
    ],
  });

  assert.equal(payload.incomeSources[0]?.intervalMonths, 2);
  assert.equal(payload.incomeSources[0]?.dayOfMonth, 25);
  assert.equal(payload.incomeSources[0]?.endDate, "2026-11-25");
});

test("switching an income source to one-time clears monthly-only schedule fields", () => {
  const payload = buildIncomeSetupSavePayload({
    showIncomeSources: true,
    nextIncomeDate: "2026-07-25",
    expectedIncomeAmount: "120000",
    incomeSources: [
      {
        id: "salary-1",
        label: "Зарплата",
        expectedDate: "2026-07-25",
        expectedAmount: "120000",
        kind: "salary",
        recurrence: "once",
        intervalMonths: 3,
        dayOfMonth: 25,
        endDate: "2026-11-25",
        isPrimary: true,
      },
    ],
  });

  assert.equal(payload.incomeSources[0]?.recurrence, "once");
  assert.equal(payload.incomeSources[0]?.intervalMonths, null);
  assert.equal(payload.incomeSources[0]?.dayOfMonth, null);
  assert.equal(payload.incomeSources[0]?.endDate, null);
});

test("cancel-like empty draft is not persisted as a regular income source", () => {
  const payload = buildIncomeSetupSavePayload({
    showIncomeSources: true,
    nextIncomeDate: "",
    expectedIncomeAmount: "",
    incomeSources: [
      {
        id: "draft-income",
        label: "",
        expectedDate: "",
        expectedAmount: "",
        kind: "salary",
        recurrence: "once",
        intervalMonths: null,
        dayOfMonth: null,
        endDate: "",
        isPrimary: true,
      },
    ],
  });

  assert.equal(payload.incomeSources[0]?.id, "draft-income");
  assert.equal(payload.incomeSources[0]?.label, "");
  assert.equal(payload.expectedIncomeAmount, null);
  assert.equal(payload.nextIncomeDate, null);
});

test("forecast line accounts for multiple income sources", () => {
  const snapshot = decisionCoreSnapshot(
    buildState({
      moneySetup: {
        ...emptyMoneySetup(),
        incomeSources: [
          {
            id: "salary-1",
            label: "Зарплата",
            expectedDate: "2026-07-25",
            expectedAmount: 120000,
            kind: "salary",
            recurrence: "once",
            isPrimary: true,
          },
          {
            id: "passive-1",
            label: "Пассивный доход",
            expectedDate: "2026-07-18",
            expectedAmount: 40000,
            kind: "passive",
            recurrence: "once",
          },
        ],
      },
    }),
  );

  const incomeEvents = snapshot.forecast.events.filter(
    (event) => event.source === "income_source",
  );

  assert.equal(incomeEvents.length, 2);
  assert.deepEqual(
    incomeEvents.map((event) => [event.date, event.amount]),
    [
      ["2026-07-18", 40000],
      ["2026-07-25", 120000],
    ],
  );
});

test("same-day incomes stay separate without losing total amount", () => {
  const snapshot = decisionCoreSnapshot(
    buildState({
      moneySetup: {
        ...emptyMoneySetup(),
        incomeSources: [
          {
            id: "salary-1",
            label: "Зарплата",
            expectedDate: "2026-07-25",
            expectedAmount: 120000,
            kind: "salary",
            recurrence: "once",
            isPrimary: true,
          },
          {
            id: "passive-1",
            label: "Пассивный доход",
            expectedDate: "2026-07-25",
            expectedAmount: 40000,
            kind: "passive",
            recurrence: "once",
          },
        ],
      },
    }),
  );

  const incomeEvents = snapshot.forecast.events.filter(
    (event) => event.source === "income_source",
  );

  assert.equal(incomeEvents.length, 2);
  assert.equal(
    incomeEvents.reduce((sum, event) => sum + event.amount, 0),
    160000,
  );
});

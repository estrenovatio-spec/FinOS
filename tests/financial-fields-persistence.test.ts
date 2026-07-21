import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { applyHouseholdSync } from "@/lib/cloud/apply-sync";
import { getDefaultCategories } from "@/lib/categories";
import { decisionCoreSnapshot } from "@/lib/decision-core";
import type { DecisionCoreState } from "@/lib/decision-core/types";
import { calculatePlannedFreeMoneyUntilPeriodEnd } from "@/lib/free-money";
import type { HouseholdPublic, SyncPayload } from "@/lib/household/types";
import {
  emptyMoneySetup,
  normalizeMoneySetup,
  validateMoneySetup,
  type MoneySetup,
} from "@/lib/money-setup";
import { useCloudStore } from "@/store/useCloudStore";
import { useStore } from "@/store/useStore";

const household: HouseholdPublic = {
  id: "household-1",
  name: "Мои финансы",
  mode: "solo",
  inviteCode: "ABC123",
  partnerLabel: null,
  memberCount: 1,
};

function makeMoneySetup(overrides: Partial<MoneySetup>): MoneySetup {
  return {
    ...emptyMoneySetup(),
    useHouseholdBalance: false,
    ...overrides,
  };
}

function makeSyncPayload(overrides: Partial<SyncPayload>): SyncPayload {
  return {
    household,
    memberUserIds: ["user-1"],
    viewerUserId: "user-1",
    transactions: [],
    categories: getDefaultCategories(),
    savingsGoals: [],
    categoryBudgets: [],
    recurringTransactions: [],
    debts: [],
    moneySetup: emptyMoneySetup(),
    ...overrides,
  };
}

function buildDecisionState(overrides?: Partial<DecisionCoreState>): DecisionCoreState {
  return {
    locale: "ru",
    today: "2026-07-16",
    categories: getDefaultCategories(),
    transactions: [],
    householdFilter: "all",
    recurringTransactions: [],
    debts: [],
    moneySetup: emptyMoneySetup(),
    categoryBudgets: [],
    budgetMonthStartDay: 1,
    balances: { all: 50000, me: 50000, partner: 0 },
    forecastHorizonMonths: 3,
    ...overrides,
  };
}

function resetCloudStores(): {
  previousStore: ReturnType<typeof useStore.getState>;
  previousCloud: ReturnType<typeof useCloudStore.getState>;
} {
  const previousStore = useStore.getState();
  const previousCloud = useCloudStore.getState();

  useStore.setState({
    ...previousStore,
    transactions: [],
    categories: getDefaultCategories(),
    savingsGoals: [],
    categoryBudgets: [],
    recurringTransactions: [],
    debts: [],
    moneySetup: emptyMoneySetup(),
    cashOffsetMe: 0,
    cashOffsetPartner: 0,
  });

  useCloudStore.setState({
    ...previousCloud,
    token: "token-1",
    household,
    cloudUserId: "user-1",
    householdMemberUserIds: ["user-1"],
    lastSyncedAt: "2026-07-16T10:00:00.000Z",
    deletedRecurringIds: [],
    deletedDebtIds: [],
    deletedTransactionIds: [],
    pendingTransactionUpdateIds: {},
    pendingGoalIds: [],
    lastSyncedRemoteTxIds: [],
    lastSyncedRemoteCategoryIds: [],
    lastSyncedRemoteGoalIds: [],
    lastSyncedRemoteBudgetCategoryIds: [],
    lastSyncedRemoteRecurringIds: [],
    lastSyncedRemoteDebtIds: [],
  });

  return { previousStore, previousCloud };
}

function restoreCloudStores(snapshot: {
  previousStore: ReturnType<typeof useStore.getState>;
  previousCloud: ReturnType<typeof useCloudStore.getState>;
}) {
  useStore.setState(snapshot.previousStore);
  useCloudStore.setState(snapshot.previousCloud);
}

test("money setup normalization keeps income recurrence and end date fields through reload", () => {
  const normalized = normalizeMoneySetup({
    nextIncomeDate: "2026-07-25",
    expectedIncomeAmount: 120000,
    incomeSources: [
      {
        id: "salary-main",
        label: "Зарплата",
        expectedDate: "2026-07-25",
        expectedAmount: 120000,
        kind: "salary",
        recurrence: "monthly",
        intervalMonths: 2,
        dayOfMonth: 25,
        endDate: "2026-11-25",
        isPrimary: true,
      },
    ],
    useHouseholdBalance: false,
    requiredRecurringIds: [],
    hasNoRequiredFixedExpenses: false,
    essentialCategoryIds: [],
    expectedEventReminderStates: [],
    updatedAt: "2026-07-16T10:00:00.000Z",
  });

  assert.equal(normalized.incomeSources[0]?.recurrence, "monthly");
  assert.equal(normalized.incomeSources[0]?.intervalMonths, 2);
  assert.equal(normalized.incomeSources[0]?.dayOfMonth, 25);
  assert.equal(normalized.incomeSources[0]?.endDate, "2026-11-25");
});

test("money setup normalization clears incompatible monthly fields for one-time income", () => {
  const normalized = normalizeMoneySetup({
    incomeSources: [
      {
        id: "salary-main",
        label: "Зарплата",
        expectedDate: "2026-07-25",
        expectedAmount: 120000,
        kind: "salary",
        recurrence: "once",
        intervalMonths: 3,
        dayOfMonth: 25,
        endDate: "2026-11-25",
        isPrimary: true,
      },
    ],
  });

  assert.equal(normalized.incomeSources[0]?.recurrence, "once");
  assert.equal(normalized.incomeSources[0]?.intervalMonths, null);
  assert.equal(normalized.incomeSources[0]?.dayOfMonth, null);
  assert.equal(normalized.incomeSources[0]?.endDate, null);
});

test("money setup validation rejects income endDate earlier than expectedDate", () => {
  const issues = validateMoneySetup(
    normalizeMoneySetup({
      incomeSources: [
        {
          id: "salary-main",
          label: "Зарплата",
          expectedDate: "2026-07-25",
          expectedAmount: 120000,
          kind: "salary",
          recurrence: "monthly",
          intervalMonths: 1,
          dayOfMonth: 25,
          endDate: "2026-07-20",
          isPrimary: true,
        },
      ],
    }),
  );

  assert.deepEqual(issues, [
    {
      path: "incomeSources.0.endDate",
      code: "end_date_before_expected_date",
    },
  ]);
});

test("money setup route schema accepts forecast-driving income source fields", () => {
  const source = readFileSync(
    new URL("../src/app/api/household/money-setup/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /recurrence: z\.enum\(\["once", "monthly"\]\)\.optional\(\)/);
  assert.match(source, /intervalMonths: z\.number\(\)\.int\(\)\.min\(1\)\.max\(60\)\.nullable\(\)\.optional\(\)/);
  assert.match(source, /dayOfMonth: z\.number\(\)\.int\(\)\.min\(1\)\.max\(31\)\.nullable\(\)\.optional\(\)/);
  assert.match(source, /endDate: z\.string\(\)\.nullable\(\)\.optional\(\)/);
});

test("applyHouseholdSync preserves income source fields after cloud sync and re-login hydrate", () => {
  const snapshot = resetCloudStores();

  applyHouseholdSync(
    makeSyncPayload({
      moneySetup: makeMoneySetup({
        incomeSources: [
          {
            id: "salary-main",
            label: "Зарплата",
            expectedDate: "2026-07-25",
            expectedAmount: 120000,
            kind: "salary",
            recurrence: "monthly",
            intervalMonths: 2,
            dayOfMonth: 25,
            endDate: "2026-11-25",
            isPrimary: true,
          },
        ],
        updatedAt: "2026-07-16T10:00:00.000Z",
      }),
    }),
    "token-1",
    { replace: true },
  );

  const income = useStore.getState().moneySetup.incomeSources[0];
  assert.equal(income?.expectedAmount, 120000);
  assert.equal(income?.expectedDate, "2026-07-25");
  assert.equal(income?.recurrence, "monthly");
  assert.equal(income?.intervalMonths, 2);
  assert.equal(income?.dayOfMonth, 25);
  assert.equal(income?.endDate, "2026-11-25");

  restoreCloudStores(snapshot);
});

test("clearing income endDate survives reload and stale cloud hydrate", () => {
  const snapshot = resetCloudStores();

  useStore.setState({
    ...useStore.getState(),
    moneySetup: makeMoneySetup({
      incomeSources: [
        {
          id: "salary-main",
          label: "Зарплата",
          expectedDate: "2026-07-25",
          expectedAmount: 120000,
          kind: "salary",
          recurrence: "monthly",
          intervalMonths: 1,
          dayOfMonth: 25,
          endDate: null,
          isPrimary: true,
        },
      ],
      updatedAt: "2026-07-16T12:00:00.000Z",
    }),
  });

  applyHouseholdSync(
    makeSyncPayload({
      moneySetup: makeMoneySetup({
        incomeSources: [
          {
            id: "salary-main",
            label: "Зарплата",
            expectedDate: "2026-07-25",
            expectedAmount: 120000,
            kind: "salary",
            recurrence: "monthly",
            intervalMonths: 1,
            dayOfMonth: 25,
            endDate: "2026-11-25",
            isPrimary: true,
          },
        ],
        updatedAt: "2026-07-16T10:00:00.000Z",
      }),
    }),
    "token-1",
  );

  const income = useStore.getState().moneySetup.incomeSources[0];
  assert.equal(income?.endDate, null);

  restoreCloudStores(snapshot);
});

test("monthly income switched to one-time does not restore old recurring schedule after hydrate", () => {
  const snapshot = resetCloudStores();

  applyHouseholdSync(
    makeSyncPayload({
      moneySetup: makeMoneySetup({
        incomeSources: [
          {
            id: "salary-main",
            label: "Зарплата",
            expectedDate: "2026-07-25",
            expectedAmount: 120000,
            kind: "salary",
            recurrence: "once",
            intervalMonths: 3,
            dayOfMonth: 25,
            endDate: "2026-11-25",
            isPrimary: true,
          },
        ],
        updatedAt: "2026-07-16T10:00:00.000Z",
      }),
    }),
    "token-1",
    { replace: true },
  );

  const income = useStore.getState().moneySetup.incomeSources[0];
  assert.equal(income?.recurrence, "once");
  assert.equal(income?.intervalMonths, null);
  assert.equal(income?.dayOfMonth, null);
  assert.equal(income?.endDate, null);

  const snapshotAfterHydrate = decisionCoreSnapshot(
    buildDecisionState({
      moneySetup: useStore.getState().moneySetup,
    }),
  );
  const incomeEvents = snapshotAfterHydrate.forecast.events.filter(
    (event) => event.source === "income_source" && event.incomeSourceId === "salary-main",
  );
  assert.deepEqual(
    incomeEvents.map((event) => event.date),
    ["2026-07-25"],
  );

  restoreCloudStores(snapshot);
});

test("applyHouseholdSync preserves recurring fields that drive forecast", () => {
  const snapshot = resetCloudStores();

  applyHouseholdSync(
    makeSyncPayload({
      recurringTransactions: [
        {
          id: "rec-water",
          amount: 5000,
          type: "expense",
          categoryId: "home",
          note: "ЖКХ вода",
          owner: "me",
          frequency: "monthly",
          intervalMonths: 1,
          dayOfMonth: 20,
          nextRunDate: "2026-07-20",
          endDate: "2026-08-20",
          enabled: true,
          skippedDates: [],
          updatedAt: "2026-07-16T10:00:00.000Z",
        },
      ],
    }),
    "token-1",
    { replace: true },
  );

  const recurring = useStore.getState().recurringTransactions[0];
  assert.equal(recurring?.amount, 5000);
  assert.equal(recurring?.categoryId, "home");
  assert.equal(recurring?.frequency, "monthly");
  assert.equal(recurring?.nextRunDate, "2026-07-20");
  assert.equal(recurring?.endDate, "2026-08-20");
  assert.equal(recurring?.enabled, true);

  restoreCloudStores(snapshot);
});

test("forecast respects recurring endDate after cloud hydration", () => {
  const snapshot = decisionCoreSnapshot(
    buildDecisionState({
      recurringTransactions: [
        {
          id: "rec-water",
          amount: 5000,
          type: "expense",
          categoryId: "home",
          note: "ЖКХ вода",
          owner: "me",
          frequency: "monthly",
          intervalMonths: 1,
          dayOfMonth: 20,
          nextRunDate: "2026-07-20",
          endDate: "2026-08-20",
          enabled: true,
          skippedDates: [],
        },
      ],
      balances: { all: 30000, me: 30000, partner: 0 },
    }),
  );

  const recurringDates = snapshot.forecast.events
    .filter((event) => event.recurringId === "rec-water")
    .map((event) => event.date);

  assert.deepEqual(recurringDates, ["2026-07-20", "2026-08-20"]);
});

test("applyHouseholdSync preserves yearly recurring schedule fields", () => {
  const snapshot = resetCloudStores();

  applyHouseholdSync(
    makeSyncPayload({
      recurringTransactions: [
        {
          id: "osago-yearly",
          amount: 15000,
          type: "expense",
          categoryId: "auto",
          note: "ОСАГО",
          owner: "me",
          frequency: "yearly",
          intervalMonths: null,
          dayOfMonth: null,
          nextRunDate: "2027-03-15",
          endDate: null,
          enabled: true,
          skippedDates: [],
          updatedAt: "2026-07-20T10:00:00.000Z",
        },
      ],
    }),
    "token-1",
    { replace: true },
  );

  const recurring = useStore.getState().recurringTransactions[0];
  assert.equal(recurring?.frequency, "yearly");
  assert.equal(recurring?.nextRunDate, "2027-03-15");
  assert.equal(recurring?.intervalMonths, null);
  assert.equal(recurring?.dayOfMonth, null);

  const snapshotAfterHydrate = decisionCoreSnapshot(
    buildDecisionState({
      today: "2027-03-01",
      recurringTransactions: useStore.getState().recurringTransactions,
      balances: { all: 30000, me: 30000, partner: 0 },
    }),
  );
  const recurringDates = snapshotAfterHydrate.forecast.events
    .filter((event) => event.recurringId === "osago-yearly")
    .map((event) => event.date);

  assert.deepEqual(recurringDates, ["2027-03-15"]);

  restoreCloudStores(snapshot);
});

test("applyHouseholdSync preserves debt fields after cloud sync", () => {
  const snapshot = resetCloudStores();

  applyHouseholdSync(
    makeSyncPayload({
      debts: [
        {
          id: "debt-water",
          name: "ЖКХ вода",
          owner: "all",
          balance: 21000,
          minPayment: 5000,
          ratePct: 12.5,
          nextPaymentDate: "2026-07-20",
          strategy: "avalanche",
          priority: "high",
          updatedAt: "2026-07-16T10:00:00.000Z",
        },
      ],
    }),
    "token-1",
    { replace: true },
  );

  const debt = useStore.getState().debts[0];
  assert.equal(debt?.balance, 21000);
  assert.equal(debt?.minPayment, 5000);
  assert.equal(debt?.nextPaymentDate, "2026-07-20");
  assert.equal(debt?.priority, "high");

  restoreCloudStores(snapshot);
});

test("applyHouseholdSync preserves goal fields after cloud sync", () => {
  const snapshot = resetCloudStores();

  applyHouseholdSync(
    makeSyncPayload({
      savingsGoals: [
        {
          id: "goal-home",
          name: "Подушка",
          targetAmount: 300000,
          savedAmount: 50000,
          deadline: "2026-12-31",
          monthlyContribution: 20000,
          kind: "custom",
          emergencyMonths: null,
          updatedAt: "2026-07-16T10:00:00.000Z",
        },
      ],
    }),
    "token-1",
    { replace: true },
  );

  const goal = useStore.getState().savingsGoals[0];
  assert.equal(goal?.targetAmount, 300000);
  assert.equal(goal?.savedAmount, 50000);
  assert.equal(goal?.deadline, "2026-12-31");
  assert.equal(goal?.kind, "custom");
  assert.ok(typeof goal?.monthlyContribution === "number");

  restoreCloudStores(snapshot);
});

test("synced income, recurring expense, debt, and goal fields stay forecast-ready together", () => {
  const snapshot = decisionCoreSnapshot(
    buildDecisionState({
      balances: { all: 80000, me: 80000, partner: 0 },
      recurringTransactions: [
        {
          id: "rent",
          amount: 40000,
          type: "expense",
          categoryId: "home",
          note: "Аренда",
          owner: "me",
          frequency: "monthly",
          intervalMonths: 1,
          dayOfMonth: 20,
          nextRunDate: "2026-07-20",
          endDate: "2026-09-20",
          enabled: true,
          skippedDates: [],
        },
      ],
      debts: [
        {
          id: "debt-water",
          name: "ЖКХ вода",
          owner: "all",
          balance: 21000,
          minPayment: 5000,
          ratePct: null,
          nextPaymentDate: "2026-07-20",
          strategy: "avalanche",
          priority: "normal",
        },
      ],
      moneySetup: makeMoneySetup({
        incomeSources: [
          {
            id: "salary-main",
            label: "Зарплата",
            expectedDate: "2026-07-25",
            expectedAmount: 120000,
            kind: "salary",
            recurrence: "monthly",
            intervalMonths: 1,
            dayOfMonth: 25,
            endDate: "2026-10-25",
            isPrimary: true,
          },
        ],
      }),
    }),
  );

  const plannedFreeMoney = calculatePlannedFreeMoneyUntilPeriodEnd(
    buildDecisionState({
      balances: { all: 80000, me: 80000, partner: 0 },
      recurringTransactions: [
        {
          id: "rent",
          amount: 40000,
          type: "expense",
          categoryId: "home",
          note: "Аренда",
          owner: "me",
          frequency: "monthly",
          intervalMonths: 1,
          dayOfMonth: 20,
          nextRunDate: "2026-07-20",
          endDate: "2026-09-20",
          enabled: true,
          skippedDates: [],
        },
      ],
      debts: [
        {
          id: "debt-water",
          name: "ЖКХ вода",
          owner: "all",
          balance: 21000,
          minPayment: 5000,
          ratePct: null,
          nextPaymentDate: "2026-07-20",
          strategy: "avalanche",
          priority: "normal",
        },
      ],
      moneySetup: makeMoneySetup({
        incomeSources: [
          {
            id: "salary-main",
            label: "Зарплата",
            expectedDate: "2026-07-25",
            expectedAmount: 120000,
            kind: "salary",
            recurrence: "monthly",
            intervalMonths: 1,
            dayOfMonth: 25,
            endDate: "2026-10-25",
            isPrimary: true,
          },
        ],
      }),
    }),
    snapshot,
  );

  assert.equal(plannedFreeMoney.breakdown?.expectedRecurringIncome, 120000);
  assert.ok(
    snapshot.forecast.events.some(
      (event) => event.recurringId === "rent" && event.date === "2026-07-20",
    ),
  );
  assert.ok(
    snapshot.forecast.events.some(
      (event) => event.source === "debt_payment" && event.date === "2026-07-20",
    ),
  );
});

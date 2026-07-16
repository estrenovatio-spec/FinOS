import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyHouseholdSync } from "@/lib/cloud/apply-sync";
import type { HouseholdPublic, SyncPayload } from "@/lib/household/types";
import { dbRecurringToApp, appRecurringToDb } from "@/lib/household/planning-mapper";
import { getDefaultCategories } from "@/lib/categories";
import { emptyMoneySetup } from "@/lib/money-setup";
import { decisionCoreSnapshot, type DecisionCoreState } from "@/lib/decision-core";
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

function makeSyncPayload(overrides: Partial<SyncPayload>): SyncPayload {
  return {
    household,
    memberUserIds: ["user-1"],
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

function makeState(overrides: Partial<DecisionCoreState> = {}): DecisionCoreState {
  return {
    locale: "ru",
    today: "2026-07-16",
    forecastHorizonMonths: 3,
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
  };
}

test("creating a recurring payment keeps endDate in the local store", () => {
  const previousStore = useStore.getState();

  useStore.setState({
    ...previousStore,
    recurringTransactions: [],
  });

  const id = useStore.getState().addRecurring({
    amount: 5000,
    type: "expense",
    categoryId: "other",
    note: "ЖКХ вода",
    owner: "me",
    frequency: "monthly",
    intervalMonths: 1,
    dayOfMonth: 20,
    nextRunDate: "2026-07-20",
    endDate: "2026-08-20",
  });

  const item = useStore.getState().recurringTransactions.find((entry) => entry.id === id);
  assert.equal(item?.endDate, "2026-08-20");

  useStore.setState(previousStore);
});

test("editing a recurring payment keeps endDate in the local store", () => {
  const previousStore = useStore.getState();

  useStore.setState({
    ...previousStore,
    recurringTransactions: [
      {
        id: "rec-water",
        amount: 5000,
        type: "expense",
        categoryId: "other",
        note: "ЖКХ вода",
        skippedDates: [],
        owner: "me",
        frequency: "monthly",
        intervalMonths: 1,
        dayOfMonth: 20,
        nextRunDate: "2026-07-20",
        endDate: null,
        enabled: true,
      },
    ],
  });

  useStore.getState().updateRecurring("rec-water", { endDate: "2026-08-20" });

  const item = useStore.getState().recurringTransactions.find((entry) => entry.id === "rec-water");
  assert.equal(item?.endDate, "2026-08-20");

  useStore.setState(previousStore);
});

test("database mapping keeps recurring endDate through persistence roundtrip", () => {
  const row = appRecurringToDb("household-1", {
    id: "rec-water",
    amount: 5000,
    type: "expense",
    categoryId: "other",
    note: "ЖКХ вода",
    owner: "me",
    frequency: "monthly",
    intervalMonths: 1,
    dayOfMonth: 20,
    nextRunDate: "2026-07-20",
    endDate: "2026-08-20",
    enabled: true,
    skippedDates: [],
  });

  const restored = dbRecurringToApp({
    ...row,
    createdAt: new Date("2026-07-16T10:00:00.000Z"),
    updatedAt: new Date("2026-07-16T10:00:00.000Z"),
  });

  assert.equal(restored.endDate, "2026-08-20");
});

test("cloud hydrate keeps recurring endDate after sync reload", () => {
  const previousStore = useStore.getState();
  const previousCloud = useCloudStore.getState();

  useStore.setState({
    ...previousStore,
    recurringTransactions: [],
    categories: getDefaultCategories(),
    transactions: [],
    savingsGoals: [],
    categoryBudgets: [],
    debts: [],
    moneySetup: emptyMoneySetup(),
  });

  useCloudStore.setState({
    ...previousCloud,
    token: "token-1",
    household,
    lastSyncedAt: "2026-07-16T10:00:00.000Z",
    deletedRecurringIds: [],
    deletedDebtIds: [],
    deletedTransactionIds: [],
    pendingTransactionUpdateIds: {},
    lastSyncedRemoteTxIds: [],
    lastSyncedRemoteCategoryIds: [],
    lastSyncedRemoteGoalIds: [],
    lastSyncedRemoteBudgetCategoryIds: [],
    lastSyncedRemoteRecurringIds: [],
    lastSyncedRemoteDebtIds: [],
  });

  applyHouseholdSync(
    makeSyncPayload({
      recurringTransactions: [
        {
          id: "rec-water",
          amount: 5000,
          type: "expense",
          categoryId: "other",
          note: "ЖКХ вода",
          skippedDates: [],
          owner: "me",
          frequency: "monthly",
          intervalMonths: 1,
          dayOfMonth: 20,
          nextRunDate: "2026-07-20",
          endDate: "2026-08-20",
          enabled: true,
          updatedAt: "2026-07-16T10:00:00.000Z",
        },
      ],
    }),
    "token-1",
  );

  assert.equal(useStore.getState().recurringTransactions[0]?.endDate, "2026-08-20");

  useStore.setState(previousStore);
  useCloudStore.setState(previousCloud);
});

test("forecast does not generate recurring events after endDate", () => {
  const snapshot = decisionCoreSnapshot(
    makeState({
      recurringTransactions: [
        {
          id: "rec-water",
          amount: 5000,
          type: "expense",
          categoryId: "other",
          note: "ЖКХ вода",
          skippedDates: [],
          owner: "me",
          frequency: "monthly",
          intervalMonths: 1,
          dayOfMonth: 20,
          nextRunDate: "2026-07-20",
          endDate: "2026-08-20",
          enabled: true,
        },
      ],
      moneySetup: {
        ...emptyMoneySetup(),
        hasNoRequiredFixedExpenses: true,
      },
    }),
  );

  const recurringDates = snapshot.forecast.events
    .filter((event) => event.recurringId === "rec-water")
    .map((event) => event.date);

  assert.deepEqual(recurringDates, ["2026-07-20", "2026-08-20"]);
});

test("cloud recurring route and service persist endDate", () => {
  const routeSource = readFileSync("src/app/api/household/recurring/route.ts", "utf8");
  const serviceSource = readFileSync("src/lib/household/service.ts", "utf8");

  assert.match(routeSource, /endDate: z\.string\(\)\.nullable\(\)\.optional\(\)/);
  assert.match(serviceSource, /endDate: item\.endDate \?\? null/);
});

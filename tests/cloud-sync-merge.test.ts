import test from "node:test";
import assert from "node:assert/strict";
import { applyHouseholdSync } from "@/lib/cloud/apply-sync";
import { mergeMoneySetup } from "@/lib/cloud/merge-sync";
import type { HouseholdPublic, SyncPayload } from "@/lib/household/types";
import { emptyMoneySetup, type MoneySetup } from "@/lib/money-setup";
import { getDefaultCategories } from "@/lib/categories";
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

test("mergeMoneySetup keeps richer local income sources when remote money setup is empty", () => {
  const local = makeMoneySetup({
    incomeSources: [
      {
        id: "salary-main",
        label: "Зарплата",
        expectedDate: "2026-07-25",
        expectedAmount: 24000,
        kind: "salary",
      },
    ],
    updatedAt: "2026-07-14T08:00:00.000Z",
  });
  const remote = makeMoneySetup({
    updatedAt: "2026-07-14T07:00:00.000Z",
  });

  const merged = mergeMoneySetup(local, remote);

  assert.equal(merged.incomeSources.length, 1);
  assert.equal(merged.incomeSources[0]?.id, "salary-main");
  assert.equal(merged.updatedAt, "2026-07-14T08:00:00.000Z");
});

test("mergeMoneySetup prefers newer remote state when it is actually newer", () => {
  const local = makeMoneySetup({
    incomeSources: [
      {
        id: "salary-old",
        label: "Старая зарплата",
        expectedDate: "2026-07-15",
        expectedAmount: 10000,
        kind: "salary",
      },
    ],
    updatedAt: "2026-07-14T06:00:00.000Z",
  });
  const remote = makeMoneySetup({
    incomeSources: [
      {
        id: "salary-new",
        label: "Новая зарплата",
        expectedDate: "2026-07-20",
        expectedAmount: 24000,
        kind: "salary",
      },
    ],
    updatedAt: "2026-07-14T09:00:00.000Z",
  });

  const merged = mergeMoneySetup(local, remote);

  assert.equal(merged.incomeSources.length, 1);
  assert.equal(merged.incomeSources[0]?.id, "salary-new");
  assert.equal(merged.updatedAt, "2026-07-14T09:00:00.000Z");
});

test("applyHouseholdSync does not wipe local income sources when remote sync has empty money setup", () => {
  const previousStore = useStore.getState();
  const previousCloud = useCloudStore.getState();

  useStore.setState({
    ...previousStore,
    categories: getDefaultCategories(),
    transactions: [],
    savingsGoals: [],
    categoryBudgets: [],
    recurringTransactions: [],
    debts: [],
    moneySetup: makeMoneySetup({
      incomeSources: [
        {
          id: "salary-browser",
          label: "Зарплата",
          expectedDate: "2026-07-25",
          expectedAmount: 24000,
          kind: "salary",
        },
      ],
      updatedAt: "2026-07-14T08:00:00.000Z",
    }),
  });

  useCloudStore.setState({
    ...previousCloud,
    token: null,
    household: null,
    lastSyncedAt: "2026-07-14T07:30:00.000Z",
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
      moneySetup: makeMoneySetup({
        updatedAt: "2026-07-14T07:00:00.000Z",
      }),
    }),
    "token-1",
  );

  assert.equal(useStore.getState().moneySetup.incomeSources.length, 1);
  assert.equal(useStore.getState().moneySetup.incomeSources[0]?.id, "salary-browser");

  useStore.setState(previousStore);
  useCloudStore.setState(previousCloud);
});

test("applyHouseholdSync replaces local current-balance offsets from cloud balanceOffsets", () => {
  const previousStore = useStore.getState();
  const previousCloud = useCloudStore.getState();

  useStore.setState({
    ...previousStore,
    cashOffsetMe: 1111,
    cashOffsetPartner: 0,
    transactions: [],
    categories: getDefaultCategories(),
  });

  useCloudStore.setState({
    ...previousCloud,
    cloudUserId: "user-1",
    householdMemberUserIds: ["user-1"],
    token: "token-1",
    household,
  });

  applyHouseholdSync(
    makeSyncPayload({
      viewerUserId: "user-1",
      memberUserIds: ["user-1"],
      balanceOffsets: {
        "user-1": 4321,
      },
    }),
    "token-1",
  );

  assert.equal(useStore.getState().cashOffsetMe, 4321);
  assert.equal(useStore.getState().cashOffsetPartner, 0);
  assert.equal(useCloudStore.getState().balanceOffsets["user-1"], 4321);

  useStore.setState(previousStore);
  useCloudStore.setState(previousCloud);
});

test("applyHouseholdSync keeps a pending local goal when remote sync is still behind", () => {
  const previousStore = useStore.getState();
  const previousCloud = useCloudStore.getState();

  useStore.setState({
    ...previousStore,
    transactions: [],
    categories: getDefaultCategories(),
    savingsGoals: [
      {
        id: "goal-browser",
        name: "Новая цель",
        targetAmount: 100000,
        savedAmount: 0,
        deadline: "2026-09-01",
        monthlyContribution: null,
        kind: "custom",
        emergencyMonths: null,
        updatedAt: "2026-07-14T08:00:00.000Z",
      },
    ],
  });

  useCloudStore.setState({
    ...previousCloud,
    token: "token-1",
    household,
    lastSyncedAt: "2026-07-14T08:05:00.000Z",
    pendingGoalIds: ["goal-browser"],
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
      savingsGoals: [],
    }),
    "token-1",
  );

  assert.equal(useStore.getState().savingsGoals.length, 1);
  assert.equal(useStore.getState().savingsGoals[0]?.id, "goal-browser");

  useStore.setState(previousStore);
  useCloudStore.setState(previousCloud);
});

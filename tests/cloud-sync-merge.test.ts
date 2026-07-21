import test from "node:test";
import assert from "node:assert/strict";
import { applyHouseholdSync } from "@/lib/cloud/apply-sync";
import {
  isMeaningfullyEmptyLocalState,
  resolveInitialSyncDecision,
} from "@/lib/cloud/initial-sync";
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

function tx(
  partial: {
    id: string;
    amount: number;
    type: "income" | "expense";
    categoryId: string;
    date: string;
    note?: string;
    owner?: "me" | "partner";
    confirmed?: boolean;
    recurringId?: string | null;
    recurringOccurrenceDate?: string | null;
  },
) {
  return {
    id: partial.id,
    amount: partial.amount,
    type: partial.type,
    categoryId: partial.categoryId,
    currency: "RUB" as const,
    note: partial.note ?? "",
    date: partial.date,
    owner: partial.owner ?? "me",
    confirmed: partial.confirmed,
    goalId: null,
    goalAmount: null,
    recurringId: partial.recurringId ?? null,
    recurringOccurrenceDate: partial.recurringOccurrenceDate ?? null,
    odometerKm: null,
    fuelLiters: null,
    vehicleId: null,
    transferPairId: null,
    businessTxId: null,
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

test("applyHouseholdSync does not resurrect a locally deleted category from remote sync", () => {
  const previousStore = useStore.getState();
  const previousCloud = useCloudStore.getState();

  const remoteOnlyCategory = {
    id: "test-category",
    type: "expense" as const,
    labels: { ru: "Тестовая", en: "Test" },
    keywords: ["test"],
    isSystem: false,
  };

  useStore.setState({
    ...previousStore,
    transactions: [],
    categories: getDefaultCategories(),
    deletedCategoryArchive: [
      {
        id: "archive-test-category",
        deletedAt: "2026-07-15T10:00:00.000Z",
        category: remoteOnlyCategory,
        fallbackCategoryId: "other",
        affectedTransactions: [],
      },
    ],
  });

  useCloudStore.setState({
    ...previousCloud,
    token: "token-1",
    household,
    lastSyncedAt: "2026-07-15T10:05:00.000Z",
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

  applyHouseholdSync(
    makeSyncPayload({
      categories: [...getDefaultCategories(), remoteOnlyCategory],
    }),
    "token-1",
  );

  assert.equal(
    useStore.getState().categories.some((category) => category.id === "test-category"),
    false,
  );

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

test("applyHouseholdSync keeps a local unsynced goal even when last sync is newer than the goal timestamp", () => {
  const previousStore = useStore.getState();
  const previousCloud = useCloudStore.getState();

  useStore.setState({
    ...previousStore,
    transactions: [],
    categories: getDefaultCategories(),
    savingsGoals: [
      {
        id: "goal-local-only",
        name: "Подушка на машину",
        targetAmount: 250000,
        savedAmount: 15000,
        deadline: "2026-10-01",
        monthlyContribution: null,
        kind: "custom",
        emergencyMonths: null,
        updatedAt: "2026-07-18T09:00:00.000Z",
      },
    ],
  });

  useCloudStore.setState({
    ...previousCloud,
    token: "token-1",
    household,
    lastSyncedAt: "2026-07-18T09:05:00.000Z",
    pendingGoalIds: [],
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
  assert.equal(useStore.getState().savingsGoals[0]?.id, "goal-local-only");
  assert.equal(useStore.getState().savingsGoals[0]?.name, "Подушка на машину");

  useStore.setState(previousStore);
  useCloudStore.setState(previousCloud);
});

test("default local state with only system categories is meaningfully empty", () => {
  assert.equal(
    isMeaningfullyEmptyLocalState({
      transactions: [],
      categories: getDefaultCategories(),
      savingsGoals: [],
      categoryBudgets: [],
      recurringTransactions: [],
      debts: [],
      moneySetup: emptyMoneySetup(),
      cashOffsetMe: 0,
      cashOffsetPartner: 0,
    }),
    true,
  );
});

test("initial sync downloads cloud when local device is empty", () => {
  const decision = resolveInitialSyncDecision({
    localState: {
      transactions: [],
      categories: getDefaultCategories(),
      savingsGoals: [],
      categoryBudgets: [],
      recurringTransactions: [],
      debts: [],
      moneySetup: emptyMoneySetup(),
      cashOffsetMe: 0,
      cashOffsetPartner: 0,
    },
    cloudSync: makeSyncPayload({
      transactions: [
        {
          id: "tx-1",
          amount: 500,
          type: "expense",
          categoryId: "groceries",
          currency: "RUB",
          note: "Продукты",
          date: "2026-07-14",
          owner: "me",
        },
      ],
    }),
  });

  assert.equal(decision, "download_cloud");
});

test("initial sync merges when both local and cloud already have meaningful data", () => {
  const decision = resolveInitialSyncDecision({
    localState: {
      transactions: [],
      categories: [
        ...getDefaultCategories(),
        {
          id: "custom-cat",
          type: "expense",
          labels: { ru: "Свое", en: "Custom" },
          keywords: [],
          isSystem: false,
        },
      ],
      savingsGoals: [],
      categoryBudgets: [],
      recurringTransactions: [],
      debts: [],
      moneySetup: emptyMoneySetup(),
      cashOffsetMe: 0,
      cashOffsetPartner: 0,
    },
    cloudSync: makeSyncPayload({
      savingsGoals: [
        {
          id: "goal-1",
          name: "Подушка",
          targetAmount: 100000,
          savedAmount: 0,
          deadline: "2026-12-31",
          monthlyContribution: null,
          kind: "custom",
          emergencyMonths: null,
          updatedAt: "2026-07-14T08:00:00.000Z",
        },
      ],
    }),
  });

  assert.equal(decision, "merge");
});

test("applyHouseholdSync updates goal deadline from newer remote goal", () => {
  const previousStore = useStore.getState();
  const previousCloud = useCloudStore.getState();

  useStore.setState({
    ...previousStore,
    transactions: [],
    categories: getDefaultCategories(),
    savingsGoals: [
      {
        id: "goal-browser",
        name: "Отпуск",
        targetAmount: 80000,
        savedAmount: 0,
        deadline: null,
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

  applyHouseholdSync(
    makeSyncPayload({
      savingsGoals: [
        {
          id: "goal-browser",
          name: "Отпуск",
          targetAmount: 80000,
          savedAmount: 0,
          deadline: "2026-12-31",
          monthlyContribution: null,
          kind: "custom",
          emergencyMonths: null,
          updatedAt: "2026-07-14T09:00:00.000Z",
        },
      ],
    }),
    "token-1",
  );

  assert.equal(useStore.getState().savingsGoals[0]?.deadline, "2026-12-31");

  useStore.setState(previousStore);
  useCloudStore.setState(previousCloud);
});

test("applyHouseholdSync resolves legacy paid plus skipped recurring conflict in favor of paid", () => {
  const previousStore = useStore.getState();
  const previousCloud = useCloudStore.getState();

  useStore.setState({
    ...previousStore,
    transactions: [],
    categories: getDefaultCategories(),
    recurringTransactions: [],
  });

  useCloudStore.setState({
    ...previousCloud,
    token: "token-1",
    household,
    lastSyncedAt: "2026-07-19T09:00:00.000Z",
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

  applyHouseholdSync(
    makeSyncPayload({
      transactions: [
        {
          id: "mortgage-paid",
          amount: 19000,
          type: "expense",
          categoryId: "housing",
          currency: "RUB",
          note: "Ипотека",
          date: "2026-07-16",
          owner: "me",
          confirmed: true,
          recurringId: "mortgage-recurring",
        },
      ],
      recurringTransactions: [
        {
          id: "mortgage-recurring",
          amount: 19000,
          type: "expense",
          categoryId: "housing",
          note: "Ипотека",
          skippedDates: ["2026-07-17"],
          owner: "me",
          frequency: "monthly",
          intervalMonths: 1,
          dayOfMonth: 16,
          nextRunDate: "2026-08-16",
          enabled: true,
        },
      ],
    }),
    "token-1",
  );

  assert.deepEqual(
    useStore.getState().recurringTransactions[0]?.skippedDates ?? [],
    [],
  );

  useStore.setState(previousStore);
  useCloudStore.setState(previousCloud);
});

test("applyHouseholdSync keeps only the confirmed recurring occurrence after sync", () => {
  const previousStore = useStore.getState();
  const previousCloud = useCloudStore.getState();

  useStore.setState({
    ...previousStore,
    categories: getDefaultCategories(),
    transactions: [
      tx({
        id: "mortgage-pending-local",
        amount: 19000,
        type: "expense",
        categoryId: "housing",
        date: "2026-07-17",
        note: "Ипотека",
        confirmed: false,
        recurringId: "mortgage-recurring",
        recurringOccurrenceDate: "2026-07-16",
      }),
    ],
    recurringTransactions: [
      {
        id: "mortgage-recurring",
        amount: 19000,
        type: "expense",
        categoryId: "housing",
        note: "Ипотека",
        skippedDates: [],
        owner: "me",
        frequency: "monthly",
        intervalMonths: 1,
        dayOfMonth: 16,
        nextRunDate: "2026-08-16",
        enabled: true,
      },
    ],
  });

  useCloudStore.setState({
    ...previousCloud,
    token: "token-1",
    household,
    lastSyncedAt: "2026-07-19T09:00:00.000Z",
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

  applyHouseholdSync(
    makeSyncPayload({
      transactions: [
        tx({
          id: "mortgage-paid-remote",
          amount: 19000,
          type: "expense",
          categoryId: "housing",
          date: "2026-07-17",
          note: "Ипотека",
          confirmed: true,
          recurringId: "mortgage-recurring",
          recurringOccurrenceDate: "2026-07-16",
        }),
      ],
      recurringTransactions: [
        {
          id: "mortgage-recurring",
          amount: 19000,
          type: "expense",
          categoryId: "housing",
          note: "Ипотека",
          skippedDates: [],
          owner: "me",
          frequency: "monthly",
          intervalMonths: 1,
          dayOfMonth: 16,
          nextRunDate: "2026-08-16",
          enabled: true,
        },
      ],
    }),
    "token-1",
    { replace: true },
  );

  const syncedTransactions = useStore.getState().transactions.filter(
    (item) => item.recurringId === "mortgage-recurring",
  );
  assert.equal(syncedTransactions.length, 1);
  assert.equal(syncedTransactions[0]?.confirmed, true);
  assert.equal(syncedTransactions[0]?.recurringOccurrenceDate, "2026-07-16");

  useStore.setState(previousStore);
  useCloudStore.setState(previousCloud);
});

test("applyHouseholdSync repairs legacy recurring transaction without recurringOccurrenceDate", () => {
  const previousStore = useStore.getState();
  const previousCloud = useCloudStore.getState();

  useStore.setState({
    ...previousStore,
    transactions: [],
    categories: getDefaultCategories(),
    recurringTransactions: [],
  });

  useCloudStore.setState({
    ...previousCloud,
    token: "token-1",
    household,
    lastSyncedAt: "2026-07-19T09:00:00.000Z",
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

  applyHouseholdSync(
    makeSyncPayload({
      transactions: [
        tx({
          id: "mortgage-paid",
          amount: 19000,
          type: "expense",
          categoryId: "housing",
          date: "2026-07-17",
          note: "Ипотека",
          confirmed: true,
          recurringId: "mortgage-recurring",
        }),
      ],
      recurringTransactions: [
        {
          id: "mortgage-recurring",
          amount: 19000,
          type: "expense",
          categoryId: "housing",
          note: "Ипотека",
          skippedDates: [],
          owner: "me",
          frequency: "monthly",
          intervalMonths: 1,
          dayOfMonth: 16,
          nextRunDate: "2026-08-16",
          enabled: true,
        },
      ],
    }),
    "token-1",
    { replace: true },
  );

  assert.equal(
    useStore.getState().transactions.find((item) => item.id === "mortgage-paid")
      ?.recurringOccurrenceDate,
    "2026-07-17",
  );

  useStore.setState(previousStore);
  useCloudStore.setState(previousCloud);
});

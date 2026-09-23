import assert from "node:assert/strict";
import test from "node:test";
import { applyHouseholdSync } from "@/lib/cloud/apply-sync";
import { cloudPushRecurring } from "@/lib/cloud/push";
import { mergeSyncPayload } from "@/lib/cloud/merge-sync";
import { getDefaultCategories } from "@/lib/categories";
import { emptyMoneySetup } from "@/lib/money-setup";
import type { SyncPayload } from "@/lib/household/types";
import type { CategoryBudget, DebtItem, RecurringTransaction, SavingsGoal } from "@/types/planning";
import { useStore } from "@/store/useStore";
import { useCloudStore } from "@/store/useCloudStore";

function recurring(id: string): RecurringTransaction {
  return {
    id,
    amount: 1000,
    type: "expense",
    categoryId: "other",
    note: id,
    owner: "me",
    frequency: "monthly",
    dayOfMonth: 20,
    nextRunDate: "2026-10-20",
    enabled: true,
    skippedDates: [],
    updatedAt: "2026-09-22T10:00:00.000Z",
  };
}

function sync(items: RecurringTransaction[]): SyncPayload {
  return {
    household: {
      id: "household-1",
      name: "Test",
      mode: "solo",
      inviteCode: "ABC123",
      partnerLabel: null,
      memberCount: 1,
    },
    memberUserIds: ["user-1"],
    transactions: [],
    categories: getDefaultCategories(),
    savingsGoals: [],
    categoryBudgets: [],
    recurringTransactions: items,
    debts: [],
    moneySetup: emptyMoneySetup(),
  };
}

function goal(id: string): SavingsGoal {
  return {
    id,
    name: id,
    targetAmount: 10_000,
    savedAmount: 0,
    deadline: null,
    monthlyContribution: null,
    kind: "custom",
    emergencyMonths: null,
    updatedAt: "2026-09-22T10:00:00.000Z",
  };
}

function budget(categoryId: string): CategoryBudget {
  return {
    categoryId,
    monthlyLimit: 1_000,
    updatedAt: "2026-09-22T10:00:00.000Z",
  };
}

function debt(id: string): DebtItem {
  return {
    id,
    name: id,
    balance: 10_000,
    minPayment: 1_000,
    ratePct: null,
    nextPaymentDate: null,
    owner: "me",
    strategy: "avalanche",
    priority: "normal",
    updatedAt: "2026-09-22T10:00:00.000Z",
  };
}

let previousLocal: ReturnType<typeof useStore.getState>;
let previousCloud: ReturnType<typeof useCloudStore.getState>;

test.afterEach(() => {
  useStore.setState(previousLocal, true);
  useCloudStore.setState(previousCloud, true);
});

test.beforeEach(() => {
  previousLocal = useStore.getState();
  previousCloud = useCloudStore.getState();
  useStore.setState({
    transactions: [],
    recurringTransactions: [],
    savingsGoals: [],
    debts: [],
    categoryBudgets: [],
    moneySetup: emptyMoneySetup(),
  });
  useCloudStore.setState({
    token: "test-token",
    household: sync([]).household,
    syncBootstrapStatus: "checking",
    lastSyncedAt: "2026-09-22T11:00:00.000Z",
    deletedRecurringIds: [],
    pendingRecurringUpdateIds: {},
    lastSyncedRemoteRecurringIds: [],
  });
});

test("adding recurring payments marks each creation pending and keeps older unsynced payments across partial pulls", () => {
  const older = [recurring("older-1"), recurring("older-2")];
  useStore.setState({ recurringTransactions: older });
  const { id: _, ...input } = recurring("new");
  const first = useStore.getState().addRecurring(input);
  const second = useStore.getState().addRecurring(input);
  assert.ok(useCloudStore.getState().pendingRecurringUpdateIds[first]);
  assert.ok(useCloudStore.getState().pendingRecurringUpdateIds[second]);
  const savedFirst = useStore
    .getState()
    .recurringTransactions.find((r) => r.id === first)!;
  useCloudStore.getState().touchSync();
  for (let pull = 0; pull < 2; pull++) {
    applyHouseholdSync(sync([savedFirst]), "test-token", {
      pushLocalOnly: false,
    });
    useCloudStore.getState().touchSync();
    assert.deepEqual(
      new Set(useStore.getState().recurringTransactions.map((r) => r.id)),
      new Set(["older-1", "older-2", first, second]),
    );
    assert.ok(useCloudStore.getState().pendingRecurringUpdateIds[second]);
  }
});

test("pending recurring edit survives a snapshot where it is missing", () => {
  const item = recurring("pending");
  useStore.setState({ recurringTransactions: [item] });
  useCloudStore.setState({
    lastSyncedRemoteRecurringIds: [item.id],
    pendingRecurringUpdateIds: { [item.id]: item.updatedAt! },
  });
  applyHouseholdSync(sync([recurring("other")]), "test-token", {
    pushLocalOnly: false,
  });
  assert.ok(
    useStore.getState().recurringTransactions.some((r) => r.id === item.id),
  );
});

test("older local payments survive the first nonempty cloud snapshot without pending markers", () => {
  useStore.setState({
    recurringTransactions: [recurring("older-1"), recurring("older-2")],
  });
  applyHouseholdSync(sync([recurring("new")]), "test-token", {
    pushLocalOnly: false,
  });
  assert.deepEqual(
    new Set(useStore.getState().recurringTransactions.map((r) => r.id)),
    new Set(["older-1", "older-2", "new"]),
  );
});

test("older unsynced recurring payments remain queued for upload", () => {
  const items = [recurring("older-1"), recurring("older-2")];
  const merged = mergeSyncPayload(
    [],
    getDefaultCategories(),
    {
      savingsGoals: [],
      categoryBudgets: [],
      recurringTransactions: items,
      debts: [],
      moneySetup: emptyMoneySetup(),
    },
    sync([recurring("new")]),
    "2026-09-22T11:00:00.000Z",
  );
  assert.deepEqual(
    merged.localOnlyRecurringIds,
    items.map((r) => r.id),
  );
});

test("goals, limits, and debts survive a partial snapshot and remain queued for upload", () => {
  const localGoal = goal("goal-local");
  const localBudget = budget("groceries");
  const localDebt = debt("debt-local");
  const remote = {
    ...sync([]),
    savingsGoals: [goal("goal-remote")],
    categoryBudgets: [budget("transport")],
    debts: [debt("debt-remote")],
  };
  const merged = mergeSyncPayload(
    [],
    getDefaultCategories(),
    {
      savingsGoals: [localGoal],
      categoryBudgets: [localBudget],
      recurringTransactions: [],
      debts: [localDebt],
      moneySetup: emptyMoneySetup(),
    },
    remote,
    "2026-09-22T11:00:00.000Z",
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    new Set(),
    undefined,
    new Set(),
    new Set(),
    new Set(),
  );
  assert.deepEqual(
    new Set(merged.savingsGoals.map((item) => item.id)),
    new Set(["goal-local", "goal-remote"]),
  );
  assert.deepEqual(
    new Set(merged.categoryBudgets.map((item) => item.categoryId)),
    new Set(["groceries", "transport"]),
  );
  assert.deepEqual(
    new Set(merged.debts.map((item) => item.id)),
    new Set(["debt-local", "debt-remote"]),
  );
  assert.deepEqual(merged.localOnlyGoalIds, [localGoal.id]);
  assert.deepEqual(merged.localOnlyBudgetCategoryIds, [localBudget.categoryId]);
  assert.deepEqual(merged.localOnlyDebtIds, [localDebt.id]);
});

test("only a matching server record clears the pending recurring write", () => {
  const item = recurring("pending");
  useStore.setState({ recurringTransactions: [item] });
  useCloudStore.setState({
    pendingRecurringUpdateIds: { [item.id]: item.updatedAt! },
  });
  const remote = {
    ...item,
    amount: 2000,
    updatedAt: "2026-09-22T12:00:00.000Z",
  };
  applyHouseholdSync(sync([remote]), "test-token", { pushLocalOnly: false });
  assert.equal(
    useStore.getState().recurringTransactions[0].amount,
    item.amount,
  );
  assert.ok(useCloudStore.getState().pendingRecurringUpdateIds[item.id]);
  applyHouseholdSync(sync([{ ...remote, amount: item.amount }]), "test-token", {
    pushLocalOnly: false,
  });
  assert.equal(
    useCloudStore.getState().pendingRecurringUpdateIds[item.id],
    undefined,
  );
});

test("confirmed remote deletion is honored and local tombstones win over stale snapshots", () => {
  useStore.setState({
    recurringTransactions: [
      recurring("deleted-remotely"),
      recurring("deleted-locally"),
    ],
  });
  useCloudStore.setState({
    lastSyncedRemoteRecurringIds: ["deleted-remotely"],
    deletedRecurringIds: ["deleted-locally"],
  });
  applyHouseholdSync(
    sync([recurring("deleted-locally"), recurring("other")]),
    "test-token",
    { pushLocalOnly: false },
  );
  assert.deepEqual(
    useStore.getState().recurringTransactions.map((r) => r.id),
    ["other"],
  );
});

test("failed pull after a successful recurring POST must not acknowledge local data as remote", async (t) => {
  const item = recurring("pending");
  useStore.setState({ recurringTransactions: [item] });
  useCloudStore.setState({
    token: "test-token",
    syncBootstrapStatus: "ready",
    pendingRecurringUpdateIds: { [item.id]: item.updatedAt! },
  });
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init?: RequestInit) => {
      if (init?.method === "POST")
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      return new Response(JSON.stringify({ error: "bad_request" }), {
        status: 400,
      });
    },
  );
  await cloudPushRecurring(item);
  assert.equal(
    useCloudStore.getState().pendingRecurringUpdateIds[item.id],
    item.updatedAt,
  );
});

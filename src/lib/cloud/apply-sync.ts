import { defaultVehicleGaragePrefs, resolveRemoteGarage } from "@/lib/vehicle";
import { applyGoalMonthlyToGoal } from "@/lib/planning/analytics";
import { sanitizeRecurringTransactionsSkippedDates } from "@/lib/planning/recurring-skipped";
import { mergeSyncPayload } from "@/lib/cloud/merge-sync";
import { emptyMoneySetup, normalizeMoneySetup, pruneMoneySetupIds } from "@/lib/money-setup";
import { cashOffsetsForViewer } from "@/lib/balance-offsets";
import { repairRecurringLinkedTransactions } from "@/lib/recurring-occurrence";
import {
  cloudPushCategory,
  cloudPushCategoryBudget,
  cloudPushGoal,
  cloudPushDebt,
  cloudPushRecurring,
  cloudPushTransaction,
} from "@/lib/cloud/push";
import type { SyncPayload } from "@/lib/household/types";
import { ensureCloudViewerUserId } from "@/lib/cloud/viewer-identity";
import { useCloudStore } from "@/store/useCloudStore";
import { useStore } from "@/store/useStore";

function emptyPlanningDefaults(sync: SyncPayload): SyncPayload {
  return {
    ...sync,
    memberUserIds: sync.memberUserIds ?? [],
    savingsGoals: sync.savingsGoals ?? [],
    categoryBudgets: sync.categoryBudgets ?? [],
    recurringTransactions: sync.recurringTransactions ?? [],
    debts: sync.debts ?? [],
    moneySetup: sync.moneySetup ?? emptyMoneySetup(),
  };
}

type ApplyHouseholdSyncOptions = {
  replace?: boolean;
  pushLocalOnly?: boolean;
};

/** Слияние с локальными данными — обновление приложения не затирает операции */
export function applyHouseholdSync(
  sync: SyncPayload,
  token: string,
  opts?: ApplyHouseholdSyncOptions,
) {
  const pushLocalOnly = opts?.pushLocalOnly !== false;
  const remote = emptyPlanningDefaults(sync);
  const local = useStore.getState();
  const cloud = useCloudStore.getState();
  const deletedRecurring = new Set(cloud.deletedRecurringIds ?? []);
  const deletedDebts = new Set(cloud.deletedDebtIds ?? []);
  const deletedTransactions = new Set(cloud.deletedTransactionIds ?? []);
  const deletedCategories = new Set(
    (local.deletedCategoryArchive ?? []).map((entry) => entry.category.id),
  );
  const pendingTransactionUpdates = new Set(Object.keys(cloud.pendingTransactionUpdateIds ?? {}));
  const pendingGoalIds = new Set(cloud.pendingGoalIds ?? []);
  const remoteTxIds = new Set(remote.transactions.map((t) => t.id));
  const remoteGoalIds = new Set((remote.savingsGoals ?? []).map((g) => g.id));

  useCloudStore.getState().setSession(token, remote.household);
  useCloudStore.getState().setLastWriteError(null);
  const viewerUserId = ensureCloudViewerUserId(remote.viewerUserId ?? undefined);
  if (remote.memberUserIds.length > 0) {
    useCloudStore.getState().setHouseholdMemberUserIds(remote.memberUserIds);
  }
  const balanceOffsets = remote.balanceOffsets ?? {};
  useCloudStore.getState().setBalanceOffsets(balanceOffsets);
  const syncedOffsets = cashOffsetsForViewer(
    balanceOffsets,
    viewerUserId,
    remote.memberUserIds,
  );
  if (remote.memberUserIds.length > 1) {
    useStore.getState().setHouseholdFilter("all");
  }

  const garage = resolveRemoteGarage(
    remote,
    local.vehicles,
    local.vehiclePrefs ?? defaultVehicleGaragePrefs(),
  );
  const prunedMoneySetup = pruneMoneySetupIds(
    normalizeMoneySetup(remote.moneySetup),
    remote.recurringTransactions ?? [],
    remote.categories,
  );

  if (opts?.replace) {
    const savingsGoals = remote.savingsGoals.map((g) => applyGoalMonthlyToGoal(g));
    const recurringTransactions = sanitizeRecurringTransactionsSkippedDates(
      remote.recurringTransactions ?? [],
      remote.transactions,
    );
    const transactions = repairRecurringLinkedTransactions(
      remote.transactions,
      recurringTransactions,
    );
    useCloudStore.getState().setLastSyncedRemoteTxIds(remote.transactions.map((t) => t.id));
    useCloudStore.getState().setLastSyncedRemoteCategoryIds(remote.categories.map((c) => c.id));
    useCloudStore.getState().setLastSyncedRemoteGoalIds((remote.savingsGoals ?? []).map((g) => g.id));
    useCloudStore.getState().setLastSyncedRemoteBudgetCategoryIds(
      (remote.categoryBudgets ?? []).map((b) => b.categoryId),
    );
    useCloudStore.getState().setLastSyncedRemoteRecurringIds(
      (remote.recurringTransactions ?? []).map((r) => r.id),
    );
    useCloudStore.getState().setLastSyncedRemoteDebtIds((remote.debts ?? []).map((d) => d.id));
    useCloudStore.getState().setDeletedRecurringIds([]);
    useCloudStore.getState().setDeletedDebtIds([]);
    useCloudStore.getState().setDeletedTransactionIds([]);
    useCloudStore.getState().setPendingTransactionUpdateIds({});
    useCloudStore.getState().setPendingGoalIds([]);
    useCloudStore.getState().touchSync();
    useStore.setState({
      transactions,
      categories: remote.categories,
      savingsGoals,
      categoryBudgets: remote.categoryBudgets ?? [],
      recurringTransactions,
      debts: remote.debts ?? [],
      moneySetup: prunedMoneySetup,
      cashOffsetMe: syncedOffsets.cashOffsetMe,
      cashOffsetPartner: syncedOffsets.cashOffsetPartner,
      vehicles: garage.vehicles,
      vehiclePrefs: garage.vehiclePrefs,
    });
    if (remote.memberUserIds.length > 1) {
      useStore.getState().setHouseholdFilter("all");
    }
    return;
  }

  const merged = mergeSyncPayload(
    local.transactions,
    local.categories,
    {
      savingsGoals: local.savingsGoals,
      categoryBudgets: local.categoryBudgets,
      recurringTransactions: local.recurringTransactions,
      debts: local.debts,
      moneySetup: local.moneySetup,
    },
    remote,
    cloud.lastSyncedAt,
    new Set(cloud.lastSyncedRemoteCategoryIds),
    deletedCategories,
    deletedRecurring,
    deletedTransactions,
    deletedDebts,
    pendingTransactionUpdates,
    new Set(cloud.lastSyncedRemoteGoalIds),
    pendingGoalIds,
  );

  const savingsGoals = merged.savingsGoals.map((g) => applyGoalMonthlyToGoal(g));
  const recurringTransactions = sanitizeRecurringTransactionsSkippedDates(
    merged.recurringTransactions,
    merged.transactions,
  );
  const transactions = repairRecurringLinkedTransactions(
    merged.transactions,
    recurringTransactions,
  );
  for (const id of pendingTransactionUpdates) {
    if (remoteTxIds.has(id)) {
      useCloudStore.getState().clearTransactionUpdatePending(id);
    }
  }
  for (const id of pendingGoalIds) {
    if (remoteGoalIds.has(id)) {
      useCloudStore.getState().clearGoalPending(id);
    }
  }

  useStore.setState({
    transactions,
    categories: merged.categories,
    savingsGoals,
    categoryBudgets: merged.categoryBudgets,
    recurringTransactions,
    debts: merged.debts,
    moneySetup: pruneMoneySetupIds(
      normalizeMoneySetup(merged.moneySetup ?? emptyMoneySetup()),
      merged.recurringTransactions,
      merged.categories,
    ),
    cashOffsetMe: syncedOffsets.cashOffsetMe,
    cashOffsetPartner: syncedOffsets.cashOffsetPartner,
    vehicles: garage.vehicles,
    vehiclePrefs: garage.vehiclePrefs,
    // Имена в балансе (userName / partnerName) — только на этом телефоне, не из облака.
    // household.partnerLabel в БД общий для семьи и не подставляется в UI.
  });
  useCloudStore.getState().setLastSyncedRemoteTxIds(remote.transactions.map((t) => t.id));
  useCloudStore.getState().setLastSyncedRemoteCategoryIds(remote.categories.map((c) => c.id));
  useCloudStore.getState().setLastSyncedRemoteGoalIds((remote.savingsGoals ?? []).map((g) => g.id));
  useCloudStore.getState().setLastSyncedRemoteBudgetCategoryIds(
    (remote.categoryBudgets ?? []).map((b) => b.categoryId),
  );
  useCloudStore.getState().setLastSyncedRemoteRecurringIds(
    (remote.recurringTransactions ?? []).map((r) => r.id),
  );
  useCloudStore.getState().setLastSyncedRemoteDebtIds((remote.debts ?? []).map((d) => d.id));

  if (pushLocalOnly) {
    for (const id of merged.localOnlyTransactionIds) {
      const tx = merged.transactions.find((t) => t.id === id);
      if (tx) void cloudPushTransaction(tx);
    }
    for (const cat of merged.localOnlyCategories) {
      void cloudPushCategory(cat);
    }
    for (const id of merged.localOnlyGoalIds) {
      const goal = savingsGoals.find((g) => g.id === id);
      if (goal) void cloudPushGoal(goal);
    }
    for (const categoryId of merged.localOnlyBudgetCategoryIds) {
      const budget = merged.categoryBudgets.find((b) => b.categoryId === categoryId);
      if (budget) void cloudPushCategoryBudget(budget);
    }
    for (const id of merged.localOnlyRecurringIds) {
      if (deletedRecurring.has(id)) continue;
      const item = merged.recurringTransactions.find((r) => r.id === id);
      if (item) void cloudPushRecurring(item);
    }
    for (const id of merged.localOnlyDebtIds) {
      const item = merged.debts.find((d) => d.id === id);
      if (item) void cloudPushDebt(item);
    }
  }
}

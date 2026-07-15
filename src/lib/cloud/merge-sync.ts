import { migrateCategoryId, sanitizeCategories } from "@/lib/categories";
import type { SyncPayload } from "@/lib/household/types";
import { emptyMoneySetup, normalizeMoneySetup, type MoneySetup } from "@/lib/money-setup";
import type { CategoryDefinition, Transaction } from "@/types";
import type { CategoryBudget, DebtItem, RecurringTransaction, SavingsGoal } from "@/types/planning";

function txTime(tx: Transaction): number {
  const updated = tx.updatedAt ? Date.parse(tx.updatedAt) : NaN;
  if (!Number.isNaN(updated)) return updated;
  const d = Date.parse(tx.date);
  return Number.isNaN(d) ? 0 : d;
}

function itemTime(item: { updatedAt?: string | null }): number {
  const updated = item.updatedAt ? Date.parse(item.updatedAt) : NaN;
  return Number.isNaN(updated) ? 0 : updated;
}

function normalizeTx(tx: Transaction): Transaction {
  return {
    ...tx,
    categoryId: migrateCategoryId(tx.categoryId),
    owner: tx.owner === "partner" ? "partner" : "me",
    confirmed: tx.confirmed !== false,
    recurringId: tx.recurringId ?? null,
  };
}

export function mergeTransactions(
  local: Transaction[],
  remote: Transaction[],
  lastSyncedAt?: string | null,
  deletedTransactionIds?: ReadonlySet<string>,
  pendingTransactionUpdateIds?: ReadonlySet<string>,
): Transaction[] {
  const lastSyncedMs = lastSyncedAt ? Date.parse(lastSyncedAt) : NaN;
  if (remote.length === 0) {
    return local
      .filter((tx) => !deletedTransactionIds?.has(tx.id))
      .map(normalizeTx)
      .sort((a, b) => {
        const byDate = b.date.localeCompare(a.date);
        if (byDate !== 0) return byDate;
        return b.id.localeCompare(a.id);
      });
  }
  const map = new Map<string, Transaction>();

  for (const raw of remote) {
    const tx = normalizeTx(raw);
    if (deletedTransactionIds?.has(tx.id)) continue;
    map.set(tx.id, tx);
  }

  for (const raw of local) {
    const tx = normalizeTx(raw);
    if (deletedTransactionIds?.has(tx.id)) continue;
    const existing = map.get(tx.id);
    if (!existing) {
      if (pendingTransactionUpdateIds?.has(tx.id)) {
        map.set(tx.id, tx);
        continue;
      }
      if (!Number.isNaN(lastSyncedMs) && txTime(tx) <= lastSyncedMs) continue;
      map.set(tx.id, tx);
      continue;
    }
    if (txTime(tx) >= txTime(existing)) {
      map.set(tx.id, tx);
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) return byDate;
    return b.id.localeCompare(a.id);
  });
}

export function mergeCategories(
  local: CategoryDefinition[],
  remote: CategoryDefinition[],
  _previouslySyncedRemoteIds?: ReadonlySet<string>,
  deletedCategoryIds?: ReadonlySet<string>,
): CategoryDefinition[] {
  if (remote.length === 0) {
    return sanitizeCategories(
      deletedCategoryIds?.size
        ? local.filter((category) => !deletedCategoryIds.has(category.id))
        : local,
    );
  }
  const filteredLocal = deletedCategoryIds?.size
    ? local.filter((category) => !deletedCategoryIds.has(category.id))
    : local;
  const filteredRemote = deletedCategoryIds?.size
    ? remote.filter((category) => !deletedCategoryIds.has(category.id))
    : remote;
  const remoteIds = new Set(filteredRemote.map((c) => c.id));
  const localById = new Map(filteredLocal.map((c) => [c.id, c]));
  const merged: CategoryDefinition[] = [];

  for (const remoteCat of filteredRemote) {
    const localCat = localById.get(remoteCat.id);
    if (!localCat) {
      merged.push(remoteCat);
      continue;
    }
    merged.push({
      ...remoteCat,
      labels: {
        ru: localCat.labels.ru?.trim() || remoteCat.labels.ru,
        en: localCat.labels.en?.trim() || remoteCat.labels.en,
      },
      keywords: [...new Set([...(remoteCat.keywords ?? []), ...(localCat.keywords ?? [])])],
      isSystem: remoteCat.isSystem ?? localCat.isSystem,
    });
  }

  for (const localCat of filteredLocal) {
    if (remoteIds.has(localCat.id)) continue;
    merged.push(localCat);
  }

  return sanitizeCategories(merged);
}

function mergeByKey<T extends { updatedAt?: string }>(
  local: T[],
  remote: T[],
  getKey: (item: T) => string,
  lastSyncedAt?: string | null,
): T[] {
  const lastSyncedMs = lastSyncedAt ? Date.parse(lastSyncedAt) : NaN;
  if (remote.length === 0) {
    return [...local];
  }
  const map = new Map<string, T>();

  for (const item of remote) {
    map.set(getKey(item), item);
  }

  for (const item of local) {
    const key = getKey(item);
    const existing = map.get(key);
    if (!existing) {
      if (!Number.isNaN(lastSyncedMs) && itemTime(item) <= lastSyncedMs) continue;
      map.set(key, item);
      continue;
    }
    if (itemTime(item) >= itemTime(existing)) {
      map.set(key, item);
    }
  }

  return Array.from(map.values());
}

/** Цели, лимиты, регулярные: локальное не удаляем, если в облаке пусто или push не дошёл. */
function mergePlanningByKey<T extends { updatedAt?: string }>(
  local: T[],
  remote: T[],
  getKey: (item: T) => string,
  lastSyncedAt?: string | null,
  pendingIds?: ReadonlySet<string>,
): T[] {
  const lastSyncedMs = lastSyncedAt ? Date.parse(lastSyncedAt) : NaN;
  const map = new Map<string, T>();

  for (const item of remote) {
    map.set(getKey(item), item);
  }

  for (const item of local) {
    const key = getKey(item);
    const existing = map.get(key);
    if (!existing) {
      if (pendingIds?.has(key)) {
        map.set(key, item);
        continue;
      }
      if (!Number.isNaN(lastSyncedMs) && itemTime(item) <= lastSyncedMs) continue;
      map.set(key, item);
      continue;
    }
    if (itemTime(item) >= itemTime(existing)) {
      map.set(key, item);
    }
  }

  return Array.from(map.values());
}

function hasMeaningfulMoneySetup(setup: MoneySetup): boolean {
  return Boolean(
    setup.nextIncomeDate ||
      setup.expectedIncomeAmount != null ||
      setup.incomeSources.length > 0 ||
      setup.essentialCategoryIds.length > 0 ||
      setup.requiredRecurringIds.length > 0 ||
      setup.hasNoRequiredFixedExpenses ||
      setup.useHouseholdBalance,
  );
}

export function mergeMoneySetup(
  localRaw: MoneySetup | undefined,
  remoteRaw: MoneySetup | undefined,
): MoneySetup {
  const local = normalizeMoneySetup(localRaw ?? emptyMoneySetup());
  const remote = normalizeMoneySetup(remoteRaw ?? emptyMoneySetup());

  const localHasData = hasMeaningfulMoneySetup(local);
  const remoteHasData = hasMeaningfulMoneySetup(remote);
  if (localHasData && !remoteHasData) return local;
  if (remoteHasData && !localHasData) return remote;

  const localUpdated = itemTime(local);
  const remoteUpdated = itemTime(remote);
  if (remoteUpdated > localUpdated) return remote;
  if (localUpdated > remoteUpdated) return local;

  if (remote.incomeSources.length > local.incomeSources.length) return remote;
  if (local.incomeSources.length > remote.incomeSources.length) return local;
  return remoteHasData ? remote : local;
}

export function mergeSavingsGoals(
  local: SavingsGoal[],
  remote: SavingsGoal[],
  lastSyncedAt?: string | null,
  pendingIds?: ReadonlySet<string>,
): SavingsGoal[] {
  return mergePlanningByKey(local, remote, (g) => g.id, lastSyncedAt, pendingIds);
}

export function mergeCategoryBudgets(
  local: CategoryBudget[],
  remote: CategoryBudget[],
  lastSyncedAt?: string | null,
): CategoryBudget[] {
  return mergePlanningByKey(
    local.map((b) => ({ ...b, categoryId: migrateCategoryId(b.categoryId) })),
    remote.map((b) => ({ ...b, categoryId: migrateCategoryId(b.categoryId) })),
    (b) => b.categoryId,
    lastSyncedAt,
  );
}

export function mergeRecurringTransactions(
  local: RecurringTransaction[],
  remote: RecurringTransaction[],
  lastSyncedAt?: string | null,
  deletedIds?: ReadonlySet<string>,
): RecurringTransaction[] {
  const merged = mergeByKey(
    local.map((r) => ({ ...r, categoryId: migrateCategoryId(r.categoryId) })),
    remote.map((r) => ({ ...r, categoryId: migrateCategoryId(r.categoryId) })),
    (r) => r.id,
    lastSyncedAt,
  );
  if (!deletedIds?.size) return merged;
  return merged.filter((r) => !deletedIds.has(r.id));
}

export function mergeDebts(
  local: DebtItem[],
  remote: DebtItem[],
  lastSyncedAt?: string | null,
  deletedIds?: ReadonlySet<string>,
): DebtItem[] {
  const merged = mergeByKey(local, remote, (d) => d.id, lastSyncedAt);
  if (!deletedIds?.size) return merged;
  return merged.filter((d) => !deletedIds.has(d.id));
}

export interface MergedSyncResult {
  transactions: Transaction[];
  categories: CategoryDefinition[];
  savingsGoals: SavingsGoal[];
  categoryBudgets: CategoryBudget[];
  recurringTransactions: RecurringTransaction[];
  debts: DebtItem[];
  moneySetup: MoneySetup;
  localOnlyTransactionIds: string[];
  localOnlyCategories: CategoryDefinition[];
  localOnlyGoalIds: string[];
  localOnlyBudgetCategoryIds: string[];
  localOnlyRecurringIds: string[];
  localOnlyDebtIds: string[];
}

export interface PlanningLocalState {
  savingsGoals: SavingsGoal[];
  categoryBudgets: CategoryBudget[];
  recurringTransactions: RecurringTransaction[];
  debts: DebtItem[];
  moneySetup?: MoneySetup;
}

export interface PreviouslySyncedPlanning {
  goalIds?: ReadonlySet<string>;
  budgetCategoryIds?: ReadonlySet<string>;
  recurringIds?: ReadonlySet<string>;
  debtIds?: ReadonlySet<string>;
}

export function mergeSyncPayload(
  localTransactions: Transaction[],
  localCategories: CategoryDefinition[],
  localPlanning: PlanningLocalState,
  remote: SyncPayload,
  lastSyncedAt?: string | null,
  previouslySyncedRemoteCategoryIds?: ReadonlySet<string>,
  deletedCategoryIds?: ReadonlySet<string>,
  deletedRecurringIds?: ReadonlySet<string>,
  deletedTransactionIds?: ReadonlySet<string>,
  deletedDebtIds?: ReadonlySet<string>,
  pendingTransactionUpdateIds?: ReadonlySet<string>,
  pendingGoalIds?: ReadonlySet<string>,
): MergedSyncResult {
  const lastSyncedMs = lastSyncedAt ? Date.parse(lastSyncedAt) : NaN;
  const remoteTxIds = new Set(remote.transactions.map((t) => t.id));
  const remoteCategoryIds = new Set(
    (deletedCategoryIds?.size
      ? remote.categories.filter((c) => !deletedCategoryIds.has(c.id))
      : remote.categories).map((c) => c.id),
  );
  const remoteGoalIds = new Set((remote.savingsGoals ?? []).map((g) => g.id));
  const remoteBudgetIds = new Set((remote.categoryBudgets ?? []).map((b) => b.categoryId));
  const remoteRecurringIds = new Set((remote.recurringTransactions ?? []).map((r) => r.id));
  const remoteDebtIds = new Set((remote.debts ?? []).map((d) => d.id));

  const transactions = mergeTransactions(
    localTransactions,
    remote.transactions,
    lastSyncedAt,
    deletedTransactionIds,
    pendingTransactionUpdateIds,
  );
  const categories = mergeCategories(
    localCategories,
    remote.categories,
    previouslySyncedRemoteCategoryIds,
    deletedCategoryIds,
  );
  const savingsGoals = mergeSavingsGoals(
    localPlanning.savingsGoals,
    remote.savingsGoals ?? [],
    lastSyncedAt,
    pendingGoalIds,
  );
  const categoryBudgets = mergeCategoryBudgets(
    localPlanning.categoryBudgets,
    remote.categoryBudgets ?? [],
    lastSyncedAt,
  );
  const recurringTransactions = mergeRecurringTransactions(
    localPlanning.recurringTransactions,
    remote.recurringTransactions ?? [],
    lastSyncedAt,
    deletedRecurringIds,
  );
  const debts = mergeDebts(localPlanning.debts, remote.debts ?? [], lastSyncedAt, deletedDebtIds);
  const moneySetup = mergeMoneySetup(localPlanning.moneySetup, remote.moneySetup);

  const localOnlyTransactionIds = localTransactions
    .map((t) => t.id)
    .filter((id) => {
      if (remoteTxIds.has(id)) return false;
      if (deletedTransactionIds?.has(id)) return false;
      if (pendingTransactionUpdateIds?.has(id)) return true;
      const tx = localTransactions.find((item) => item.id === id);
      if (tx && !Number.isNaN(lastSyncedMs) && txTime(tx) <= lastSyncedMs) return false;
      return true;
    });
  const localOnlyCategories = localCategories.filter((c) => {
    if (deletedCategoryIds?.has(c.id)) return false;
    if (remoteCategoryIds.has(c.id)) return false;
    if (previouslySyncedRemoteCategoryIds?.has(c.id)) return false;
    return true;
  });
  const localOnlyGoalIds = localPlanning.savingsGoals
    .filter((g) => {
      if (pendingGoalIds?.has(g.id)) return true;
      return Number.isNaN(lastSyncedMs) || itemTime(g) > lastSyncedMs;
    })
    .map((g) => g.id)
    .filter((id) => !remoteGoalIds.has(id));
  const localOnlyBudgetCategoryIds = localPlanning.categoryBudgets
    .filter((b) => Number.isNaN(lastSyncedMs) || itemTime(b) > lastSyncedMs)
    .map((b) => b.categoryId)
    .filter((id) => !remoteBudgetIds.has(id));
  const localOnlyRecurringIds = localPlanning.recurringTransactions
    .filter((item) => {
      if (remoteRecurringIds.has(item.id)) return false;
      if (deletedRecurringIds?.has(item.id)) return false;
      if (!Number.isNaN(lastSyncedMs) && itemTime(item) <= lastSyncedMs) return false;
      return true;
    })
    .map((r) => r.id);
  const localOnlyDebtIds = localPlanning.debts
    .filter((item) => {
      if (remoteDebtIds.has(item.id)) return false;
      if (deletedDebtIds?.has(item.id)) return false;
      if (!Number.isNaN(lastSyncedMs) && itemTime(item) <= lastSyncedMs) return false;
      return true;
    })
    .map((d) => d.id);

  return {
    transactions,
    categories,
    savingsGoals,
    categoryBudgets,
    recurringTransactions,
    debts,
    moneySetup,
    localOnlyTransactionIds,
    localOnlyCategories,
    localOnlyGoalIds,
    localOnlyBudgetCategoryIds,
    localOnlyRecurringIds,
    localOnlyDebtIds,
  };
}

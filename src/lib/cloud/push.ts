import type { CategoryBudget, DebtItem, RecurringTransaction, SavingsGoal } from "@/types/planning";
import {
  apiImportLocal,
  apiCreateTransaction,
  apiDeleteCategory,
  apiDeleteCategoryBudget,
  apiDeleteDebt,
  apiDeleteGoal,
  apiDeleteRecurring,
  apiDeleteTransaction,
  apiPatchBalanceOffset,
  apiPatchMoneySetup,
  apiPatchPartnerLabel,
  apiUpdateTransaction,
  apiUpsertCategory,
  apiUpsertCategoryBudget,
  apiUpsertDebt,
  apiUpsertGoal,
  apiUpsertRecurring,
} from "@/lib/cloud/client";
import { applyHouseholdSync } from "@/lib/cloud/apply-sync";
import { apiDeleteGarage, apiPutGarage, apiSync } from "@/lib/cloud/client";
import { isCloudPaused } from "@/lib/cloud/cloud-pause";
import { isCloudRestoreInProgress } from "@/lib/cloud/restore-lock";
import type { Vehicle, VehicleGaragePrefs } from "@/types/vehicle";
import { isAuthSyncError, isSubscriptionSyncError } from "@/lib/cloud/sync-errors";
import {
  decodeUserIdFromHouseholdToken,
  findHouseholdPartnerUserId,
} from "@/lib/cloud/viewer-identity";
import { hasCloudAuth } from "@/lib/cloud/auth-payload";
import { useCloudStore } from "@/store/useCloudStore";
import { useStore } from "@/store/useStore";
import type { MoneySetup } from "@/lib/money-setup";
import type { BudgetOwner, CategoryDefinition, Transaction, TxType } from "@/types";

function noteCloudWriteError(message: string): void {
  useCloudStore.getState().setLastWriteError(message);
}

function token(): string | null {
  if (isCloudPaused() || isCloudRestoreInProgress()) return null;
  return useCloudStore.getState().token;
}

async function resolveWritableToken(): Promise<string | null> {
  const bootstrapStatus = useCloudStore.getState().syncBootstrapStatus;
  if (bootstrapStatus === "checking") return null;
  const current = token();
  if (current) return current;
  if (isCloudPaused() || isCloudRestoreInProgress()) return null;
  if (!hasCloudAuth() && !useCloudStore.getState().token) return null;
  const refreshed = await refreshWritableToken();
  return refreshed ?? token();
}

async function refreshWritableToken(): Promise<string | null> {
  if (isCloudPaused() || isCloudRestoreInProgress()) return null;
  const { refreshCloudSessionFromTelegram } = await import("@/lib/cloud/bootstrap");
  const ok = await refreshCloudSessionFromTelegram();
  if (!ok) return null;
  return token();
}

async function retryAfterAuthError(error: unknown): Promise<string | null> {
  if (!isAuthSyncError(error)) return null;
  return refreshWritableToken();
}

export function isCloudSyncActive(): boolean {
  return Boolean(token());
}

async function pullCloudAfterWrite(): Promise<void> {
  const t = token();
  if (!t) return;
  try {
    const res = await apiSync(t);
    applyHouseholdSync(res.sync, t);
    useCloudStore.getState().touchSync();
  } catch {
    /* retry on next poll */
  }
}

async function pushCurrentTransactionsSnapshot(
  t: string,
  opts?: { includePlanning?: boolean; replaceTransactions?: boolean },
): Promise<void> {
  const local = useStore.getState();
  const res = await apiImportLocal(t, {
    transactions: local.transactions,
    categories: local.categories,
    replaceTransactions: opts?.replaceTransactions ?? true,
    ...(opts?.includePlanning
      ? {
          savingsGoals: local.savingsGoals,
          categoryBudgets: local.categoryBudgets,
          recurringTransactions: local.recurringTransactions,
          debts: local.debts,
          moneySetup: local.moneySetup,
        }
      : {}),
  });
  applyHouseholdSync(res.sync, t, { replace: true });
  useCloudStore.getState().setDeletedTransactionIds([]);
  useCloudStore.getState().setPendingTransactionUpdateIds({});
  useCloudStore.getState().setLastWriteError(null);
  useCloudStore.getState().touchSync();
}

export async function cloudPushTransaction(
  tx: Transaction,
  opts?: { skipPull?: boolean },
): Promise<void> {
  const t = await resolveWritableToken();
  if (!t) return;
  useCloudStore.getState().setLastWriteError(null);
  try {
    const res = await apiCreateTransaction(t, tx);
    applyHouseholdSync(res.sync, t);
  } catch (e) {
    const refreshedToken = await retryAfterAuthError(e);
    if (refreshedToken) {
      try {
        const res = await apiCreateTransaction(refreshedToken, tx);
        applyHouseholdSync(res.sync, refreshedToken);
        return;
      } catch (retryError) {
        e = retryError;
      }
    }
    const msg = e instanceof Error ? e.message : "sync_failed";
    noteCloudWriteError(isSubscriptionSyncError(e) ? "subscription_required" : msg);
    /* локальная операция остаётся; apply-sync дотолкнет localOnly */
  }
}

/** Пара переводов — один pull после обеих записей, чтобы не затереть createdBy партнёра. */
export async function cloudPushPartnerTransferPair(
  expense: Transaction,
  income: Transaction,
): Promise<void> {
  const t = await resolveWritableToken();
  if (!t) return;
  useCloudStore.getState().setLastWriteError(null);
  try {
    const expenseRes = await apiCreateTransaction(t, expense);
    applyHouseholdSync(expenseRes.sync, t);
    const incomeRes = await apiCreateTransaction(t, income);
    applyHouseholdSync(incomeRes.sync, t);
  } catch (e) {
    const refreshedToken = await retryAfterAuthError(e);
    if (!refreshedToken) {
      const msg = e instanceof Error ? e.message : "sync_failed";
      noteCloudWriteError(isSubscriptionSyncError(e) ? "subscription_required" : msg);
      return;
    }
    try {
      const expenseRes = await apiCreateTransaction(refreshedToken, expense);
      applyHouseholdSync(expenseRes.sync, refreshedToken);
      const incomeRes = await apiCreateTransaction(refreshedToken, income);
      applyHouseholdSync(incomeRes.sync, refreshedToken);
    } catch (retryError) {
      const msg = retryError instanceof Error ? retryError.message : "sync_failed";
      noteCloudWriteError(isSubscriptionSyncError(retryError) ? "subscription_required" : msg);
    }
  }
}

export async function cloudPushTransactionUpdate(
  id: string,
  patch: Partial<
    Pick<
      Transaction,
      | "amount"
      | "categoryId"
      | "date"
      | "owner"
      | "createdBy"
      | "type"
      | "goalId"
      | "goalAmount"
      | "odometerKm"
      | "fuelLiters"
      | "vehicleId"
      | "note"
    >
  >,
  opts?: { skipPull?: boolean },
): Promise<void> {
  const t = await resolveWritableToken();
  if (!t) return;
  try {
    const res = await apiUpdateTransaction(t, id, patch);
    applyHouseholdSync(res.sync, t);
    useCloudStore.getState().clearTransactionUpdatePending(id);
    if (opts?.skipPull) return;
  } catch (e) {
    const refreshedToken = await retryAfterAuthError(e);
    if (!refreshedToken) return;
    try {
      const res = await apiUpdateTransaction(refreshedToken, id, patch);
      applyHouseholdSync(res.sync, refreshedToken);
      useCloudStore.getState().clearTransactionUpdatePending(id);
    } catch {
      /* retry on next sync */
    }
  }
}

export async function cloudPushTransactionDelete(id: string): Promise<void> {
  const t = await resolveWritableToken();
  if (!t) return;
  try {
    const res = await apiDeleteTransaction(t, id);
    applyHouseholdSync(res.sync, t);
    useCloudStore.getState().clearTransactionUpdatePending(id);
  } catch (e) {
    const refreshedToken = await retryAfterAuthError(e);
    if (!refreshedToken) return;
    try {
      const res = await apiDeleteTransaction(refreshedToken, id);
      applyHouseholdSync(res.sync, refreshedToken);
      useCloudStore.getState().clearTransactionUpdatePending(id);
    } catch {
      /* retry on next sync */
    }
  }
}

export async function cloudPushPartnerLabel(name: string | null): Promise<void> {
  const t = await resolveWritableToken();
  if (!t) return;
  try {
    await apiPatchPartnerLabel(t, name);
  } catch {
    /* ignore */
  }
}

export async function cloudPushMoneySetup(setup: MoneySetup): Promise<void> {
  const t = await resolveWritableToken();
  if (!t) return;
  try {
    const res = await apiPatchMoneySetup(t, setup);
    applyHouseholdSync(res.sync, t);
    useCloudStore.getState().touchSync();
  } catch {
    /* ignore */
  }
}

export async function cloudPushCategory(cat: CategoryDefinition): Promise<void> {
  const t = await resolveWritableToken();
  if (!t) return;
  try {
    await apiUpsertCategory(t, cat);
  } catch {
    /* offline / retry on next pull */
  }
}

export async function cloudPushCategoryDelete(id: string): Promise<void> {
  const t = await resolveWritableToken();
  if (!t) return;
  try {
    await apiDeleteCategory(t, id);
  } catch {
    /* ignore */
  }
}

export async function cloudPushGoal(goal: SavingsGoal): Promise<void> {
  const t = await resolveWritableToken();
  if (!t) return;
  useCloudStore.getState().markGoalPending(goal.id);
  try {
    await apiUpsertGoal(t, goal);
    await pullCloudAfterWrite();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "sync_failed";
    noteCloudWriteError(isSubscriptionSyncError(e) ? "subscription_required" : msg);
    /* ignore — цель остаётся локально, push повторится как localOnly */
  }
}

export async function cloudPushGoalDelete(id: string): Promise<void> {
  const t = await resolveWritableToken();
  if (!t) return;
  useCloudStore.getState().clearGoalPending(id);
  try {
    await apiDeleteGoal(t, id);
  } catch {
    /* ignore */
  }
}

export async function cloudPushCategoryBudget(budget: CategoryBudget): Promise<void> {
  const t = await resolveWritableToken();
  if (!t) return;
  try {
    await apiUpsertCategoryBudget(t, budget);
    await pullCloudAfterWrite();
  } catch {
    /* ignore */
  }
}

export async function cloudPushCategoryBudgetDelete(categoryId: string): Promise<void> {
  const t = await resolveWritableToken();
  if (!t) return;
  try {
    await apiDeleteCategoryBudget(t, categoryId);
  } catch {
    /* ignore */
  }
}

export async function cloudPushRecurring(item: RecurringTransaction): Promise<void> {
  const t = await resolveWritableToken();
  if (!t) return;
  try {
    await apiUpsertRecurring(t, item);
  } catch {
    /* ignore */
  }
}

export async function cloudPushRecurringDelete(id: string): Promise<void> {
  const t = await resolveWritableToken();
  if (!t) return;
  try {
    await apiDeleteRecurring(t, id);
  } catch {
    /* ignore */
  }
}

export async function cloudPushDebt(item: DebtItem): Promise<void> {
  const t = await resolveWritableToken();
  if (!t) return;
  try {
    await apiUpsertDebt(t, item);
  } catch {
    /* ignore — долг останется локально и дотолкнётся при следующем pull */
  }
}

export async function cloudPushDebtDelete(id: string): Promise<void> {
  const t = await resolveWritableToken();
  if (!t) return;
  try {
    await apiDeleteDebt(t, id);
  } catch {
    /* ignore */
  }
}

export async function cloudPushGarage(
  vehicles: Vehicle[],
  vehiclePrefs: VehicleGaragePrefs,
): Promise<void> {
  const t = await resolveWritableToken();
  if (!t) return;
  try {
    const res = await apiPutGarage(t, vehicles, vehiclePrefs);
    applyHouseholdSync(res.sync, t);
    useCloudStore.getState().touchSync();
  } catch {
    /* offline */
  }
}

export async function cloudDeleteGarage(): Promise<void> {
  const t = await resolveWritableToken();
  if (!t) return;
  try {
    const res = await apiDeleteGarage(t);
    applyHouseholdSync(res.sync, t);
    useCloudStore.getState().touchSync();
  } catch {
    /* offline */
  }
}

/** Баланс "реально в кармане" синхронизируется как replace-offset на userId. */
export async function cloudPushBalanceOffset(
  owner: BudgetOwner,
  offset: number,
): Promise<void> {
  const t = await resolveWritableToken();
  if (!t) return;

  const viewerUserId =
    useCloudStore.getState().cloudUserId ?? decodeUserIdFromHouseholdToken(t);
  if (!viewerUserId) return;

  const targetUserId =
    owner === "me"
      ? viewerUserId
      : findHouseholdPartnerUserId(
          viewerUserId,
          useCloudStore.getState().householdMemberUserIds,
          useStore.getState().transactions,
        );
  if (!targetUserId) return;

  try {
    const res = await apiPatchBalanceOffset(t, targetUserId, offset);
    applyHouseholdSync(res.sync, t);
    useCloudStore.getState().touchSync();
  } catch {
    /* keep local offset; polling/manual retry will reconcile later */
  }
}

export type { BudgetOwner, TxType };

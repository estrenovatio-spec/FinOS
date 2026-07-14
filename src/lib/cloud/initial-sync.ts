import { emptyMoneySetup, normalizeMoneySetup } from "@/lib/money-setup";
import type { SyncPayload } from "@/lib/household/types";
import type { CategoryDefinition, Transaction } from "@/types";
import type { CategoryBudget, DebtItem, RecurringTransaction, SavingsGoal } from "@/types/planning";
import type { MoneySetup } from "@/lib/money-setup";

export type InitialSyncDecision =
  | "download_cloud"
  | "upload_local"
  | "merge"
  | "no_action";

export type SyncBootstrapStatus =
  | "idle"
  | "checking"
  | "hydrating"
  | "ready"
  | "error";

export type MeaningfulLocalState = {
  transactions: Transaction[];
  categories: CategoryDefinition[];
  savingsGoals: SavingsGoal[];
  categoryBudgets: CategoryBudget[];
  recurringTransactions: RecurringTransaction[];
  debts: DebtItem[];
  moneySetup: MoneySetup;
  cashOffsetMe?: number;
  cashOffsetPartner?: number;
};

function hasMeaningfulMoneySetup(raw: MoneySetup | undefined): boolean {
  const setup = normalizeMoneySetup(raw ?? emptyMoneySetup());
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

function hasCustomCategories(categories: CategoryDefinition[]): boolean {
  return categories.some((category) => !category.isSystem);
}

function hasNonZeroBalanceOffset(local: MeaningfulLocalState): boolean {
  return Boolean((local.cashOffsetMe ?? 0) !== 0 || (local.cashOffsetPartner ?? 0) !== 0);
}

export function isMeaningfullyEmptyLocalState(local: MeaningfulLocalState): boolean {
  return !(
    local.transactions.length > 0 ||
    local.savingsGoals.length > 0 ||
    local.categoryBudgets.length > 0 ||
    local.recurringTransactions.length > 0 ||
    local.debts.length > 0 ||
    hasCustomCategories(local.categories) ||
    hasMeaningfulMoneySetup(local.moneySetup) ||
    hasNonZeroBalanceOffset(local)
  );
}

export function isMeaningfullyEmptyCloudSync(sync: SyncPayload | null | undefined): boolean {
  if (!sync) return true;
  const totalBalanceOffsets = Object.values(sync.balanceOffsets ?? {}).reduce(
    (sum, value) => sum + Math.abs(Number(value) || 0),
    0,
  );
  return !(
    sync.transactions.length > 0 ||
    sync.savingsGoals.length > 0 ||
    (sync.categoryBudgets?.length ?? 0) > 0 ||
    (sync.recurringTransactions?.length ?? 0) > 0 ||
    (sync.debts?.length ?? 0) > 0 ||
    hasCustomCategories(sync.categories ?? []) ||
    hasMeaningfulMoneySetup(sync.moneySetup) ||
    totalBalanceOffsets > 0
  );
}

export function resolveInitialSyncDecision(params: {
  localState: MeaningfulLocalState;
  cloudSync: SyncPayload | null | undefined;
}): InitialSyncDecision {
  const localEmpty = isMeaningfullyEmptyLocalState(params.localState);
  const cloudEmpty = isMeaningfullyEmptyCloudSync(params.cloudSync);

  if (localEmpty && !cloudEmpty) return "download_cloud";
  if (!localEmpty && cloudEmpty) return "upload_local";
  if (localEmpty && cloudEmpty) return "no_action";
  return "merge";
}

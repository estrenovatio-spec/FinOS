import { defaultVehicleGaragePrefs, resolveRemoteGarage } from "@/lib/vehicle";
import { applyGoalMonthlyToGoal } from "@/lib/planning/analytics";
import { apiSync } from "@/lib/cloud/client";
import { ensureCloudViewerUserId } from "@/lib/cloud/viewer-identity";
import { useCloudStore } from "@/store/useCloudStore";
import { useStore } from "@/store/useStore";

/** Подменить локальные операции и общее планирование данными с сервера (без слияния). */
export async function forcePullSharedDataFromCloud(): Promise<boolean> {
  const token = useCloudStore.getState().token;
  if (!token) return false;

  const res = await apiSync(token);
  const remote = res.sync;
  ensureCloudViewerUserId(remote.viewerUserId);

  const savingsGoals = (remote.savingsGoals ?? []).map((g) => applyGoalMonthlyToGoal(g));

  useCloudStore.getState().setSession(token, remote.household);
  if (remote.memberUserIds?.length) {
    useCloudStore.getState().setHouseholdMemberUserIds(remote.memberUserIds);
  }
  useCloudStore.getState().touchSync();

  const local = useStore.getState();
  const deletedRecurringIds = new Set(useCloudStore.getState().deletedRecurringIds ?? []);
  useStore.setState({
    transactions: remote.transactions,
    categories: remote.categories,
    savingsGoals,
    categoryBudgets: remote.categoryBudgets ?? [],
    recurringTransactions:
      remote.recurringTransactions?.filter((item) => !deletedRecurringIds.has(item.id)) ??
      local.recurringTransactions,
      ...resolveRemoteGarage(
      remote,
      local.vehicles,
      local.vehiclePrefs ?? defaultVehicleGaragePrefs(),
    ),
  });

  return true;
}

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BalanceOffsetsByUser } from "@/lib/balance-offsets";
import type { HouseholdPublic } from "@/lib/household/types";
import type { AccessSummaryPublic, SubscriptionPublic } from "@/lib/payments/types";
import type { ReferralProfilePublic } from "@/lib/referrals/service";
import { isValidSubscriptionPublic } from "@/lib/billing/subscription-shape";
import type { InitialSyncDecision, SyncBootstrapStatus } from "@/lib/cloud/initial-sync";

interface CloudState {
  token: string | null;
  household: HouseholdPublic | null;
  authEmail: string | null;
  authMethod: "telegram" | "email" | null;
  /** Текущий пользователь в облаке (Telegram → User.id) */
  cloudUserId: string | null;
  householdMemberUserIds: string[];
  /** Корректировки «в кармане» с сервера (общие для семьи) */
  balanceOffsets: BalanceOffsetsByUser;
  subscription: SubscriptionPublic | null;
  accessSummary: AccessSummaryPublic | null;
  referralsEnabled: boolean;
  referralProfile: ReferralProfilePublic | null;
  serverConfigured: boolean | null;
  lastSyncedAt: string | null;
  /** ID операций, которые были в облаке при прошлом pull */
  lastSyncedRemoteTxIds: string[];
  /** ID категорий из облака при прошлом pull */
  lastSyncedRemoteCategoryIds: string[];
  lastSyncedRemoteGoalIds: string[];
  lastSyncedRemoteBudgetCategoryIds: string[];
  lastSyncedRemoteRecurringIds: string[];
  lastSyncedRemoteDebtIds: string[];
  /** Локально удалённые регулярные — не поднимать с облака при merge */
  deletedRecurringIds: string[];
  /** Локально удалённые долги — не поднимать с облака при merge */
  deletedDebtIds: string[];
  /** Локально удалённые операции — не поднимать с облака при merge */
  deletedTransactionIds: string[];
  /** Локальные правки операций, которые ещё нельзя перетирать pull'ом из облака */
  pendingTransactionUpdateIds: Record<string, string>;
  pendingGoalIds: string[];
  /** Последняя ошибка записи в облако (операция остаётся локально) */
  lastWriteError: string | null;
  syncBootstrapStatus: SyncBootstrapStatus;
  lastInitialSyncDecision: InitialSyncDecision | null;
  setServerConfigured: (value: boolean) => void;
  setSyncBootstrapStatus: (status: SyncBootstrapStatus) => void;
  setLastInitialSyncDecision: (decision: InitialSyncDecision | null) => void;
  setAuthIdentity: (identity: {
    email?: string | null;
    authMethod?: "telegram" | "email" | null;
  }) => void;
  setSubscription: (subscription: SubscriptionPublic | null) => void;
  setAccessSummary: (accessSummary: AccessSummaryPublic | null) => void;
  setReferralsEnabled: (enabled: boolean) => void;
  setReferralProfile: (profile: ReferralProfilePublic | null) => void;
  setSession: (token: string, household: HouseholdPublic) => void;
  setCloudUserId: (userId: string | null) => void;
  setHouseholdMemberUserIds: (ids: string[]) => void;
  setBalanceOffsets: (offsets: BalanceOffsetsByUser) => void;
  touchSync: () => void;
  setLastSyncedRemoteTxIds: (ids: string[]) => void;
  setLastSyncedRemoteCategoryIds: (ids: string[]) => void;
  setLastSyncedRemoteGoalIds: (ids: string[]) => void;
  setLastSyncedRemoteBudgetCategoryIds: (ids: string[]) => void;
  setLastSyncedRemoteRecurringIds: (ids: string[]) => void;
  setLastSyncedRemoteDebtIds: (ids: string[]) => void;
  removeFromLastSyncedRemoteTxIds: (id: string) => void;
  removeFromLastSyncedRemoteCategoryIds: (id: string) => void;
  removeFromLastSyncedRemoteGoalIds: (id: string) => void;
  removeFromLastSyncedRemoteBudgetCategoryIds: (categoryId: string) => void;
  removeFromLastSyncedRemoteRecurringIds: (id: string) => void;
  removeFromLastSyncedRemoteDebtIds: (id: string) => void;
  markRecurringDeleted: (id: string) => void;
  setDeletedRecurringIds: (ids: string[]) => void;
  markDebtDeleted: (id: string) => void;
  setDeletedDebtIds: (ids: string[]) => void;
  markTransactionDeleted: (id: string) => void;
  setDeletedTransactionIds: (ids: string[]) => void;
  markTransactionUpdatePending: (id: string, updatedAt?: string) => void;
  clearTransactionUpdatePending: (id: string) => void;
  setPendingTransactionUpdateIds: (ids: Record<string, string>) => void;
  markGoalPending: (id: string) => void;
  clearGoalPending: (id: string) => void;
  setPendingGoalIds: (ids: string[]) => void;
  setLastWriteError: (error: string | null) => void;
  clearSession: () => void;
  /** Drop household token/sync only — keep subscription from latest bootstrap. */
  clearHouseholdSession: () => void;
}

export const useCloudStore = create<CloudState>()(
  persist(
    (set) => ({
      token: null,
      household: null,
      authEmail: null,
      authMethod: null,
      cloudUserId: null,
      householdMemberUserIds: [],
      balanceOffsets: {},
      subscription: null,
      accessSummary: null,
      referralsEnabled: false,
      referralProfile: null,
      serverConfigured: null,
      lastSyncedAt: null,
      lastSyncedRemoteTxIds: [],
      lastSyncedRemoteCategoryIds: [],
      lastSyncedRemoteGoalIds: [],
      lastSyncedRemoteBudgetCategoryIds: [],
      lastSyncedRemoteRecurringIds: [],
      lastSyncedRemoteDebtIds: [],
      deletedRecurringIds: [],
      deletedDebtIds: [],
      deletedTransactionIds: [],
      pendingTransactionUpdateIds: {},
      pendingGoalIds: [],
      lastWriteError: null,
      syncBootstrapStatus: "idle",
      lastInitialSyncDecision: null,
      setServerConfigured: (serverConfigured) => set({ serverConfigured }),
      setSyncBootstrapStatus: (syncBootstrapStatus) => set({ syncBootstrapStatus }),
      setLastInitialSyncDecision: (lastInitialSyncDecision) => set({ lastInitialSyncDecision }),
      setAuthIdentity: ({ email, authMethod }) =>
        set({
          authEmail: email ?? null,
          authMethod: authMethod ?? null,
        }),
      setLastWriteError: (lastWriteError) => set({ lastWriteError }),
      setSubscription: (subscription) => set({ subscription }),
      setAccessSummary: (accessSummary) => set({ accessSummary }),
      setReferralsEnabled: (referralsEnabled) => set({ referralsEnabled }),
      setReferralProfile: (referralProfile) => set({ referralProfile }),
      setSession: (token, household) =>
        set((state) => {
          const sameSession =
            state.token === token && state.household?.id === household.id;
          return {
            token,
            household,
            authEmail: sameSession ? state.authEmail : state.authEmail,
            authMethod: sameSession ? state.authMethod : state.authMethod,
            cloudUserId: sameSession ? state.cloudUserId : null,
            householdMemberUserIds: sameSession ? state.householdMemberUserIds : [],
            deletedRecurringIds: sameSession ? state.deletedRecurringIds : [],
            deletedDebtIds: sameSession ? state.deletedDebtIds : [],
            deletedTransactionIds: sameSession ? state.deletedTransactionIds : [],
            pendingTransactionUpdateIds: sameSession ? state.pendingTransactionUpdateIds : {},
            pendingGoalIds: sameSession ? state.pendingGoalIds : [],
            lastWriteError: null,
            syncBootstrapStatus: sameSession ? state.syncBootstrapStatus : "idle",
            lastInitialSyncDecision: sameSession ? state.lastInitialSyncDecision : null,
          };
        }),
      setCloudUserId: (cloudUserId) => set({ cloudUserId }),
      setHouseholdMemberUserIds: (householdMemberUserIds) => set({ householdMemberUserIds }),
      setBalanceOffsets: (balanceOffsets) => set({ balanceOffsets }),
      touchSync: () => set({ lastSyncedAt: new Date().toISOString() }),
      setLastSyncedRemoteTxIds: (ids) => set({ lastSyncedRemoteTxIds: ids }),
      setLastSyncedRemoteCategoryIds: (ids) => set({ lastSyncedRemoteCategoryIds: ids }),
      setLastSyncedRemoteGoalIds: (ids) => set({ lastSyncedRemoteGoalIds: ids }),
      setLastSyncedRemoteBudgetCategoryIds: (ids) =>
        set({ lastSyncedRemoteBudgetCategoryIds: ids }),
      setLastSyncedRemoteRecurringIds: (ids) => set({ lastSyncedRemoteRecurringIds: ids }),
      setLastSyncedRemoteDebtIds: (ids) => set({ lastSyncedRemoteDebtIds: ids }),
      removeFromLastSyncedRemoteTxIds: (id) =>
        set((s) => ({
          lastSyncedRemoteTxIds: s.lastSyncedRemoteTxIds.filter((x) => x !== id),
        })),
      removeFromLastSyncedRemoteCategoryIds: (id) =>
        set((s) => ({
          lastSyncedRemoteCategoryIds: s.lastSyncedRemoteCategoryIds.filter((x) => x !== id),
        })),
      removeFromLastSyncedRemoteGoalIds: (id) =>
        set((s) => ({
          lastSyncedRemoteGoalIds: s.lastSyncedRemoteGoalIds.filter((x) => x !== id),
        })),
      removeFromLastSyncedRemoteBudgetCategoryIds: (categoryId) =>
        set((s) => ({
          lastSyncedRemoteBudgetCategoryIds: s.lastSyncedRemoteBudgetCategoryIds.filter(
            (x) => x !== categoryId,
          ),
        })),
      removeFromLastSyncedRemoteRecurringIds: (id) =>
        set((s) => ({
          lastSyncedRemoteRecurringIds: s.lastSyncedRemoteRecurringIds.filter((x) => x !== id),
        })),
      removeFromLastSyncedRemoteDebtIds: (id) =>
        set((s) => ({
          lastSyncedRemoteDebtIds: s.lastSyncedRemoteDebtIds.filter((x) => x !== id),
        })),
      markRecurringDeleted: (id) =>
        set((s) => ({
          deletedRecurringIds: s.deletedRecurringIds.includes(id)
            ? s.deletedRecurringIds
            : [...s.deletedRecurringIds, id],
        })),
      setDeletedRecurringIds: (deletedRecurringIds) => set({ deletedRecurringIds }),
      markDebtDeleted: (id) =>
        set((s) => ({
          deletedDebtIds: s.deletedDebtIds.includes(id)
            ? s.deletedDebtIds
            : [...s.deletedDebtIds, id],
        })),
      setDeletedDebtIds: (deletedDebtIds) => set({ deletedDebtIds }),
      markTransactionDeleted: (id) =>
        set((s) => ({
          deletedTransactionIds: s.deletedTransactionIds.includes(id)
            ? s.deletedTransactionIds
            : [...s.deletedTransactionIds, id],
        })),
      setDeletedTransactionIds: (deletedTransactionIds) => set({ deletedTransactionIds }),
      markTransactionUpdatePending: (id, updatedAt) =>
        set((s) => ({
          pendingTransactionUpdateIds: {
            ...s.pendingTransactionUpdateIds,
            [id]: updatedAt ?? new Date().toISOString(),
          },
        })),
      clearTransactionUpdatePending: (id) =>
        set((s) => {
          if (!s.pendingTransactionUpdateIds[id]) return s;
          const next = { ...s.pendingTransactionUpdateIds };
          delete next[id];
          return { pendingTransactionUpdateIds: next };
        }),
      setPendingTransactionUpdateIds: (pendingTransactionUpdateIds) =>
        set({ pendingTransactionUpdateIds }),
      markGoalPending: (id) =>
        set((s) => ({
          pendingGoalIds: s.pendingGoalIds.includes(id)
            ? s.pendingGoalIds
            : [...s.pendingGoalIds, id],
        })),
      clearGoalPending: (id) =>
        set((s) => ({
          pendingGoalIds: s.pendingGoalIds.filter((item) => item !== id),
        })),
      setPendingGoalIds: (pendingGoalIds) => set({ pendingGoalIds }),
      clearSession: () =>
        set({
          token: null,
          household: null,
          authEmail: null,
          authMethod: null,
          cloudUserId: null,
          householdMemberUserIds: [],
          balanceOffsets: {},
          subscription: null,
          accessSummary: null,
          referralsEnabled: false,
          referralProfile: null,
          lastSyncedAt: null,
          lastSyncedRemoteTxIds: [],
          lastSyncedRemoteCategoryIds: [],
          lastSyncedRemoteGoalIds: [],
          lastSyncedRemoteBudgetCategoryIds: [],
          lastSyncedRemoteRecurringIds: [],
          lastSyncedRemoteDebtIds: [],
          deletedRecurringIds: [],
          deletedDebtIds: [],
          deletedTransactionIds: [],
          pendingTransactionUpdateIds: {},
          pendingGoalIds: [],
          lastWriteError: null,
          syncBootstrapStatus: "idle",
          lastInitialSyncDecision: null,
        }),
      clearHouseholdSession: () =>
        set({
          token: null,
          household: null,
          authEmail: null,
          authMethod: null,
          cloudUserId: null,
          householdMemberUserIds: [],
          lastSyncedAt: null,
          lastSyncedRemoteTxIds: [],
          lastSyncedRemoteCategoryIds: [],
          lastSyncedRemoteGoalIds: [],
          lastSyncedRemoteBudgetCategoryIds: [],
          lastSyncedRemoteRecurringIds: [],
          lastSyncedRemoteDebtIds: [],
          deletedRecurringIds: [],
          deletedDebtIds: [],
          deletedTransactionIds: [],
          pendingTransactionUpdateIds: {},
          pendingGoalIds: [],
          lastWriteError: null,
          syncBootstrapStatus: "idle",
          lastInitialSyncDecision: null,
        }),
    }),
    {
      name: "voicebudget-cloud",
      version: 9,
      migrate: (persisted, version) => {
        const state = persisted as CloudState;
        let next = state;
        if (version < 1) {
          next = {
            ...next,
            lastSyncedRemoteGoalIds: [],
            lastSyncedRemoteBudgetCategoryIds: [],
            lastSyncedRemoteRecurringIds: [],
          };
        }
        if (version < 2) {
          next = {
            ...next,
            cloudUserId: next.cloudUserId ?? null,
            householdMemberUserIds: next.householdMemberUserIds ?? [],
          };
        }
        if (version < 3) {
          next = {
            ...next,
            balanceOffsets: next.balanceOffsets ?? {},
          };
        }
        if (version < 4) {
          next = {
            ...next,
            deletedRecurringIds: next.deletedRecurringIds ?? [],
          };
        }
        if (version < 5) {
          next = {
            ...next,
            subscription: isValidSubscriptionPublic(next.subscription)
              ? next.subscription
              : null,
          };
        }
        if (version < 6) {
          next = {
            ...next,
            deletedTransactionIds: next.deletedTransactionIds ?? [],
          };
        }
        if (version < 7) {
          next = {
            ...next,
            lastSyncedRemoteDebtIds: next.lastSyncedRemoteDebtIds ?? [],
            deletedDebtIds: next.deletedDebtIds ?? [],
          };
        }
        if (version < 8) {
          next = {
            ...next,
            authEmail: null,
            authMethod: next.token ? "telegram" : null,
          };
        }
        if (version < 9) {
          next = {
            ...next,
            syncBootstrapStatus: "idle",
            lastInitialSyncDecision: null,
          };
        }
        next = {
          ...next,
          authEmail: next.authEmail ?? null,
            authMethod: next.authMethod ?? null,
            pendingTransactionUpdateIds: next.pendingTransactionUpdateIds ?? {},
            syncBootstrapStatus: next.syncBootstrapStatus ?? "idle",
            lastInitialSyncDecision: next.lastInitialSyncDecision ?? null,
          };
        return next;
      },
      onRehydrateStorage: () => () => {
        void import("@/lib/cloud/apply-balance-offsets").then(({ applyBalanceOffsetsFromCloud }) => {
          applyBalanceOffsetsFromCloud();
        });
      },
    },
  ),
);

export function useIsCloudActive() {
  const token = useCloudStore((s) => s.token);
  const household = useCloudStore((s) => s.household);
  const subscription = useCloudStore((s) => s.subscription);
  if (!token || !household) return false;
  if (subscription?.enforced && !subscription.active) return false;
  return true;
}

export function useSubscriptionRequired() {
  const subscription = useCloudStore((s) => s.subscription);
  return Boolean(subscription?.enforced && !subscription.active);
}

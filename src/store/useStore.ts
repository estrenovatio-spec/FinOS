import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import {
  type CategoryDefinition,
  getDefaultCategories,
  getFallbackCategoryId,
  getCategoryLabel,
  matchCategoryIdFromText,
  normalizeParsedCategory,
  migrateCategoryId,
  refineParsedTransaction,
  sanitizeCategories,
  slugifyCategoryId,
} from "@/lib/categories";
import { bottomNavEnabled } from "@/lib/app-bottom-nav";
import { detectType } from "@/lib/ai";
import { getTrackingStartDate } from "@/lib/budget-analytics";
import {
  clampMonthStartDay,
  getCurrentBudgetPeriod,
  getPreviousBudgetPeriod,
  isDateInBudgetPeriod,
  type BudgetPeriod,
} from "@/lib/budget-period";
import { applyDetectedOwner } from "@/lib/detect-owner";
import {
  DEFAULT_MY_CHIP_COLOR,
  DEFAULT_PARTNER_CHIP_COLOR,
  sanitizeOwnerChipColor,
} from "@/lib/owner-chip-colors";
import { hasPartnerBudget } from "@/lib/owner-labels";
import {
  collectHouseholdMemberUserIds,
  decodeUserIdFromHouseholdToken,
  ensureCloudViewerUserId,
  findHouseholdPartnerUserId,
} from "@/lib/cloud/viewer-identity";
import { countsInBalance, countsInHouseholdTotal } from "@/lib/transaction-confirmed";
import {
  buildPartnerTransferPair,
  isPartnerTransferLike,
  isPartnerTransferPairCandidate,
} from "@/lib/partner-transfer";
import { GOAL_JAR_CATEGORY_ID } from "@/lib/planning/goal-transfer";
import { sanitizeTransactionNote } from "@/lib/transaction-note";
import {
  mapTransactionsForViewer,
  spenderFromViewerOwner,
} from "@/lib/transaction-owner";
import { buildGoalDepositTransaction } from "@/lib/planning/goal-transfer";
import { normalizeAppCurrency } from "@/lib/app-currency";
import { roundMoneyUp } from "@/lib/format-money";
import {
  cloudPushCategory,
  cloudPushCategoryBudget,
  cloudPushCategoryBudgetDelete,
  cloudPushDebt,
  cloudPushDebtDelete,
  cloudPushCategoryDelete,
  cloudPushGoal,
  cloudPushGoalDelete,
  cloudPushRecurring,
  cloudPushRecurringDelete,
  cloudPushPartnerTransferPair,
  cloudPushTransaction,
  cloudPushTransactionDelete,
  cloudPushTransactionUpdate,
  cloudDeleteGarage,
  cloudPushGarage,
} from "@/lib/cloud/push";
import {
  applyGoalDelta,
  normalizeGoalAmount,
  revertTransactionGoal,
} from "@/lib/goal-from-transaction";
import {
  applyGoalMonthlyToGoal,
  defaultEmergencyGoal,
  todayIso,
  advanceRecurringDate,
} from "@/lib/planning/analytics";
import { appendSkippedDate } from "@/lib/planning/recurring-skipped";
import { recurringToParsedTransaction } from "@/lib/planning/recurring-run";
import { useCloudStore } from "@/store/useCloudStore";
import { resolveTransactionAmount } from "@/lib/parse-amount";
import {
  enrichCategoriesWithAiMemory,
  recordAiCorrectionLearning,
  recordAiInputLearning,
} from "@/lib/ai-memory";
import {
  clearCachedMonthlyAnalysis,
} from "@/lib/storage";
import type {
  BudgetOwner,
  HouseholdFilter,
  Locale,
  ParsedTransaction,
  Transaction,
  TxType,
} from "@/types";
import type {
  CategoryBudget,
  DebtItem,
  RecurringFrequency,
  RecurringTransaction,
  SavingsGoal,
} from "@/types/planning";
import { EMERGENCY_GOAL_ID } from "@/types/planning";
import type {
  PendingOdometerPrompt,
  ServiceAlertLevel,
  Vehicle,
  VehicleGaragePrefs,
} from "@/types/vehicle";
import {
  applyFuelOdometer,
  applyVehicleService,
  defaultVehicle,
  defaultVehicleGaragePrefs,
  guessDefaultVehicleId,
  isFuelExpense,
  isVehicleServiceExpense,
  markServiceAlertShown,
  needsVehicleOdometerFlow,
  normalizeVehicleGaragePrefs,
  normalizeVehicles,
  partnerDefaultVehicleIds,
  updateVehicleInList,
} from "@/lib/vehicle";

interface StoreState {
  transactions: Transaction[];
  categories: CategoryDefinition[];
  isRecording: boolean;
  locale: Locale;
  userName: string | null;
  /** Пользователь вручную задал «моё имя» — не перезаписывать из Telegram */
  userNameCustomized: boolean;
  partnerName: string | null;
  /** Пользователь вручную задал имя партнёра в балансе */
  partnerNameCustomized: boolean;
  /** Слова для распознавания партнёра в фразе (на этом телефоне) */
  partnerKeywords: string[];
  setPartnerKeywords: (keywords: string[]) => void;
  businessModeEnabled: boolean;
  passiveIncomeEnabled: boolean;
  liveRatesEnabled: boolean;
  setBusinessModeEnabled: (enabled: boolean) => void;
  setPassiveIncomeEnabled: (enabled: boolean) => void;
  setLiveRatesEnabled: (enabled: boolean) => void;
  /** HEX цвет кружка «я» в списке операций */
  myChipColor: string;
  partnerChipColor: string;
  setMyChipColor: (hex: string) => void;
  setPartnerChipColor: (hex: string) => void;
  entryOwner: BudgetOwner;
  householdFilter: HouseholdFilter;
  trackingStartedAt: string | null;
  reminderEnabled: boolean;
  reminderTime: string;
  reminderWindowStart: string;
  reminderWindowEnd: string;
  reminderLastShownDate: string | null;
  savingsGoals: SavingsGoal[];
  categoryBudgets: CategoryBudget[];
  recurringTransactions: RecurringTransaction[];
  debts: DebtItem[];
  deletedCategoryArchive: {
    id: string;
    deletedAt: string;
    category: CategoryDefinition;
    fallbackCategoryId: string;
    affectedTransactions: Transaction[];
  }[];
  restoreArchivedCategory: (archiveId: string) => boolean;
  vehicles: Vehicle[];
  vehiclePrefs: VehicleGaragePrefs;
  /** Последняя машина в заправке (локально, для подстановки) */
  lastFuelVehicleId: string | null;
  pendingOdometerPrompt: PendingOdometerPrompt | null;
  /** День начала бюджетного месяца (1 = календарный, 25 = с 25-го по 24-е) */
  budgetMonthStartDay: number;
  /** Период для статистики; null = текущий отчётный месяц */
  statsPeriodOverride: { from: string; to: string } | null;
  setStatsPeriodRange: (from: string, to: string) => void;
  resetStatsPeriod: () => void;
  setStatsPreviousBudgetPeriod: () => void;
  /** Блок «Цели и планирование» свёрнут */
  planningPanelCollapsed: boolean;
  setPlanningPanelCollapsed: (collapsed: boolean) => void;
  addTransaction: (
    data: ParsedTransaction,
    transcript?: string,
    opts?: { skipCloudPush?: boolean },
  ) => string;
  updateTransaction: (
    id: string,
    patch: {
      amount?: number;
      categoryId?: string;
      owner?: BudgetOwner;
      createdBy?: string | null;
      type?: TxType;
      goalId?: string | null;
      goalAmount?: number | null;
      odometerKm?: number | null;
      fuelLiters?: number | null;
      vehicleId?: string | null;
      note?: string;
    },
  ) => void;
  deleteTransaction: (id: string, opts?: { skipBusinessLink?: boolean }) => void;
  addVehicle: (name?: string) => void;
  removeVehicleById: (vehicleId: string) => void;
  saveVehicleGarage: (vehicles: Vehicle[], vehiclePrefs?: VehicleGaragePrefs) => void;
  updateVehicleInGarage: (vehicleId: string, patch: Partial<Vehicle>) => void;
  setVehicleGarageMode: (mode: VehicleGaragePrefs["mode"]) => void;
  setVehicleMemberPref: (
    userId: string,
    patch: Partial<import("@/types/vehicle").VehicleMemberPref>,
  ) => void;
  submitOdometerForTransaction: (
    transactionId: string,
    vehicleId: string,
    odometerKm: number,
    fuelLiters?: number | null,
  ) => void;
  dismissServiceAlert: (vehicleId: string, level: ServiceAlertLevel) => void;
  clearPendingOdometer: () => void;
  syncVehicleFromTransaction: (transactionId: string) => void;
  /** Регулярный расход — списать с баланса */
  confirmPendingTransaction: (id: string) => boolean;
  /** Регулярный расход — не было оплаты */
  dismissPendingTransaction: (id: string) => boolean;
  /** Регулярный расход уже внесён вручную — убрать напоминание без долга */
  skipPendingTransaction: (id: string) => boolean;
  setLocale: (locale: Locale) => void;
  setIsRecording: (value: boolean) => void;
  setUserName: (name: string | null) => void;
  setPartnerName: (name: string | null) => void;
  setEntryOwner: (owner: BudgetOwner) => void;
  setHouseholdFilter: (filter: HouseholdFilter) => void;
  /** Корректировка: «реально в кармане» минус сумма по операциям */
  cashOffsetMe: number;
  cashOffsetPartner: number;
  setActualCash: (owner: BudgetOwner, actualAmount: number) => void;
  /** Перевод между мной и партнёром (в общий баланс не входит) */
  transferToPartner: (amount: number, direction: "to_partner" | "from_partner") => boolean;
  setBudgetMonthStartDay: (day: number) => void;
  addCategory: (type: TxType, labelRu: string, labelEn: string, keywords?: string[]) => string | null;
  updateCategory: (
    id: string,
    patch: Partial<Pick<CategoryDefinition, "labels" | "keywords">>,
  ) => void;
  removeCategory: (id: string) => boolean;
  restoreDefaultCategories: () => void;
  clearAll: () => void;
  setReminderEnabled: (enabled: boolean) => void;
  setReminderTime: (time: string) => void;
  setReminderWindowStart: (time: string) => void;
  setReminderWindowEnd: (time: string) => void;
  markReminderShownToday: () => void;
  /** Дата первого входа / начала учёта (для месячного разбора) */
  ensureTrackingStarted: () => void;
  addGoal: (name: string, targetAmount: number, deadline?: string | null) => string;
  updateGoal: (
    id: string,
    patch: { name?: string; targetAmount?: number; deadline?: string | null },
  ) => boolean;
  depositGoal: (id: string, amount: number) => boolean;
  withdrawGoal: (id: string, amount: number) => boolean;
  /** Отменить последнее «в копилку» по цели (если ввели 0 при отложении) */
  revertLastGoalDeposit: (goalId: string) => boolean;
  removeGoal: (id: string) => boolean;
  enableEmergencyFund: (months: 3 | 6) => void;
  setEmergencyMonths: (months: 3 | 6) => void;
  setCategoryBudget: (categoryId: string, monthlyLimit: number) => void;
  removeCategoryBudget: (categoryId: string) => void;
  addRecurring: (
    data: Omit<RecurringTransaction, "id" | "enabled" | "updatedAt">,
  ) => string;
  updateRecurring: (
    id: string,
    patch: Partial<Omit<RecurringTransaction, "id">>,
  ) => void;
  removeRecurring: (id: string) => void;
  addDebt: (data: Omit<DebtItem, "id" | "updatedAt">) => string;
  updateDebt: (id: string, patch: Partial<Omit<DebtItem, "id">>) => void;
  payDebt: (id: string, amount: number) => boolean;
  removeDebt: (id: string) => void;
  processRecurringDue: () => void;
  applyPlanningInput: (
    action: import("@/types/planning").PlanningInputAction,
  ) => boolean;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function withOwner(tx: Transaction): Transaction {
  return { ...tx, owner: tx.owner ?? "me" };
}

function transactionsForCurrentViewer(transactions: Transaction[]): Transaction[] {
  const cloud = useCloudStore.getState();
  const cloudUserId = ensureCloudViewerUserId();
  const householdMemberUserIds = collectHouseholdMemberUserIds(
    cloud.householdMemberUserIds,
    transactions,
    cloudUserId,
  );
  return mapTransactionsForViewer(transactions, cloudUserId, householdMemberUserIds).map(withOwner);
}

function filterByHousehold(transactions: Transaction[], filter: HouseholdFilter): Transaction[] {
  const list = transactionsForCurrentViewer(transactions);
  if (filter === "all") return list;
  return list.filter((tx) => tx.owner === filter);
}

function calcBalance(transactions: Transaction[]): number {
  return transactions.reduce((acc, tx) => {
    if (tx.type === "income") {
      const toGoal = normalizeGoalAmount(tx.goalAmount);
      return acc + tx.amount - toGoal;
    }
    return acc - tx.amount;
  }, 0);
}

function hasManualRecurringPayment(
  transactions: Transaction[],
  item: RecurringTransaction,
  runDate: string,
): boolean {
  const expectedAmount = roundMoneyUp(item.amount);
  const expectedOwner = item.owner ?? "me";
  const recurringName = normalizeRecurringMatchText(item.note);
  return transactions.some(
    (tx) => {
      if (
        tx.confirmed === false ||
        tx.recurringId ||
        tx.date !== runDate ||
        tx.type !== item.type ||
        (tx.owner ?? "me") !== expectedOwner ||
        roundMoneyUp(tx.amount) !== expectedAmount
      ) {
        return false;
      }
      if (tx.categoryId === item.categoryId) return true;
      return hasRecurringNameOverlap(tx.note, recurringName);
    },
  );
}

function normalizeRecurringMatchText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .trim();
}

function hasRecurringNameOverlap(
  transactionNote: string | null | undefined,
  recurringName: string,
): boolean {
  if (!recurringName) return false;
  const txWords = new Set(normalizeRecurringMatchText(transactionNote).split(" ").filter(Boolean));
  if (txWords.size === 0) return false;
  return recurringName
    .split(" ")
    .filter((word) => word.length >= 3)
    .some((word) => txWords.has(word));
}

function pushGarageFromState(get: () => StoreState) {
  const { vehicles, vehiclePrefs } = get();
  void cloudPushGarage(vehicles, vehiclePrefs);
}

function applyVehicleAfterTransaction(
  get: () => StoreState,
  set: (partial: Partial<StoreState> | ((s: StoreState) => Partial<StoreState>)) => void,
  created: Transaction,
) {
  const { vehicles, vehiclePrefs, lastFuelVehicleId } = get();
  if (!needsVehicleOdometerFlow(created, vehicles, vehiclePrefs)) return;

  const viewerUserId = ensureCloudViewerUserId();
  const partnerIds = partnerDefaultVehicleIds(vehiclePrefs, viewerUserId);
  const vehicleId =
    created.vehicleId ??
    guessDefaultVehicleId(vehicles, vehiclePrefs, viewerUserId, partnerIds, lastFuelVehicleId);
  if (!vehicleId) return;

  const kind = isVehicleServiceExpense(created) ? "service" : "fuel";

  if (!created.vehicleId) {
    set((state) => ({
      transactions: state.transactions.map((t) =>
        t.id === created.id ? { ...t, vehicleId } : t,
      ),
    }));
    void cloudPushTransactionUpdate(created.id, { vehicleId });
  }

  const vehicle = vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) {
    set({
      pendingOdometerPrompt: { transactionId: created.id, kind, vehicleId },
    });
    return;
  }

  if (created.odometerKm != null) {
    const nextVehicle =
      kind === "service"
        ? applyVehicleService(vehicle, created.odometerKm)
        : applyFuelOdometer(vehicle, created.odometerKm);
    const nextVehicles = vehicles.map((v) => (v.id === vehicleId ? nextVehicle : v));
    set({
      vehicles: nextVehicles,
      lastFuelVehicleId: kind === "fuel" ? vehicleId : lastFuelVehicleId,
      pendingOdometerPrompt: null,
    });
    pushGarageFromState(get);
    return;
  }

  set({
    pendingOdometerPrompt: { transactionId: created.id, kind, vehicleId },
  });
}

function normalizeIncoming(
  data: ParsedTransaction,
  categories: CategoryDefinition[],
  locale: Locale,
  transcript?: string,
): ParsedTransaction {
  const categoryId = normalizeParsedCategory(
    data.categoryId,
    transcript ?? data.note,
    data.type,
    categories,
  );
  const raw = transcript
    ? resolveTransactionAmount(transcript, data.amount, locale)
    : data.amount;
  return {
    ...data,
    categoryId,
    amount: roundMoneyUp(raw),
    currency: normalizeAppCurrency(data.currency),
  };
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      transactions: [],
      categories: getDefaultCategories(),
      isRecording: false,
      locale: "ru",
      userName: null,
      userNameCustomized: false,
      partnerName: null,
      partnerNameCustomized: false,
      partnerKeywords: [],
      setPartnerKeywords: (partnerKeywords) =>
        set({
          partnerKeywords: partnerKeywords
            .map((k) => k.trim().toLowerCase())
            .filter((k) => k.length >= 2),
        }),
      businessModeEnabled: false,
      passiveIncomeEnabled: false,
      liveRatesEnabled: false,
      setBusinessModeEnabled: (enabled) => set({ businessModeEnabled: enabled }),
      setPassiveIncomeEnabled: (enabled) => set({ passiveIncomeEnabled: enabled }),
      setLiveRatesEnabled: (enabled) => set({ liveRatesEnabled: enabled }),
      myChipColor: DEFAULT_MY_CHIP_COLOR,
      partnerChipColor: DEFAULT_PARTNER_CHIP_COLOR,
      setMyChipColor: (hex) =>
        set({ myChipColor: sanitizeOwnerChipColor(hex, DEFAULT_MY_CHIP_COLOR) }),
      setPartnerChipColor: (hex) =>
        set({
          partnerChipColor: sanitizeOwnerChipColor(hex, DEFAULT_PARTNER_CHIP_COLOR),
        }),
      entryOwner: "me",
      householdFilter: "all",
      trackingStartedAt: null,
      reminderEnabled: false,
      reminderTime: "20:00",
      reminderWindowStart: "18:00",
      reminderWindowEnd: "22:00",
      reminderLastShownDate: null,
      savingsGoals: [],
      categoryBudgets: [],
      recurringTransactions: [],
      debts: [],
      deletedCategoryArchive: [],
      vehicles: [],
      vehiclePrefs: defaultVehicleGaragePrefs(),
      lastFuelVehicleId: null,
      pendingOdometerPrompt: null,
      budgetMonthStartDay: 1,
      statsPeriodOverride: null,
      setStatsPeriodRange: (from, to) => set({ statsPeriodOverride: { from, to } }),
      resetStatsPeriod: () => set({ statsPeriodOverride: null }),
      setStatsPreviousBudgetPeriod: () => {
        const day = get().budgetMonthStartDay;
        const prev = getPreviousBudgetPeriod(day);
        set({ statsPeriodOverride: { from: prev.from, to: prev.to } });
      },
      planningPanelCollapsed: false,
      setPlanningPanelCollapsed: (collapsed) => set({ planningPanelCollapsed: collapsed }),
      cashOffsetMe: 0,
      cashOffsetPartner: 0,
      addTransaction: (data, transcript, opts) => {
        const newId = makeId();
        set((state) => {
          const personalizedCategories = enrichCategoriesWithAiMemory(state.categories);
          let normalized = normalizeIncoming(
            data,
            personalizedCategories,
            state.locale,
            transcript,
          );
          if (transcript?.trim()) {
            normalized = refineParsedTransaction(
              normalized,
              transcript,
              personalizedCategories,
              detectType,
              state.locale,
            );
          }
          const withOwner = applyDetectedOwner(
            normalized,
            transcript ?? normalized.note,
            {
              partnerName: state.partnerName,
              partnerKeywords: state.partnerKeywords,
              myName: state.userName,
              locale: state.locale,
              hasPartner: hasPartnerBudget(state.partnerName, state.partnerKeywords),
            },
            data.owner ?? state.entryOwner,
          );
          const viewerOwner = withOwner.owner ?? data.owner ?? state.entryOwner;
          let owner = viewerOwner;
          let createdBy = data.createdBy;
          const viewerId = ensureCloudViewerUserId();
          if (!createdBy && viewerId) {
            const memberIds = collectHouseholdMemberUserIds(
              useCloudStore.getState().householdMemberUserIds,
              state.transactions,
              viewerId,
            );
            const spender = spenderFromViewerOwner(viewerId, memberIds, viewerOwner);
            owner = spender.owner;
            createdBy = spender.createdBy ?? undefined;
          } else if (!createdBy) {
            createdBy = viewerId ?? undefined;
          }
          let goalId = data.goalId ?? null;
          let goalAmount = normalizeGoalAmount(data.goalAmount);
          if (!goalId || goalAmount <= 0) {
            goalId = null;
            goalAmount = 0;
          }
          if (goalAmount > normalized.amount) {
            goalAmount = normalized.amount;
          }
          const isGoalTransfer =
            normalized.type === "expense" &&
            goalId &&
            goalAmount > 0 &&
            (normalized.categoryId === "goal_jar" || data.goalId);
          if (normalized.type === "income") {
            /* часть дохода в копилку */
          } else if (!isGoalTransfer) {
            goalId = null;
            goalAmount = 0;
          } else if (goalAmount < normalized.amount) {
            goalAmount = normalized.amount;
          }
          const created: Transaction = {
            id: newId,
            owner,
            ...normalized,
            goalId: goalId && goalAmount ? goalId : null,
            goalAmount: goalId && goalAmount ? goalAmount : null,
            confirmed: data.confirmed === false ? false : true,
            recurringId: data.recurringId ?? null,
            updatedAt: new Date().toISOString(),
            ...(createdBy ? { createdBy } : {}),
            ...(data.odometerKm != null && Number.isFinite(data.odometerKm)
              ? { odometerKm: Math.max(0, Math.round(data.odometerKm)) }
              : {}),
            ...(data.fuelLiters != null && Number.isFinite(data.fuelLiters)
              ? { fuelLiters: Math.max(0, Math.round(data.fuelLiters * 100) / 100) }
              : {}),
            ...(data.transferPairId ? { transferPairId: data.transferPairId } : {}),
            ...(data.businessTxId ? { businessTxId: data.businessTxId } : {}),
          };
          let savingsGoals = state.savingsGoals;
          if (created.goalId && created.goalAmount) {
            savingsGoals = applyGoalDelta(savingsGoals, created.goalId, created.goalAmount);
          }
          recordAiInputLearning(transcript, created, transcript ? "voice" : "text");
          clearCachedMonthlyAnalysis();
          return {
            trackingStartedAt: state.trackingStartedAt ?? new Date().toISOString(),
            reminderLastShownDate: new Date().toISOString().slice(0, 10),
            transactions: [created, ...state.transactions],
            savingsGoals,
          };
        });
        const created = get().transactions.find((t) => t.id === newId) ?? null;
        if (created && created.confirmed !== false && !opts?.skipCloudPush) {
          useCloudStore.getState().markTransactionUpdatePending(created.id, created.updatedAt);
          void cloudPushTransaction(created);
          if (created.goalId && created.goalAmount) {
            const goal = get().savingsGoals.find((g) => g.id === created.goalId);
            if (goal) void cloudPushGoal(goal);
          }
          applyVehicleAfterTransaction(get, set, created);
        }
        return newId;
      },
      addVehicle: (name) => {
        const { vehicles, vehiclePrefs } = get();
        const next = defaultVehicle(name ?? `Авто ${vehicles.length + 1}`);
        const merged = [...vehicles, next];
        set({ vehicles: merged });
        pushGarageFromState(get);
        if (vehicles.length === 0 && merged.length === 1) {
          const uid = ensureCloudViewerUserId();
          if (uid && vehiclePrefs.mode === "split") {
            set({
              vehiclePrefs: {
                ...vehiclePrefs,
                members: {
                  ...vehiclePrefs.members,
                  [uid]: {
                    defaultVehicleId: next.id,
                    rarelyUsePartnerVehicles: false,
                  },
                },
              },
            });
            pushGarageFromState(get);
          }
        }
      },
      removeVehicleById: (vehicleId) => {
        const { vehicles, vehiclePrefs } = get();
        const nextVehicles = vehicles.filter((v) => v.id !== vehicleId);
        const nextPrefs: VehicleGaragePrefs = {
          ...vehiclePrefs,
          members: Object.fromEntries(
            Object.entries(vehiclePrefs.members).map(([uid, m]) => [
              uid,
              {
                ...m,
                defaultVehicleId:
                  m.defaultVehicleId === vehicleId ? null : m.defaultVehicleId,
              },
            ]),
          ),
        };
        set({
          vehicles: nextVehicles,
          vehiclePrefs: nextPrefs,
          pendingOdometerPrompt: null,
          lastFuelVehicleId:
            get().lastFuelVehicleId === vehicleId ? null : get().lastFuelVehicleId,
        });
        if (nextVehicles.length === 0) void cloudDeleteGarage();
        else void cloudPushGarage(nextVehicles, nextPrefs);
      },
      saveVehicleGarage: (vehicles, vehiclePrefs) => {
        set({
          vehicles,
          vehiclePrefs: vehiclePrefs ?? get().vehiclePrefs,
        });
        void cloudPushGarage(vehicles, vehiclePrefs ?? get().vehiclePrefs);
      },
      updateVehicleInGarage: (vehicleId, patch) => {
        const next = updateVehicleInList(get().vehicles, vehicleId, patch);
        set({ vehicles: next });
        pushGarageFromState(get);
      },
      setVehicleGarageMode: (mode) => {
        const vehiclePrefs = { ...get().vehiclePrefs, mode };
        set({ vehiclePrefs });
        pushGarageFromState(get);
      },
      setVehicleMemberPref: (userId, patch) => {
        const prev = get().vehiclePrefs.members[userId] ?? {
          defaultVehicleId: null,
          rarelyUsePartnerVehicles: false,
        };
        const vehiclePrefs: VehicleGaragePrefs = {
          ...get().vehiclePrefs,
          members: {
            ...get().vehiclePrefs.members,
            [userId]: { ...prev, ...patch },
          },
        };
        set({ vehiclePrefs });
        pushGarageFromState(get);
      },
      submitOdometerForTransaction: (transactionId, vehicleId, odometerKm, fuelLiters) => {
        const km = Math.max(0, Math.round(odometerKm));
        const liters =
          fuelLiters != null && Number.isFinite(fuelLiters)
            ? Math.max(0, Math.round(fuelLiters * 100) / 100)
            : null;
        const prompt = get().pendingOdometerPrompt;
        const tx = get().transactions.find((t) => t.id === transactionId);
        if (!tx) {
          set({ pendingOdometerPrompt: null });
          return;
        }
        get().updateTransaction(transactionId, {
          odometerKm: km,
          vehicleId,
          fuelLiters: prompt?.kind === "fuel" ? liters : null,
        });
        const vehicles = get().vehicles;
        const vehicle = vehicles.find((v) => v.id === vehicleId);
        if (vehicle) {
          const isService = prompt?.kind === "service" || isVehicleServiceExpense(tx);
          const nextVehicle = isService
            ? applyVehicleService(vehicle, km)
            : applyFuelOdometer(vehicle, km);
          const nextVehicles = vehicles.map((v) => (v.id === vehicleId ? nextVehicle : v));
          set({
            vehicles: nextVehicles,
            pendingOdometerPrompt: null,
            lastFuelVehicleId: isService ? get().lastFuelVehicleId : vehicleId,
          });
          pushGarageFromState(get);
        } else {
          set({ pendingOdometerPrompt: null });
        }
      },
      dismissServiceAlert: (vehicleId, level) => {
        const next = markServiceAlertShown(get().vehicles, vehicleId, level);
        set({ vehicles: next });
        pushGarageFromState(get);
      },
      clearPendingOdometer: () => set({ pendingOdometerPrompt: null }),
      syncVehicleFromTransaction: (transactionId) => {
        const tx = get().transactions.find((t) => t.id === transactionId);
        if (tx) applyVehicleAfterTransaction(get, set, tx);
      },
      updateTransaction: (id, patch) => {
        const prev = get().transactions.find((t) => t.id === id);
        if (prev?.categoryId === GOAL_JAR_CATEGORY_ID) {
          const nextCat = patch.categoryId ?? prev.categoryId;
          const nextAmt =
            patch.amount !== undefined && patch.amount > 0 ? patch.amount : prev.amount;
          const nextGoalId = patch.goalId !== undefined ? patch.goalId : prev.goalId;
          const nextGoalAmt =
            patch.goalAmount !== undefined
              ? normalizeGoalAmount(patch.goalAmount)
              : normalizeGoalAmount(prev.goalAmount);
          if (
            nextCat !== GOAL_JAR_CATEGORY_ID ||
            nextAmt <= 0 ||
            !nextGoalId ||
            nextGoalAmt <= 0
          ) {
            get().deleteTransaction(id);
            return;
          }
        }
        let updated: Transaction | null = null;
        set((state) => {
          const categories = state.categories;
          let savingsGoals = state.savingsGoals;
          if (prev) {
            savingsGoals = revertTransactionGoal(
              savingsGoals,
              prev.goalId,
              prev.goalAmount,
            );
          }
          const transactions = state.transactions.map((tx) => {
            if (tx.id !== id) return tx;
            const amount =
              patch.amount !== undefined && patch.amount > 0
                ? roundMoneyUp(patch.amount)
                : tx.amount;
            const type = patch.type ?? tx.type;
            let categoryId = patch.categoryId ?? tx.categoryId;
            const valid = categories.some((c) => c.id === categoryId && c.type === type);
            if (!valid) {
              categoryId = getFallbackCategoryId(type);
            }
            const owner = patch.owner ?? tx.owner;
            const goalId = patch.goalId !== undefined ? patch.goalId : tx.goalId ?? null;
            let goalAmount =
              patch.goalAmount !== undefined ? patch.goalAmount : tx.goalAmount ?? null;
            goalAmount = normalizeGoalAmount(goalAmount);
            if (!goalId || goalAmount <= 0) {
              goalAmount = null;
            }
            if (goalAmount && goalAmount > amount) {
              goalAmount = amount;
            }
            const odometerKm =
              patch.odometerKm !== undefined
                ? patch.odometerKm != null
                  ? Math.max(0, Math.round(patch.odometerKm))
                  : null
                : tx.odometerKm ?? null;
            const fuelLiters =
              patch.fuelLiters !== undefined
                ? patch.fuelLiters != null
                  ? Math.max(0, Math.round(patch.fuelLiters * 100) / 100)
                  : null
                : tx.fuelLiters ?? null;
            const vehicleId =
              patch.vehicleId !== undefined ? patch.vehicleId : tx.vehicleId ?? null;
            const note =
              patch.note !== undefined
                ? sanitizeTransactionNote(patch.note, amount)
                : tx.note;
            updated = {
              ...tx,
              amount,
              categoryId,
              type,
              owner,
              note,
              ...(patch.createdBy !== undefined ? { createdBy: patch.createdBy } : {}),
              goalId: goalId && goalAmount ? goalId : null,
              goalAmount: goalId && goalAmount ? goalAmount : null,
              odometerKm,
              fuelLiters,
              vehicleId,
              updatedAt: new Date().toISOString(),
            };
            return updated;
          });
          if (updated?.goalId && updated.goalAmount) {
            savingsGoals = applyGoalDelta(savingsGoals, updated.goalId, updated.goalAmount);
          }
          return { transactions, savingsGoals };
        });
        const after = get().transactions.find((t) => t.id === id);
        if (after) {
          recordAiCorrectionLearning({ before: prev, after });
          clearCachedMonthlyAnalysis();
          useCloudStore.getState().markTransactionUpdatePending(id, after.updatedAt);
          const goalIds = new Set<string>();
          if (prev?.goalId) goalIds.add(prev.goalId);
          if (after.goalId) goalIds.add(after.goalId);
          void cloudPushTransactionUpdate(id, {
            amount: after.amount,
            categoryId: after.categoryId,
            owner: after.owner,
            createdBy: after.createdBy,
            type: after.type,
            goalId: after.goalId,
            goalAmount: after.goalAmount,
            odometerKm: after.odometerKm,
            fuelLiters: after.fuelLiters,
            vehicleId: after.vehicleId,
            note: after.note,
          });
          for (const gid of goalIds) {
            const goal = get().savingsGoals.find((g) => g.id === gid);
            if (goal) void cloudPushGoal(goal);
          }
        }
      },
      deleteTransaction: (id, opts) => {
        const tx = get().transactions.find((t) => t.id === id);
        if (!opts?.skipBusinessLink && bottomNavEnabled()) {
          void import("@/store/useBusinessStore").then(({ useBusinessStore }) => {
            const biz = useBusinessStore.getState();
            if (tx?.businessTxId) {
              biz.removeTransaction(tx.businessTxId, { skipFamilyLink: true });
            }
            biz.removePassiveReceiptByFamilyTxId(id);
          });
        }
        const idsToDelete =
          tx && isPartnerTransferLike(tx)
            ? get()
                .transactions.filter((t) => isPartnerTransferPairCandidate(tx, t))
                .map((t) => t.id)
            : [id];
        let goalAfterDelete: SavingsGoal | null = null;
        set((state) => {
          const deleteSet = new Set(idsToDelete);
          const primary = state.transactions.find((t) => t.id === id);
          const savingsGoals = revertTransactionGoal(
            state.savingsGoals,
            primary?.goalId,
            primary?.goalAmount,
          );
          if (primary?.goalId) {
            goalAfterDelete = savingsGoals.find((g) => g.id === primary.goalId) ?? null;
          }
          return {
            transactions: state.transactions.filter((t) => !deleteSet.has(t.id)),
            savingsGoals,
          };
        });
        if (goalAfterDelete) void cloudPushGoal(goalAfterDelete);
        for (const delId of idsToDelete) {
          useCloudStore.getState().clearTransactionUpdatePending(delId);
          useCloudStore.getState().markTransactionDeleted(delId);
          useCloudStore.getState().removeFromLastSyncedRemoteTxIds(delId);
          void cloudPushTransactionDelete(delId);
        }
      },
      setLocale: (locale) => set({ locale }),
      setIsRecording: (isRecording) => set({ isRecording }),
      setUserName: (userName) =>
        set({
          userName: userName?.trim() || null,
          userNameCustomized: true,
        }),
      setPartnerName: (partnerName) => {
        const trimmed = partnerName?.trim() || null;
        set({
          partnerName: trimmed,
          partnerNameCustomized: true,
          entryOwner: "me",
          householdFilter: "all",
        });
      },
      setEntryOwner: (entryOwner) => set({ entryOwner }),
      setHouseholdFilter: (householdFilter) => set({ householdFilter }),
      setBudgetMonthStartDay: (day) => set({ budgetMonthStartDay: clampMonthStartDay(day) }),
      transferToPartner: (amount, direction) => {
        const amt = roundMoneyUp(amount);
        if (amt <= 0 || !hasPartnerBudget(get().partnerName, get().partnerKeywords)) return false;
        const partnerLabel = get().partnerName?.trim() || "Партнёр";
        const pair = buildPartnerTransferPair(amt, direction, partnerLabel);
        const viewerId = ensureCloudViewerUserId();
        const cloud = useCloudStore.getState();
        const partnerUserId = findHouseholdPartnerUserId(
          viewerId,
          cloud.householdMemberUserIds,
          get().transactions,
        );
        const skip = { skipCloudPush: true as const };
        if (viewerId && partnerUserId) {
          if (direction === "to_partner") {
            get().addTransaction({ ...pair.expense, owner: "me", createdBy: viewerId }, undefined, skip);
            get().addTransaction(
              { ...pair.income, owner: "partner", createdBy: partnerUserId },
              undefined,
              skip,
            );
          } else {
            get().addTransaction(
              { ...pair.expense, owner: "partner", createdBy: partnerUserId },
              undefined,
              skip,
            );
            get().addTransaction({ ...pair.income, owner: "me", createdBy: viewerId }, undefined, skip);
          }
        } else {
          get().addTransaction(pair.expense, undefined, skip);
          get().addTransaction(pair.income, undefined, skip);
        }
        const pairId = pair.expense.transferPairId;
        if (pairId) {
          const txs = get().transactions.filter((t) => t.transferPairId === pairId);
          const expense = txs.find((t) => t.type === "expense");
          const income = txs.find((t) => t.type === "income");
          if (expense && income) void cloudPushPartnerTransferPair(expense, income);
        }
        return true;
      },
      setActualCash: (owner, actualAmount) => {
        if (!Number.isFinite(actualAmount)) return;
        const actual = Math.round(actualAmount);
        const txs = filterByHousehold(get().transactions, owner).filter(countsInBalance);
        const computed = calcBalance(txs);
        const offset = actual - computed;
        if (owner === "me") {
          set({ cashOffsetMe: offset });
        } else {
          set({ cashOffsetPartner: offset });
        }
      },
      addCategory: (type, labelRu, labelEn, keywords = []) => {
        const ru = labelRu.trim();
        const en = labelEn.trim() || ru;
        if (!ru) return null;
        let id = slugifyCategoryId(ru);
        const { categories } = get();
        if (categories.some((c) => c.id === id)) {
          id = `${id}-${Date.now().toString(36).slice(-4)}`;
        }
        const item: CategoryDefinition = {
          id,
          type,
          labels: { ru, en },
          keywords: keywords.map((k) => k.trim().toLowerCase()).filter(Boolean),
          isSystem: false,
        };
        set({ categories: [...categories, item] });
        void cloudPushCategory(item);
        return id;
      },
      updateCategory: (id, patch) => {
        let updated: CategoryDefinition | null = null;
        set((state) => ({
          categories: state.categories.map((c) => {
            if (c.id !== id) return c;
            updated = {
              ...c,
              labels: patch.labels ? { ...c.labels, ...patch.labels } : c.labels,
              keywords: patch.keywords ?? c.keywords,
            };
            return updated;
          }),
        }));
        if (updated) void cloudPushCategory(updated);
      },
      removeCategory: (id) => {
        const cat = get().categories.find((c) => c.id === id);
        if (!cat) return false;
        const fallback = getFallbackCategoryId(cat.type);
        if (cat.id === fallback) return false;
        const affectedTransactions = get().transactions.filter((tx) => tx.categoryId === id);
        const archiveEntry = {
          id: `${id}-${Date.now().toString(36)}`,
          deletedAt: new Date().toISOString(),
          category: { ...cat, keywords: [...cat.keywords] },
          fallbackCategoryId: fallback,
          affectedTransactions,
        };
        set((state) => ({
          deletedCategoryArchive: [archiveEntry, ...state.deletedCategoryArchive].slice(0, 50),
          categories: state.categories.filter((c) => c.id !== id),
          transactions: state.transactions.map((tx) =>
            tx.categoryId === id ? { ...tx, categoryId: fallback } : tx,
          ),
        }));
        useCloudStore.getState().removeFromLastSyncedRemoteCategoryIds(id);
        void cloudPushCategoryDelete(id);
        return true;
      },
      restoreArchivedCategory: (archiveId) => {
        const archive = get().deletedCategoryArchive.find((item) => item.id === archiveId);
        if (!archive) return false;
        const existingCategory = get().categories.some((cat) => cat.id === archive.category.id);
        const affectedIds = new Set(archive.affectedTransactions.map((tx) => tx.id));
        const restoredTxIds: string[] = [];
        set((state) => {
          const categories = existingCategory
            ? state.categories
            : [...state.categories, { ...archive.category, keywords: [...archive.category.keywords] }];
          const transactions = state.transactions.map((tx) => {
            if (!affectedIds.has(tx.id)) return tx;
            restoredTxIds.push(tx.id);
            return { ...tx, categoryId: archive.category.id };
          });
          return {
            categories,
            transactions,
            deletedCategoryArchive: state.deletedCategoryArchive.filter(
              (item) => item.id !== archiveId,
            ),
          };
        });
        void cloudPushCategory(archive.category);
        for (const id of restoredTxIds) {
          void cloudPushTransactionUpdate(id, { categoryId: archive.category.id });
        }
        return true;
      },
      restoreDefaultCategories: () => {
        const defaults = getDefaultCategories();
        const defaultIds = new Set(defaults.map((c) => c.id));
        const prev = get().categories;
        const now = new Date().toISOString();
        const archivedCustom = prev
          .filter((cat) => !defaultIds.has(cat.id))
          .map((cat) => ({
            id: `${cat.id}-${Date.now().toString(36)}`,
            deletedAt: now,
            category: { ...cat, keywords: [...cat.keywords] },
            fallbackCategoryId: getFallbackCategoryId(cat.type),
            affectedTransactions: get().transactions.filter((tx) => tx.categoryId === cat.id),
          }));
        set((state) => ({
          deletedCategoryArchive: [
            ...archivedCustom,
            ...state.deletedCategoryArchive,
          ].slice(0, 50),
          categories: defaults.map((c) => ({ ...c, keywords: [...c.keywords] })),
          transactions: state.transactions.map((tx) =>
            defaultIds.has(tx.categoryId) ? tx : { ...tx, categoryId: getFallbackCategoryId(tx.type) },
          ),
        }));
        for (const cat of defaults) void cloudPushCategory(cat);
        for (const cat of prev) {
          if (!defaultIds.has(cat.id)) void cloudPushCategoryDelete(cat.id);
        }
      },
      clearAll: () => set({ transactions: [], trackingStartedAt: null }),
      setReminderEnabled: (reminderEnabled) => set({ reminderEnabled }),
      setReminderTime: (reminderTime) => set({ reminderTime }),
      setReminderWindowStart: (reminderWindowStart) => set({ reminderWindowStart }),
      setReminderWindowEnd: (reminderWindowEnd) => set({ reminderWindowEnd }),
      markReminderShownToday: () =>
        set({ reminderLastShownDate: new Date().toISOString().slice(0, 10) }),
      ensureTrackingStarted: () => {
        const state = get();
        if (state.trackingStartedAt) return;
        const fromTx = getTrackingStartDate(null, state.transactions);
        set({
          trackingStartedAt: (fromTx ?? new Date()).toISOString(),
        });
      },
      addGoal: (name, targetAmount, deadline = null) => {
        const trimmed = name.trim();
        let id = slugifyCategoryId(trimmed) || `goal-${Date.now().toString(36)}`;
        const { savingsGoals } = get();
        if (savingsGoals.some((g) => g.id === id)) {
          id = `${id}-${Date.now().toString(36).slice(-4)}`;
        }
        const goal = applyGoalMonthlyToGoal({
          id,
          name: trimmed,
          targetAmount: roundMoneyUp(targetAmount),
          savedAmount: 0,
          deadline,
          monthlyContribution: null,
          kind: "custom",
          emergencyMonths: null,
          updatedAt: new Date().toISOString(),
        });
        set({ savingsGoals: [...savingsGoals, goal] });
        void cloudPushGoal(goal);
        return id;
      },
      updateGoal: (id, patch) => {
        const existing = get().savingsGoals.find((g) => g.id === id);
        if (!existing || existing.kind === "emergency") return false;
        let updated: SavingsGoal | null = null;
        set((state) => ({
          savingsGoals: state.savingsGoals.map((g) => {
            if (g.id !== id) return g;
            updated = applyGoalMonthlyToGoal({
              ...g,
              name: patch.name?.trim() || g.name,
              targetAmount:
                patch.targetAmount !== undefined
                  ? roundMoneyUp(Math.max(0, patch.targetAmount))
                  : g.targetAmount,
              deadline: patch.deadline !== undefined ? patch.deadline : g.deadline,
              updatedAt: new Date().toISOString(),
            });
            return updated;
          }),
        }));
        if (updated) void cloudPushGoal(updated);
        return Boolean(updated);
      },
      depositGoal: (id, amount) => {
        const amt = roundMoneyUp(amount);
        if (amt <= 0) return false;
        const goal = get().savingsGoals.find((g) => g.id === id);
        if (!goal) return false;
        const before = get().transactions.length;
        get().addTransaction(buildGoalDepositTransaction(goal, amt, get().entryOwner));
        return get().transactions.length > before;
      },
      withdrawGoal: (id, amount) => {
        const amt = roundMoneyUp(amount);
        if (amt <= 0) return false;
        const goal = get().savingsGoals.find((g) => g.id === id);
        if (!goal || goal.savedAmount <= 0) return false;
        const value = Math.min(amt, goal.savedAmount);
        const categoryId = getFallbackCategoryId("income");
        const before = get().transactions.length;
        get().addTransaction({
          amount: value,
          type: "income",
          categoryId,
          currency: normalizeAppCurrency(),
          note: `← ${goal.name}`,
          date: new Date().toISOString().slice(0, 10),
          owner: get().entryOwner,
        });
        if (get().transactions.length <= before) return false;
        let updated: SavingsGoal | null = null;
        set((state) => {
          const savingsGoals = applyGoalDelta(state.savingsGoals, id, -value);
          updated = savingsGoals.find((g) => g.id === id) ?? null;
          return { savingsGoals };
        });
        if (updated) void cloudPushGoal(updated);
        return true;
      },
      revertLastGoalDeposit: (goalId) => {
        const jar = get().transactions.filter(
          (t) => t.categoryId === GOAL_JAR_CATEGORY_ID && t.goalId === goalId,
        );
        if (jar.length === 0) return false;
        const latest = jar.reduce((a, b) => {
          const cmp = b.date.localeCompare(a.date);
          if (cmp !== 0) return cmp > 0 ? b : a;
          return b.id > a.id ? b : a;
        });
        get().deleteTransaction(latest.id);
        return true;
      },
      removeGoal: (id) => {
        const goal = get().savingsGoals.find((g) => g.id === id);
        if (!goal || goal.kind === "emergency") return false;
        set((state) => ({
          savingsGoals: state.savingsGoals.filter((g) => g.id !== id),
        }));
        useCloudStore.getState().removeFromLastSyncedRemoteGoalIds(id);
        void cloudPushGoalDelete(id);
        return true;
      },
      enableEmergencyFund: (months) => {
        const existing = get().savingsGoals.find((g) => g.id === EMERGENCY_GOAL_ID);
        const goal: SavingsGoal = existing
          ? { ...existing, emergencyMonths: months, kind: "emergency", updatedAt: new Date().toISOString() }
          : { ...defaultEmergencyGoal(months), updatedAt: new Date().toISOString() };
        set((state) => ({
          savingsGoals: existing
            ? state.savingsGoals.map((g) => (g.id === EMERGENCY_GOAL_ID ? goal : g))
            : [...state.savingsGoals, goal],
        }));
        void cloudPushGoal(goal);
      },
      setEmergencyMonths: (months) => {
        get().enableEmergencyFund(months);
      },
      setCategoryBudget: (categoryId, monthlyLimit) => {
        const limit = roundMoneyUp(monthlyLimit);
        if (limit <= 0) return;
        const budget: CategoryBudget = {
          categoryId,
          monthlyLimit: limit,
          updatedAt: new Date().toISOString(),
        };
        set((state) => {
          const rest = state.categoryBudgets.filter((b) => b.categoryId !== categoryId);
          return { categoryBudgets: [...rest, budget] };
        });
        void cloudPushCategoryBudget(budget);
      },
      removeCategoryBudget: (categoryId) => {
        set((state) => ({
          categoryBudgets: state.categoryBudgets.filter((b) => b.categoryId !== categoryId),
        }));
        useCloudStore.getState().removeFromLastSyncedRemoteBudgetCategoryIds(categoryId);
        void cloudPushCategoryBudgetDelete(categoryId);
      },
      addRecurring: (data) => {
        const id = makeId();
        const item: RecurringTransaction = {
          ...data,
          id,
          enabled: true,
          skippedDates: data.skippedDates ?? [],
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({
          recurringTransactions: [...state.recurringTransactions, item],
        }));
        void cloudPushRecurring(item);
        return id;
      },
      updateRecurring: (id, patch) => {
        let updated: RecurringTransaction | null = null;
        set((state) => ({
          recurringTransactions: state.recurringTransactions.map((r) => {
            if (r.id !== id) return r;
            updated = { ...r, ...patch, updatedAt: new Date().toISOString() };
            return updated;
          }),
        }));
        if (updated) void cloudPushRecurring(updated);
      },
      removeRecurring: (id) => {
        set((state) => ({
          recurringTransactions: state.recurringTransactions.filter((r) => r.id !== id),
        }));
        useCloudStore.getState().markRecurringDeleted(id);
        void cloudPushRecurringDelete(id);
      },
      addDebt: (data) => {
        const id = makeId();
        const debt: DebtItem = {
          ...data,
          id,
          name: data.name.trim().slice(0, 80) || "Долг",
          balance: Math.max(0, roundMoneyUp(data.balance)),
          minPayment: Math.max(0, roundMoneyUp(data.minPayment)),
          ratePct:
            data.ratePct == null
              ? null
              : Math.max(0, Math.min(999, Math.round(data.ratePct * 10) / 10)),
          nextPaymentDate: data.nextPaymentDate?.trim() || null,
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({ debts: [debt, ...state.debts] }));
        void cloudPushDebt(debt);
        return id;
      },
      updateDebt: (id, patch) => {
        let updated: DebtItem | null = null;
        set((state) => ({
          debts: state.debts.map((debt) => {
            if (debt.id !== id) return debt;
            const next = { ...debt, ...patch, updatedAt: new Date().toISOString() };
            next.name = next.name.trim().slice(0, 80) || debt.name;
            next.balance = Math.max(0, roundMoneyUp(next.balance));
            next.minPayment = Math.max(0, roundMoneyUp(next.minPayment));
            next.ratePct =
              next.ratePct == null
                ? null
                : Math.max(0, Math.min(999, Math.round(next.ratePct * 10) / 10));
            next.nextPaymentDate = next.nextPaymentDate?.trim() || null;
            updated = next;
            return next;
          }),
        }));
        if (updated) void cloudPushDebt(updated);
      },
      payDebt: (id, amount) => {
        const amt = roundMoneyUp(amount);
        if (amt <= 0) return false;
        let changed = false;
        let updated: DebtItem | null = null;
        set((state) => ({
          debts: state.debts.map((debt) => {
            if (debt.id !== id) return debt;
            changed = true;
            updated = {
              ...debt,
              balance: Math.max(0, roundMoneyUp(debt.balance - amt)),
              updatedAt: new Date().toISOString(),
            };
            return updated;
          }),
        }));
        if (updated) void cloudPushDebt(updated);
        return changed;
      },
      removeDebt: (id) => {
        set((state) => ({ debts: state.debts.filter((d) => d.id !== id) }));
        useCloudStore.getState().markDebtDeleted(id);
        useCloudStore.getState().removeFromLastSyncedRemoteDebtIds(id);
        void cloudPushDebtDelete(id);
      },
      processRecurringDue: () => {
        const state = get();
        const today = todayIso();
        for (const item of state.recurringTransactions) {
          if (!item.enabled || item.nextRunDate > today) continue;
          let runDate = item.nextRunDate;
          while (runDate <= today) {
            const transactions = get().transactions;
            const exists = transactions.some(
              (t) => t.recurringId === item.id && t.date === runDate,
            ) || hasManualRecurringPayment(transactions, item, runDate);
            if (!exists) {
              const parsed = recurringToParsedTransaction(item, runDate);
              get().addTransaction({
                ...parsed,
                confirmed: parsed.type === "income",
                recurringId: item.id,
              });
            }
            runDate = advanceRecurringDate(
              runDate,
              item.frequency,
              item.dayOfMonth,
              item.intervalMonths ?? 1,
            );
          }
          if (runDate !== item.nextRunDate) {
            get().updateRecurring(item.id, { nextRunDate: runDate });
          }
        }
      },
      confirmPendingTransaction: (id) => {
        const tx = get().transactions.find((t) => t.id === id);
        if (!tx || tx.confirmed !== false) return false;
        let updated: Transaction | null = null;
        set((state) => ({
          transactions: state.transactions.map((t) => {
            if (t.id !== id) return t;
            updated = { ...t, confirmed: true };
            return updated;
          }),
        }));
        if (updated) {
          void cloudPushTransaction(updated);
        }
        return Boolean(updated);
      },
      dismissPendingTransaction: (id) => {
        const tx = get().transactions.find((t) => t.id === id);
        if (!tx || tx.confirmed !== false) return false;
        if (tx.recurringId) {
          const item = get().recurringTransactions.find((r) => r.id === tx.recurringId);
          if (item) {
            get().updateRecurring(item.id, {
              skippedDates: appendSkippedDate(item.skippedDates, tx.date),
            });
          }
        }
        get().deleteTransaction(id);
        return true;
      },
      skipPendingTransaction: (id) => {
        const tx = get().transactions.find((t) => t.id === id);
        if (!tx || tx.confirmed !== false) return false;
        get().deleteTransaction(id);
        return true;
      },
      applyPlanningInput: (action) => {
        if (action.kind === "goal_create") {
          get().addGoal(action.name, action.targetAmount, action.deadline ?? null);
          return true;
        }
        if (action.kind === "goal_deposit") {
          return get().depositGoal(action.goalId, action.amount);
        }
        if (action.kind === "goal_deposit_by_name") {
          const q = action.goalName.trim().toLowerCase();
          if (!q) return false;
          const goals = get().savingsGoals;
          const goal =
            goals.find((g) => g.name.toLowerCase() === q) ??
            goals.find((g) => g.name.toLowerCase().includes(q)) ??
            goals.find((g) => q.includes(g.name.toLowerCase()));
          if (goal) return get().depositGoal(goal.id, action.amount);
          const newId = get().addGoal(action.goalName.trim(), 0);
          return get().depositGoal(newId, action.amount);
        }
        if (action.kind === "income_with_goal") {
          let goalId = action.goalId;
          if (!goalId) {
            const goals = get().savingsGoals;
            const q = action.goalName.toLowerCase();
            const existing =
              goals.find((g) => g.name.toLowerCase() === q) ??
              goals.find((g) => g.name.toLowerCase().includes(q));
            if (existing) {
              goalId = existing.id;
            } else {
              goalId = get().addGoal(action.goalName, 0);
            }
          }
          const categories = get().categories;
          const categoryId =
            matchCategoryIdFromText(action.sourceText, "income", categories) ??
            getFallbackCategoryId("income");
          get().addTransaction(
            {
              amount: action.incomeAmount,
              type: "income",
              categoryId,
              currency: normalizeAppCurrency(),
              note: action.sourceText.slice(0, 120),
              date: new Date().toISOString().slice(0, 10),
              goalId,
              goalAmount: action.goalAmount,
            },
            action.sourceText,
          );
          return true;
        }
        return false;
      },
    }),
    {
      name: "voicebudget-store",
      version: 22,
      migrate: (persisted, version) => {
        const raw = (persisted ?? {}) as Record<string, unknown>;
        const categories = sanitizeCategories(raw.categories);
        const rawTx = Array.isArray(raw.transactions) ? raw.transactions : [];

        const transactions = rawTx.map((item) => {
          const tx = item as Transaction & { category?: string };
          const type = (tx.type ?? "expense") as TxType;
          let categoryId = tx.categoryId ? migrateCategoryId(tx.categoryId) : undefined;
          if (!categoryId) {
            const legacy = tx.category ?? "";
            categoryId = legacy
              ? matchCategoryIdFromText(legacy, type, categories)
              : getFallbackCategoryId(type);
          }
          return {
            id: String(tx.id ?? `${Date.now()}`),
            amount: roundMoneyUp(Number(tx.amount) || 0),
            type,
            categoryId,
            currency: normalizeAppCurrency(tx.currency),
            note: String(tx.note ?? ""),
            date: String(tx.date ?? new Date().toISOString().slice(0, 10)),
            owner: (tx.owner ?? "me") as BudgetOwner,
          };
        });

        return {
          transactions,
          categories,
          isRecording: false,
          locale: (raw.locale === "en" ? "en" : "ru") as Locale,
          userName: typeof raw.userName === "string" ? raw.userName : null,
          userNameCustomized:
            Boolean(raw.userNameCustomized) ||
            (typeof raw.userName === "string" && raw.userName.trim().length > 0),
          partnerName: typeof raw.partnerName === "string" ? raw.partnerName : null,
          partnerNameCustomized:
            Boolean(raw.partnerNameCustomized) ||
            (typeof raw.partnerName === "string" && raw.partnerName.trim().length > 0),
          partnerKeywords: Array.isArray(raw.partnerKeywords)
            ? raw.partnerKeywords
                .filter((k): k is string => typeof k === "string")
                .map((k) => k.trim().toLowerCase())
                .filter((k) => k.length >= 2)
            : [],
          businessModeEnabled: Boolean(raw.businessModeEnabled),
          passiveIncomeEnabled: Boolean(raw.passiveIncomeEnabled),
          liveRatesEnabled: Boolean(raw.liveRatesEnabled),
          myChipColor: sanitizeOwnerChipColor(
            typeof raw.myChipColor === "string" ? raw.myChipColor : null,
            DEFAULT_MY_CHIP_COLOR,
          ),
          partnerChipColor: sanitizeOwnerChipColor(
            typeof raw.partnerChipColor === "string" ? raw.partnerChipColor : null,
            DEFAULT_PARTNER_CHIP_COLOR,
          ),
          entryOwner: raw.entryOwner === "partner" ? "partner" : "me",
          householdFilter:
            raw.householdFilter === "me" || raw.householdFilter === "partner"
              ? raw.householdFilter
              : "all",
          trackingStartedAt:
            typeof raw.trackingStartedAt === "string" ? raw.trackingStartedAt : null,
          reminderEnabled: Boolean(raw.reminderEnabled),
          reminderTime:
            typeof raw.reminderTime === "string" && /^\d{2}:\d{2}$/.test(raw.reminderTime)
              ? raw.reminderTime
              : "20:00",
          reminderWindowStart:
            typeof raw.reminderWindowStart === "string" &&
            /^\d{2}:\d{2}$/.test(raw.reminderWindowStart)
              ? raw.reminderWindowStart
              : "18:00",
          reminderWindowEnd:
            typeof raw.reminderWindowEnd === "string" && /^\d{2}:\d{2}$/.test(raw.reminderWindowEnd)
              ? raw.reminderWindowEnd
              : "22:00",
          reminderLastShownDate:
            typeof raw.reminderLastShownDate === "string" ? raw.reminderLastShownDate : null,
          savingsGoals: Array.isArray(raw.savingsGoals)
            ? (raw.savingsGoals as SavingsGoal[]).map((g) =>
                applyGoalMonthlyToGoal({
                  ...g,
                  monthlyContribution: g.monthlyContribution ?? null,
                }),
              )
            : [],
          categoryBudgets: Array.isArray(raw.categoryBudgets)
            ? (raw.categoryBudgets as CategoryBudget[])
            : [],
          recurringTransactions: Array.isArray(raw.recurringTransactions)
            ? (raw.recurringTransactions as RecurringTransaction[]).map((r) => ({
                ...r,
                skippedDates: Array.isArray(r.skippedDates) ? r.skippedDates : [],
                intervalMonths:
                  r.frequency === "monthly"
                    ? Math.max(1, Math.min(60, Math.round(Number(r.intervalMonths) || 1)))
                    : null,
              }))
            : [],
          debts: Array.isArray(raw.debts)
            ? (raw.debts as DebtItem[])
                .filter((d) => d && typeof d.id === "string" && typeof d.name === "string")
                .map((d) => ({
                  ...d,
                  owner:
                    d.owner === "me" || d.owner === "partner" || d.owner === "all"
                      ? d.owner
                      : "all",
                  balance: Math.max(0, roundMoneyUp(Number(d.balance) || 0)),
                  minPayment: Math.max(0, roundMoneyUp(Number(d.minPayment) || 0)),
                  ratePct:
                    d.ratePct == null || Number.isNaN(Number(d.ratePct))
                      ? null
                      : Math.max(0, Math.min(999, Math.round(Number(d.ratePct) * 10) / 10)),
                  nextPaymentDate:
                    typeof d.nextPaymentDate === "string" && d.nextPaymentDate
                      ? d.nextPaymentDate
                      : null,
                  strategy: d.strategy === "snowball" ? "snowball" : "avalanche",
                  priority: d.priority === "high" ? "high" : "normal",
                }))
            : [],
          deletedCategoryArchive: Array.isArray(raw.deletedCategoryArchive)
            ? (raw.deletedCategoryArchive as StoreState["deletedCategoryArchive"])
                .filter(
                  (item) =>
                    item &&
                    typeof item.id === "string" &&
                    typeof item.deletedAt === "string" &&
                    item.category &&
                    typeof item.category.id === "string",
                )
                .slice(0, 50)
            : [],
          budgetMonthStartDay: clampMonthStartDay(
            typeof raw.budgetMonthStartDay === "number" ? raw.budgetMonthStartDay : 1,
          ),
          statsPeriodOverride:
            raw.statsPeriodOverride &&
            typeof raw.statsPeriodOverride === "object" &&
            typeof (raw.statsPeriodOverride as { from?: string }).from === "string" &&
            typeof (raw.statsPeriodOverride as { to?: string }).to === "string"
              ? {
                  from: (raw.statsPeriodOverride as { from: string }).from,
                  to: (raw.statsPeriodOverride as { to: string }).to,
                }
              : null,
          // Корректировки баланса — только из облака (voicebudget-cloud), не из localStorage
          cashOffsetMe: 0,
          cashOffsetPartner: 0,
          planningPanelCollapsed:
            typeof raw.planningPanelCollapsed === "boolean" ? raw.planningPanelCollapsed : false,
          vehicles: Array.isArray(raw.vehicles)
            ? normalizeVehicles(raw.vehicles)
            : raw.vehicle && typeof raw.vehicle === "object"
              ? normalizeVehicles([raw.vehicle])
              : [],
          vehiclePrefs:
            raw.vehiclePrefs && typeof raw.vehiclePrefs === "object"
              ? normalizeVehicleGaragePrefs(raw.vehiclePrefs)
              : defaultVehicleGaragePrefs(),
          lastFuelVehicleId:
            typeof raw.lastFuelVehicleId === "string" ? raw.lastFuelVehicleId : null,
          pendingOdometerPrompt: null,
        };
      },
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn("[voicebudget-store] rehydrate failed, keeping cloud session", error);
        } else if (state) {
          if (typeof window !== "undefined") {
            try {
              if (
                localStorage.getItem("voicebudget-planning-panel-hidden") === "1" &&
                !state.planningPanelCollapsed
              ) {
                state.planningPanelCollapsed = true;
              }
              localStorage.removeItem("voicebudget-planning-panel-hidden");
            } catch {
              /* ignore */
            }
          }
          state.categories = sanitizeCategories(state.categories);
          state.transactions = (state.transactions ?? []).map((tx) => {
            const withO = withOwner(tx);
            return {
              ...withO,
              categoryId: migrateCategoryId(withO.categoryId),
            };
          });
        }
        void import("@/lib/cloud/apply-balance-offsets").then(({ applyBalanceOffsetsFromCloud }) => {
          applyBalanceOffsetsFromCloud();
        });
      },
    },
  ),
);

export const useTransactions = () => useStore((s) => s.transactions);
export const useCategories = () => useStore((s) => s.categories);

export function useViewerMappedTransactions(forBalance = false): Transaction[] {
  const transactions = useStore((s) => s.transactions);
  const cloudUserId = useCloudStore((s) => s.cloudUserId);
  const token = useCloudStore((s) => s.token);
  const storedMemberIds = useCloudStore((s) => s.householdMemberUserIds);

  return useMemo(() => {
    const viewerUserId = decodeUserIdFromHouseholdToken(token) ?? cloudUserId ?? null;
    const memberIds = collectHouseholdMemberUserIds(
      storedMemberIds,
      transactions,
      viewerUserId,
    );
    let list = mapTransactionsForViewer(transactions, viewerUserId, memberIds).map(withOwner);
    if (forBalance) list = list.filter(countsInHouseholdTotal);
    return list;
  }, [transactions, cloudUserId, token, storedMemberIds, forBalance]);
}

/** Доходы/расходы по «я / партнёр» — с переводами между супругами, без неподтверждённых. */
function useViewerTransactionsForOwnerStats(): Transaction[] {
  const viewerTxs = useViewerMappedTransactions(false);

  return useMemo(() => viewerTxs.filter(countsInBalance), [viewerTxs]);
}

function computedOwnerBalanceFromTxs(
  viewerTxs: Transaction[],
  owner: "me" | "partner",
): number {
  return calcBalance(viewerTxs.filter((tx) => tx.owner === owner && countsInBalance(tx)));
}

export function useComputedBalance(owner: "me" | "partner" | "all" = "all"): number {
  const viewerTxs = useViewerMappedTransactions(false);
  return useMemo(() => {
    if (owner === "all") {
      return (
        computedOwnerBalanceFromTxs(viewerTxs, "me") +
        computedOwnerBalanceFromTxs(viewerTxs, "partner")
      );
    }
    return computedOwnerBalanceFromTxs(viewerTxs, owner);
  }, [viewerTxs, owner]);
}

export const useBalance = (ownerFilter?: HouseholdFilter) => {
  const filterFromStore = useStore((s) => s.householdFilter);
  const filter = ownerFilter ?? filterFromStore;
  const cashOffsetMe = useStore((s) => s.cashOffsetMe);
  const cashOffsetPartner = useStore((s) => s.cashOffsetPartner);
  const viewerTxs = useViewerMappedTransactions(false);

  return useMemo(() => {
    const baseMe = computedOwnerBalanceFromTxs(viewerTxs, "me");
    const basePartner = computedOwnerBalanceFromTxs(viewerTxs, "partner");
    if (filter === "me") return baseMe + cashOffsetMe;
    if (filter === "partner") return basePartner + cashOffsetPartner;
    return baseMe + basePartner + cashOffsetMe + cashOffsetPartner;
  }, [viewerTxs, filter, cashOffsetMe, cashOffsetPartner]);
};

export function useHouseholdBalances() {
  const cashOffsetMe = useStore((s) => s.cashOffsetMe);
  const cashOffsetPartner = useStore((s) => s.cashOffsetPartner);
  const viewerTxs = useViewerMappedTransactions(false);

  return useMemo(() => {
    const me = computedOwnerBalanceFromTxs(viewerTxs, "me") + cashOffsetMe;
    const partner = computedOwnerBalanceFromTxs(viewerTxs, "partner") + cashOffsetPartner;
    return { all: me + partner, me, partner };
  }, [viewerTxs, cashOffsetMe, cashOffsetPartner]);
}

export type OwnerTypeTotals = {
  me: { income: number; expense: number };
  partner: { income: number; expense: number };
};

export function useOwnerTypeTotals(days = 30): OwnerTypeTotals {
  const viewerTxs = useViewerTransactionsForOwnerStats();

  return useMemo(() => {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const totals: OwnerTypeTotals = {
      me: { income: 0, expense: 0 },
      partner: { income: 0, expense: 0 },
    };

    viewerTxs.forEach((tx) => {
      if (new Date(tx.date).getTime() < cutoff) return;
      const bucket = totals[tx.owner];
      if (tx.type === "income") bucket.income += tx.amount;
      else bucket.expense += tx.amount;
    });

    return totals;
  }, [viewerTxs, days]);
}

export function useBudgetPeriod() {
  const monthStartDay = useStore((s) => s.budgetMonthStartDay);
  return useMemo(() => getCurrentBudgetPeriod(monthStartDay), [monthStartDay]);
}

export function useStatsPeriod(): BudgetPeriod {
  const monthStartDay = useStore((s) => s.budgetMonthStartDay);
  const override = useStore((s) => s.statsPeriodOverride);
  return useMemo(() => {
    if (override) {
      return { from: override.from, to: override.to, monthStartDay };
    }
    return getCurrentBudgetPeriod(monthStartDay);
  }, [monthStartDay, override]);
}

export function usePeriodOwnerTotals(): OwnerTypeTotals {
  const viewerTxs = useViewerTransactionsForOwnerStats();
  const period = useStatsPeriod();

  return useMemo(() => {
    const totals: OwnerTypeTotals = {
      me: { income: 0, expense: 0 },
      partner: { income: 0, expense: 0 },
    };

    viewerTxs.forEach((tx) => {
      if (!isDateInBudgetPeriod(tx.date, period)) return;
      const bucket = totals[tx.owner];
      if (tx.type === "income") bucket.income += tx.amount;
      else bucket.expense += tx.amount;
    });

    return totals;
  }, [viewerTxs, period]);
}

export function usePeriodTypeCategoryBreakdown(
  type: TxType,
  ownerFilter: HouseholdFilter = "all",
): { category: string; value: number }[] {
  const viewerTxs = useViewerTransactionsForOwnerStats();
  const categories = useCategories();
  const locale = useStore((s) => s.locale);
  const period = useStatsPeriod();

  return useMemo(() => {
    const map = new Map<string, number>();

    viewerTxs.forEach((tx) => {
      if (tx.type !== type) return;
      if (!isDateInBudgetPeriod(tx.date, period)) return;
      if (ownerFilter !== "all" && tx.owner !== ownerFilter) return;
      const label = getCategoryLabel(tx.categoryId, categories, locale);
      map.set(label, (map.get(label) ?? 0) + tx.amount);
    });

    return Array.from(map.entries())
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value);
  }, [viewerTxs, categories, locale, period, type, ownerFilter]);
}

export function usePeriodCategoryBreakdown(): { category: string; value: number }[] {
  const viewerTxs = useViewerMappedTransactions(true);
  const categories = useCategories();
  const locale = useStore((s) => s.locale);
  const householdFilter = useStore((s) => s.householdFilter);
  const period = useStatsPeriod();

  return useMemo(() => {
    const map = new Map<string, number>();
    const list =
      householdFilter === "all"
        ? viewerTxs
        : viewerTxs.filter((tx) => tx.owner === householdFilter);

    list.forEach((tx) => {
      if (tx.type !== "expense") return;
      if (!isDateInBudgetPeriod(tx.date, period)) return;
      const label = getCategoryLabel(tx.categoryId, categories, locale);
      map.set(label, (map.get(label) ?? 0) + tx.amount);
    });

    return Array.from(map.entries())
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value);
  }, [viewerTxs, categories, locale, householdFilter, period]);
}

export function usePeriodOwnerExpenseBreakdown(
  owner: BudgetOwner,
): { category: string; value: number }[] {
  const viewerTxs = useViewerTransactionsForOwnerStats();
  const categories = useCategories();
  const locale = useStore((s) => s.locale);
  const period = useStatsPeriod();

  return useMemo(() => {
    const map = new Map<string, number>();

    viewerTxs
      .filter(
        (tx) =>
          tx.owner === owner &&
          tx.type === "expense" &&
          isDateInBudgetPeriod(tx.date, period),
      )
      .forEach((tx) => {
        const label = getCategoryLabel(tx.categoryId, categories, locale);
        map.set(label, (map.get(label) ?? 0) + tx.amount);
      });

    return Array.from(map.entries())
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value);
  }, [viewerTxs, categories, locale, period, owner]);
}

export function useTypeCategoryBreakdown(
  days: number,
  type: TxType,
): { category: string; value: number }[] {
  const viewerTxs = useViewerTransactionsForOwnerStats();
  const categories = useCategories();
  const locale = useStore((s) => s.locale);

  return useMemo(() => {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const map = new Map<string, number>();

    viewerTxs.forEach((tx) => {
      if (tx.type !== type) return;
      if (new Date(tx.date).getTime() < cutoff) return;
      const label = getCategoryLabel(tx.categoryId, categories, locale);
      map.set(label, (map.get(label) ?? 0) + tx.amount);
    });

    return Array.from(map.entries())
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value);
  }, [viewerTxs, categories, locale, days, type]);
}

export function useOwnerExpenseBreakdown(
  days: number,
  owner: BudgetOwner,
): { category: string; value: number }[] {
  const viewerTxs = useViewerTransactionsForOwnerStats();
  const categories = useCategories();
  const locale = useStore((s) => s.locale);

  return useMemo(() => {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const map = new Map<string, number>();

    viewerTxs
      .filter(
        (tx) =>
          tx.owner === owner &&
          tx.type === "expense" &&
          new Date(tx.date).getTime() >= cutoff,
      )
      .forEach((tx) => {
        const label = getCategoryLabel(tx.categoryId, categories, locale);
        map.set(label, (map.get(label) ?? 0) + tx.amount);
      });

    return Array.from(map.entries())
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value);
  }, [viewerTxs, categories, locale, days, owner]);
}

export function useCategoryBreakdown(days = 30): { category: string; value: number }[] {
  const viewerTxs = useViewerMappedTransactions(true);
  const categories = useCategories();
  const locale = useStore((s) => s.locale);
  const householdFilter = useStore((s) => s.householdFilter);

  return useMemo(() => {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const map = new Map<string, number>();
    const list =
      householdFilter === "all"
        ? viewerTxs
        : viewerTxs.filter((tx) => tx.owner === householdFilter);

    list
      .filter((tx) => tx.type === "expense" && new Date(tx.date).getTime() >= cutoff)
      .forEach((tx) => {
        const label = getCategoryLabel(tx.categoryId, categories, locale);
        map.set(label, (map.get(label) ?? 0) + tx.amount);
      });

    return Array.from(map.entries())
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value);
  }, [viewerTxs, categories, locale, householdFilter, days]);
}

/** Сколько операций показываем на главной (раньше 10 — свежие записи терялись из вида). */
export const TRANSACTION_LIST_PREVIEW = 80;

function transactionListTime(tx: Transaction): number {
  const updated = tx.updatedAt ? Date.parse(tx.updatedAt) : NaN;
  if (Number.isFinite(updated)) return updated;
  const date = Date.parse(`${tx.date}T12:00:00`);
  return Number.isFinite(date) ? date : 0;
}

function sortTransactionsForList(a: Transaction, b: Transaction): number {
  const byDate = b.date.localeCompare(a.date);
  if (byDate !== 0) return byDate;
  const byTime = transactionListTime(b) - transactionListTime(a);
  if (byTime !== 0) return byTime;
  return b.id.localeCompare(a.id);
}

export function useFilteredTransactions(filter: "all" | TxType): Transaction[] {
  const viewerTxs = useViewerMappedTransactions(false);
  const householdFilter = useStore((s) => s.householdFilter);
  const byOwner =
    householdFilter === "all"
      ? viewerTxs
      : viewerTxs.filter((tx) => tx.owner === householdFilter);
  const list = byOwner
    .filter(countsInBalance)
    .sort(sortTransactionsForList)
    .slice(0, TRANSACTION_LIST_PREVIEW);
  if (filter === "all") return list;
  return list.filter((tx) => tx.type === filter);
}

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { buildBusinessSnapshot } from "@/lib/business/analytics";
import type {
  BusinessAsset,
  BusinessAssetType,
  BusinessCloudPayload,
  BusinessDebt,
  BusinessSnapshot,
  BusinessTaxPeriod,
  DeletedBusinessUnitArchive,
  BusinessPassiveReceipt,
  BusinessTransaction,
  BusinessTxKind,
  BusinessUnit,
} from "@/lib/business/types";
import {
  BUSINESS_UNIT_COLORS,
  defaultBusinessUnit,
} from "@/lib/business/types";
import { normalizeAppCurrency } from "@/lib/app-currency";
import {
  familyIncomeNoteFromAssetSale,
  familyIncomeNoteFromBusiness,
  familyIncomeNoteFromBusinessSale,
  familyIncomeNoteFromPassive,
} from "@/lib/business/family-transfer-note";
import {
  normalizeHousingUtilitiesLog,
  upsertUtilitiesLogEntry,
} from "@/lib/business/housing-utilities-log";
import { PROJECTS_SERVICE_UNIT_NAME } from "@/lib/business/projects-unit";
import { pushBusinessToCloud } from "@/lib/cloud/business-sync";
import { getFallbackCategoryId } from "@/lib/categories";
import { roundMoneyUp } from "@/lib/format-money";
import { useStore } from "@/store/useStore";

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function pickUnitColor(units: BusinessUnit[]): string {
  const used = new Set(units.map((u) => u.color));
  const free = BUSINESS_UNIT_COLORS.find((c) => !used.has(c));
  return free ?? BUSINESS_UNIT_COLORS[units.length % BUSINESS_UNIT_COLORS.length];
}

function ensureDefaultUnit(units: BusinessUnit[]): BusinessUnit[] {
  if (units.length > 0) return units;
  return [defaultBusinessUnit()];
}

type BusinessStore = {
  units: BusinessUnit[];
  transactions: BusinessTransaction[];
  deletedTransactionIds: string[];
  assets: BusinessAsset[];
  deletedAssetIds: string[];
  debts: BusinessDebt[];
  deletedUnitsArchive: DeletedBusinessUnitArchive[];
  passiveReceipts: BusinessPassiveReceipt[];
  selectedUnitId: string | null;
  cloudSyncedAt: string | null;
  taxRatePct: number;
  setSelectedUnitId: (id: string | null) => void;
  setTaxRatePct: (pct: number) => void;
  addUnit: (name: string) => string | null;
  removeUnit: (id: string) => boolean;
  restoreDeletedUnitArchive: (archiveId: string) => boolean;
  renameUnit: (id: string, name: string) => void;
  updateUnitSettings: (
    id: string,
    patch: { name?: string; taxRatePct?: number; taxPeriod?: BusinessTaxPeriod },
  ) => void;
  setUnitHourlyRate: (id: string, rate: number) => void;
  addOperatingTx: (
    unitId: string,
    type: "income" | "expense",
    amount: number,
    note: string,
    date?: string,
  ) => void;
  transferToCushion: (unitId: string, amount: number) => void;
  transferToTax: (unitId: string, amount: number) => void;
  transferToFamily: (unitId: string, amount: number) => boolean;
  recordBusinessSaleToFamily: (unitId: string, amount: number) => boolean;
  sellAssetToFamily: (assetId: string, amount: number) => boolean;
  /** Зачислить пассив с проекта в семью (сумма и дата — на выбор). */
  transferPassiveToFamily: (assetId: string, amount: number, date?: string) => boolean;
  removePassiveReceiptByFamilyTxId: (familyTxId: string) => void;
  addDebt: (
    unitId: string,
    data: Omit<BusinessDebt, "id" | "unitId" | "updatedAt">,
  ) => string | null;
  updateDebt: (
    id: string,
    patch: Partial<Omit<BusinessDebt, "id" | "unitId">>,
  ) => void;
  payDebt: (id: string, amount: number) => boolean;
  removeDebt: (id: string) => void;
  updateAsset: (
    assetId: string,
    patch: {
      name?: string;
      monthlyNet?: number;
      capitalValue?: number;
      hoursPerMonth?: number;
    },
  ) => void;
  /** Журнал ЖКХ: запись за месяц YYYY-MM (0 — удалить). */
  setAssetUtilitiesMonth: (assetId: string, monthKey: string, amountRub: number) => void;
  ensureProjectsUnitId: () => string;
  updateTransaction: (
    id: string,
    patch: {
      type?: "income" | "expense";
      amount?: number;
      note?: string;
      date?: string;
      unitId?: string;
    },
  ) => boolean;
  removeTransaction: (id: string, opts?: { skipFamilyLink?: boolean }) => void;
  addAsset: (
    unitId: string,
    type: BusinessAssetType,
    name: string,
    capitalValue: number,
    monthlyNet: number,
    hoursPerMonth?: number,
  ) => void;
  removeAsset: (id: string) => void;
  snapshot: (unitId?: string | null) => BusinessSnapshot;
  exportPayload: () => BusinessCloudPayload;
  importPayload: (payload: BusinessCloudPayload) => void;
  markCloudSynced: () => void;
};

function migratePersisted(raw: unknown): Pick<
  BusinessStore,
  | "units"
  | "transactions"
  | "deletedTransactionIds"
  | "assets"
  | "deletedAssetIds"
  | "debts"
  | "deletedUnitsArchive"
  | "passiveReceipts"
  | "selectedUnitId"
  | "cloudSyncedAt"
  | "taxRatePct"
> {
  const r = (raw ?? {}) as Record<string, unknown>;
  let units = Array.isArray(r.units)
    ? (r.units as BusinessUnit[]).filter(
        (u) => u && typeof u.id === "string" && typeof u.name === "string",
      )
    : [];
  const legacyTax =
    typeof r.taxRatePct === "number" && r.taxRatePct >= 0 && r.taxRatePct <= 100
      ? r.taxRatePct
      : 0;
  units = ensureDefaultUnit(units).map((u) => ({
    ...u,
    taxRatePct:
      typeof u.taxRatePct === "number" && u.taxRatePct >= 0 && u.taxRatePct <= 100
        ? u.taxRatePct
        : legacyTax,
    taxPeriod:
      u.taxPeriod === "month" ||
      u.taxPeriod === "quarter" ||
      u.taxPeriod === "halfyear" ||
      u.taxPeriod === "year"
        ? u.taxPeriod
        : "quarter",
  }));
  const defaultId = units[0].id;

  const transactions = (Array.isArray(r.transactions) ? r.transactions : []).map((t) => {
    const tx = t as BusinessTransaction;
    return { ...tx, unitId: tx.unitId ?? defaultId };
  });
  const deletedTransactionIds = Array.isArray(r.deletedTransactionIds)
    ? (r.deletedTransactionIds as unknown[]).filter((id): id is string => typeof id === "string")
    : [];
  const deletedTransactionIdSet = new Set(deletedTransactionIds);
  const visibleTransactions = transactions.filter((tx) => !deletedTransactionIdSet.has(tx.id));
  const deletedAssetIds = Array.isArray(r.deletedAssetIds)
    ? (r.deletedAssetIds as unknown[]).filter((id): id is string => typeof id === "string")
    : [];
  const deletedAssetIdSet = new Set(deletedAssetIds);
  const assets = (Array.isArray(r.assets) ? r.assets : [])
    .filter((a) => {
      const asset = a as BusinessAsset;
      return (
        asset &&
        typeof asset.id === "string" &&
        typeof asset.name === "string" &&
        typeof asset.unitId === "string" &&
        typeof asset.type === "string"
      );
    })
    .filter((asset) => !deletedAssetIdSet.has(asset.id))
    .map((a) => {
      const asset = a as BusinessAsset;
      const base: BusinessAsset = {
        ...asset,
        unitId: asset.unitId ?? defaultId,
        capitalValue: Math.max(0, Number(asset.capitalValue) || 0),
        monthlyNet: Math.max(0, Number(asset.monthlyNet) || 0),
      };
      const log = normalizeHousingUtilitiesLog(base);
      const { housingUtilitiesRub: _r, housingUtilitiesMonth: _m, ...rest } = base;
      return {
        ...rest,
        housingUtilitiesLog: log.length > 0 ? log : undefined,
      };
    });

  const passiveReceipts = (Array.isArray(r.passiveReceipts) ? r.passiveReceipts : []).filter(
    (item) => {
      const rec = item as BusinessPassiveReceipt;
      return (
        rec &&
        typeof rec.id === "string" &&
        typeof rec.assetId === "string" &&
        typeof rec.linkedFamilyTxId === "string" &&
        !deletedAssetIdSet.has(rec.assetId)
      );
    },
  ) as BusinessPassiveReceipt[];
  const debts: BusinessDebt[] = (Array.isArray(r.debts) ? r.debts : [])
    .filter((d) => {
      const debt = d as BusinessDebt;
      return debt && typeof debt.id === "string" && typeof debt.name === "string";
    })
    .map((d) => {
      const debt = d as BusinessDebt;
      return {
        ...debt,
        unitId: typeof debt.unitId === "string" ? debt.unitId : defaultId,
        name: debt.name.trim().slice(0, 80) || "Долг",
        balance: Math.max(0, roundMoneyUp(Number(debt.balance) || 0)),
        minPayment: Math.max(0, roundMoneyUp(Number(debt.minPayment) || 0)),
        ratePct:
          debt.ratePct == null || Number.isNaN(Number(debt.ratePct))
            ? null
            : Math.max(0, Math.min(999, Math.round(Number(debt.ratePct) * 10) / 10)),
        nextPaymentDate:
          typeof debt.nextPaymentDate === "string" && debt.nextPaymentDate
            ? debt.nextPaymentDate
            : null,
        priority: debt.priority === "high" ? "high" : "normal",
      };
    });
  const deletedUnitsArchive = (Array.isArray(r.deletedUnitsArchive)
    ? (r.deletedUnitsArchive as DeletedBusinessUnitArchive[])
    : []
  )
    .filter(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.deletedAt === "string" &&
        item.unit &&
        typeof item.unit.id === "string",
    )
    .slice(0, 30);

  return {
    units,
    transactions: visibleTransactions,
    deletedTransactionIds,
    assets,
    deletedAssetIds,
    debts,
    deletedUnitsArchive,
    passiveReceipts,
    selectedUnitId:
      typeof r.selectedUnitId === "string" ? r.selectedUnitId : units[0]?.id ?? null,
    cloudSyncedAt: typeof r.cloudSyncedAt === "string" ? r.cloudSyncedAt : null,
    taxRatePct:
      typeof r.taxRatePct === "number" && r.taxRatePct >= 0 && r.taxRatePct <= 100
        ? r.taxRatePct
        : 0,
  };
}

export const useBusinessStore = create<BusinessStore>()(
  persist(
    (set, get) => ({
      units: [defaultBusinessUnit()],
      transactions: [],
      deletedTransactionIds: [],
      assets: [],
      deletedAssetIds: [],
      debts: [],
      deletedUnitsArchive: [],
      passiveReceipts: [],
      selectedUnitId: null,
      cloudSyncedAt: null,
      taxRatePct: 0,
      setSelectedUnitId: (id) => set({ selectedUnitId: id }),
      setTaxRatePct: (pct) => {
        const n = Math.max(0, Math.min(100, Math.round(pct * 10) / 10));
        set({ taxRatePct: n });
      },
      addUnit: (name) => {
        const label = name.trim();
        if (!label) return null;
        const { units } = get();
        const unit: BusinessUnit = {
          id: makeId("unit"),
          name: label.slice(0, 60),
          color: pickUnitColor(units),
          createdAt: new Date().toISOString(),
        };
        set({ units: [...units, unit], selectedUnitId: unit.id });
        return unit.id;
      },
      removeUnit: (id) => {
        const { units, transactions, assets, debts, deletedUnitsArchive, passiveReceipts } = get();
        if (units.length <= 1) return false;
        const target = units.find((u) => u.id === id);
        if (target && target.name.trim() === PROJECTS_SERVICE_UNIT_NAME) return false;
        if (!target) return false;
        const removedAssetIds = new Set(
          assets.filter((a) => a.unitId === id).map((a) => a.id),
        );
        const archivedAssets = assets.filter((a) => a.unitId === id);
        const archivedTransactions = transactions.filter((t) => t.unitId === id);
        const archivedDebts = debts.filter((d) => d.unitId === id);
        const archivedReceipts = passiveReceipts.filter((r) => removedAssetIds.has(r.assetId));
        const archiveEntry: DeletedBusinessUnitArchive = {
          id: `${id}-${Date.now().toString(36)}`,
          deletedAt: new Date().toISOString(),
          unit: target,
          transactions: archivedTransactions,
          assets: archivedAssets,
          debts: archivedDebts,
          passiveReceipts: archivedReceipts,
        };
        const nextUnits = units.filter((u) => u.id !== id);
        set((s) => ({
          units: nextUnits,
          transactions: transactions.filter((t) => t.unitId !== id),
          deletedTransactionIds: [
            ...new Set([
              ...s.deletedTransactionIds,
              ...archivedTransactions.map((tx) => tx.id),
            ]),
          ].slice(-500),
          assets: assets.filter((a) => a.unitId !== id),
          debts: debts.filter((d) => d.unitId !== id),
          deletedUnitsArchive: [archiveEntry, ...deletedUnitsArchive].slice(0, 30),
          passiveReceipts: passiveReceipts.filter((r) => !removedAssetIds.has(r.assetId)),
          selectedUnitId: nextUnits[0]?.id ?? null,
        }));
        void pushBusinessToCloud();
        return true;
      },
      restoreDeletedUnitArchive: (archiveId) => {
        const archive = get().deletedUnitsArchive.find((item) => item.id === archiveId);
        if (!archive) return false;
        if (get().units.some((unit) => unit.id === archive.unit.id)) return false;
        set((s) => {
          const txIds = new Set(s.transactions.map((tx) => tx.id));
          const assetIds = new Set(s.assets.map((asset) => asset.id));
          const debtIds = new Set(s.debts.map((debt) => debt.id));
          const receiptIds = new Set(s.passiveReceipts.map((receipt) => receipt.id));
          return {
            units: [archive.unit, ...s.units],
            transactions: [
              ...archive.transactions.filter((tx) => !txIds.has(tx.id)),
              ...s.transactions,
            ],
            deletedTransactionIds: s.deletedTransactionIds.filter(
              (id) => !archive.transactions.some((tx) => tx.id === id),
            ),
            assets: [
              ...archive.assets.filter((asset) => !assetIds.has(asset.id)),
              ...s.assets,
            ],
            debts: [
              ...archive.debts.filter((debt) => !debtIds.has(debt.id)),
              ...s.debts,
            ],
            passiveReceipts: [
              ...archive.passiveReceipts.filter((receipt) => !receiptIds.has(receipt.id)),
              ...s.passiveReceipts,
            ],
            selectedUnitId: archive.unit.id,
            deletedUnitsArchive: s.deletedUnitsArchive.filter((item) => item.id !== archiveId),
          };
        });
        void pushBusinessToCloud();
        return true;
      },
      renameUnit: (id, name) => {
        get().updateUnitSettings(id, { name });
      },
      updateUnitSettings: (id, patch) => {
        set((s) => ({
          units: s.units.map((u) => {
            if (u.id !== id) return u;
            const next = { ...u };
            if (patch.name !== undefined) {
              const label = patch.name.trim();
              if (!label) return u;
              next.name = label.slice(0, 60);
            }
            if (patch.taxRatePct !== undefined) {
              next.taxRatePct = Math.max(0, Math.min(100, Math.round(patch.taxRatePct * 10) / 10));
            }
            if (patch.taxPeriod !== undefined) {
              next.taxPeriod = patch.taxPeriod;
            }
            return next;
          }),
        }));
        void pushBusinessToCloud();
      },
      setUnitHourlyRate: (id, rate) => {
        const n = Math.max(0, roundMoneyUp(rate));
        set((s) => ({
          units: s.units.map((u) => (u.id === id ? { ...u, hourlyRate: n > 0 ? n : undefined } : u)),
        }));
      },
      addOperatingTx: (unitId, type, amount, note, date) => {
        const amt = roundMoneyUp(amount);
        if (amt <= 0 || !get().units.some((u) => u.id === unitId)) return;
        const kind: BusinessTxKind =
          type === "income" ? "operating_income" : "operating_expense";
        const tx: BusinessTransaction = {
          id: makeId("tx"),
          unitId,
          type,
          amount: amt,
          kind,
          note: note.trim().slice(0, 120) || (type === "income" ? "Доход" : "Расход"),
          date: date ?? new Date().toISOString().slice(0, 10),
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ transactions: [tx, ...s.transactions] }));
        void pushBusinessToCloud();
      },
      transferToCushion: (unitId, amount) => {
        const amt = roundMoneyUp(amount);
        if (amt <= 0) return;
        const snap = get().snapshot(unitId);
        if (amt > Math.max(0, snap.operatingBalance)) return;
        const tx: BusinessTransaction = {
          id: makeId("tx"),
          unitId,
          type: "expense",
          amount: amt,
          kind: "cushion_deposit",
          note: "→ резерв бизнеса",
          date: new Date().toISOString().slice(0, 10),
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ transactions: [tx, ...s.transactions] }));
      },
      transferToTax: (unitId, amount) => {
        const amt = roundMoneyUp(amount);
        if (amt <= 0) return;
        const snap = get().snapshot(unitId);
        if (amt > Math.max(0, snap.operatingBalance)) return;
        const tx: BusinessTransaction = {
          id: makeId("tx"),
          unitId,
          type: "expense",
          amount: amt,
          kind: "tax_deposit",
          note: "→ налоговый счёт",
          date: new Date().toISOString().slice(0, 10),
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ transactions: [tx, ...s.transactions] }));
      },
      transferToFamily: (unitId, amount) => {
        const amt = roundMoneyUp(amount);
        if (amt <= 0) return false;
        const snap = get().snapshot(unitId);
        const available = Math.max(0, snap.operatingBalance);
        if (amt > available) return false;
        const unit = get().units.find((u) => u.id === unitId);
        const locale = useStore.getState().locale;
        const bizTxId = makeId("tx");
        const familyTxId = useStore.getState().addTransaction({
          amount: amt,
          type: "income",
          categoryId: getFallbackCategoryId("income"),
          currency: normalizeAppCurrency(),
          note: familyIncomeNoteFromBusiness(unit?.name ?? "", locale),
          date: new Date().toISOString().slice(0, 10),
          owner: "me",
          businessTxId: bizTxId,
        });
        const tx: BusinessTransaction = {
          id: bizTxId,
          unitId,
          type: "expense",
          amount: amt,
          kind: "family_withdrawal",
          note: "→ семейный бюджет",
          date: new Date().toISOString().slice(0, 10),
          createdAt: new Date().toISOString(),
          linkedFamilyTxId: familyTxId,
        };
        set((s) => ({ transactions: [tx, ...s.transactions] }));
        return true;
      },
      recordBusinessSaleToFamily: (unitId, amount) => {
        const amt = roundMoneyUp(amount);
        if (amt <= 0) return false;
        const unit = get().units.find((u) => u.id === unitId);
        if (!unit) return false;
        const locale = useStore.getState().locale;
        const bizTxId = makeId("tx");
        const note = familyIncomeNoteFromBusinessSale(unit.name, locale);
        const familyTxId = useStore.getState().addTransaction({
          amount: amt,
          type: "income",
          categoryId: getFallbackCategoryId("income"),
          currency: normalizeAppCurrency(),
          note,
          date: new Date().toISOString().slice(0, 10),
          owner: "me",
          businessTxId: bizTxId,
        });
        const tx: BusinessTransaction = {
          id: bizTxId,
          unitId,
          type: "income",
          amount: amt,
          kind: "operating_income",
          note,
          date: new Date().toISOString().slice(0, 10),
          createdAt: new Date().toISOString(),
          linkedFamilyTxId: familyTxId,
        };
        set((s) => ({ transactions: [tx, ...s.transactions] }));
        void pushBusinessToCloud();
        return true;
      },
      sellAssetToFamily: (assetId, amount) => {
        const amt = roundMoneyUp(amount);
        if (amt <= 0) return false;
        const asset = get().assets.find((a) => a.id === assetId);
        if (!asset) return false;
        const unit = get().units.find((u) => u.id === asset.unitId);
        const locale = useStore.getState().locale;
        const txDate = new Date().toISOString().slice(0, 10);
        const bizTxId = makeId("tx");
        const note = familyIncomeNoteFromAssetSale(unit?.name ?? "", asset.name, locale);
        const familyTxId = useStore.getState().addTransaction({
          amount: amt,
          type: "income",
          categoryId: getFallbackCategoryId("income"),
          currency: normalizeAppCurrency(),
          note,
          date: txDate,
          owner: "me",
          businessTxId: bizTxId,
        });
        const tx: BusinessTransaction = {
          id: bizTxId,
          unitId: asset.unitId,
          type: "income",
          amount: amt,
          kind: "operating_income",
          note,
          date: txDate,
          createdAt: new Date().toISOString(),
          linkedFamilyTxId: familyTxId,
        };
        set((s) => ({
          transactions: [tx, ...s.transactions],
          assets: s.assets.filter((a) => a.id !== assetId),
          deletedAssetIds: [...new Set([...s.deletedAssetIds, assetId])].slice(-500),
          passiveReceipts: s.passiveReceipts.filter((r) => r.assetId !== assetId),
        }));
        void pushBusinessToCloud();
        return true;
      },
      transferPassiveToFamily: (assetId, amount, date) => {
        const amt = roundMoneyUp(amount);
        if (amt <= 0) return false;
        const asset = get().assets.find((a) => a.id === assetId);
        if (!asset) return false;
        const unit = get().units.find((u) => u.id === asset.unitId);
        const locale = useStore.getState().locale;
        const txDate = date?.trim().slice(0, 10) || new Date().toISOString().slice(0, 10);
        const familyTxId = useStore.getState().addTransaction({
          amount: amt,
          type: "income",
          categoryId: getFallbackCategoryId("income"),
          currency: normalizeAppCurrency(),
          note: familyIncomeNoteFromPassive(unit?.name ?? "", asset.name, locale),
          date: txDate,
          owner: "me",
        });
        const receipt: BusinessPassiveReceipt = {
          id: makeId("pr"),
          assetId,
          amount: amt,
          date: txDate,
          linkedFamilyTxId: familyTxId,
        };
        set((s) => ({ passiveReceipts: [receipt, ...s.passiveReceipts] }));
        void pushBusinessToCloud();
        return true;
      },
      removePassiveReceiptByFamilyTxId: (familyTxId) => {
        set((s) => ({
          passiveReceipts: s.passiveReceipts.filter((r) => r.linkedFamilyTxId !== familyTxId),
        }));
        void pushBusinessToCloud();
      },
      addDebt: (unitId, data) => {
        if (!get().units.some((u) => u.id === unitId)) return null;
        const id = makeId("debt");
        const debt: BusinessDebt = {
          ...data,
          id,
          unitId,
          name: data.name.trim().slice(0, 80) || "Долг",
          balance: Math.max(0, roundMoneyUp(data.balance)),
          minPayment: Math.max(0, roundMoneyUp(data.minPayment)),
          ratePct:
            data.ratePct == null
              ? null
              : Math.max(0, Math.min(999, Math.round(data.ratePct * 10) / 10)),
          nextPaymentDate: data.nextPaymentDate?.trim() || null,
          priority: data.priority === "high" ? "high" : "normal",
          updatedAt: new Date().toISOString(),
        };
        set((s) => ({ debts: [debt, ...s.debts] }));
        void pushBusinessToCloud();
        return id;
      },
      updateDebt: (id, patch) => {
        set((s) => ({
          debts: s.debts.map((debt) => {
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
            next.priority = next.priority === "high" ? "high" : "normal";
            return next;
          }),
        }));
        void pushBusinessToCloud();
      },
      payDebt: (id, amount) => {
        const amt = roundMoneyUp(amount);
        if (amt <= 0) return false;
        let ok = false;
        let paidDebt: BusinessDebt | null = null;
        const now = new Date().toISOString();
        set((s) => {
          const debts = s.debts.map((debt) => {
            if (debt.id !== id) return debt;
            ok = true;
            paidDebt = debt;
            return {
              ...debt,
              balance: Math.max(0, roundMoneyUp(debt.balance - amt)),
              updatedAt: now,
            };
          });
          if (!paidDebt) return { debts };
          const tx: BusinessTransaction = {
            id: makeId("biz"),
            unitId: paidDebt.unitId,
            type: "expense",
            amount: amt,
            kind: "operating_expense",
            note: `Погашение долга: ${paidDebt.name}`,
            date: now.slice(0, 10),
            createdAt: now,
          };
          return {
            debts,
            transactions: [tx, ...s.transactions],
          };
        });
        if (ok) void pushBusinessToCloud();
        return ok;
      },
      removeDebt: (id) => {
        set((s) => ({ debts: s.debts.filter((d) => d.id !== id) }));
        void pushBusinessToCloud();
      },
      updateAsset: (assetId, patch) => {
        set((s) => ({
          assets: s.assets.map((a) => {
            if (a.id !== assetId) return a;
            const next = { ...a };
            if (patch.name !== undefined) {
              const label = patch.name.trim();
              if (label) next.name = label.slice(0, 80);
            }
            if (patch.monthlyNet !== undefined) {
              next.monthlyNet = Math.max(0, roundMoneyUp(patch.monthlyNet));
            }
            if (patch.capitalValue !== undefined) {
              next.capitalValue = Math.max(0, roundMoneyUp(patch.capitalValue));
            }
            if (patch.hoursPerMonth !== undefined) {
              next.hoursPerMonth =
                patch.hoursPerMonth > 0 ? Math.round(patch.hoursPerMonth) : undefined;
            }
            return next;
          }),
        }));
        void pushBusinessToCloud();
      },
      setAssetUtilitiesMonth: (assetId, monthKey, amountRub) => {
        set((s) => ({
          assets: s.assets.map((a) => {
            if (a.id !== assetId || a.type !== "rental") return a;
            const log = upsertUtilitiesLogEntry(a.housingUtilitiesLog, monthKey, amountRub);
            const { housingUtilitiesRub: _r, housingUtilitiesMonth: _m, ...rest } = a;
            return { ...rest, housingUtilitiesLog: log };
          }),
        }));
        void pushBusinessToCloud();
      },
      ensureProjectsUnitId: () => {
        const existing = get().units.find(
          (u) => u.name.trim() === PROJECTS_SERVICE_UNIT_NAME,
        );
        if (existing) return existing.id;
        const id = get().addUnit(PROJECTS_SERVICE_UNIT_NAME);
        return id ?? get().units[0]!.id;
      },
      updateTransaction: (id, patch) => {
        const tx = get().transactions.find((t) => t.id === id);
        if (!tx) return false;

        const amt =
          patch.amount !== undefined ? roundMoneyUp(patch.amount) : tx.amount;
        if (amt <= 0) return false;

        const isOperating =
          tx.kind === "operating_income" || tx.kind === "operating_expense";
        let type = tx.type;
        let kind = tx.kind;

        if (isOperating && patch.type) {
          type = patch.type;
          kind = type === "income" ? "operating_income" : "operating_expense";
        }

        const noteRaw = patch.note !== undefined ? patch.note.trim() : tx.note;
        const note =
          noteRaw.length > 0
            ? noteRaw.slice(0, 120)
            : isOperating
              ? type === "income"
                ? "Доход"
                : "Расход"
              : tx.note;
        const date = patch.date?.trim().slice(0, 10) || tx.date;
        const unitId =
          patch.unitId && get().units.some((u) => u.id === patch.unitId)
            ? patch.unitId
            : tx.unitId;

        const next: BusinessTransaction = {
          ...tx,
          unitId,
          type,
          amount: amt,
          kind,
          note,
          date,
        };

        if (tx.linkedFamilyTxId && (patch.amount !== undefined || patch.date !== undefined)) {
          useStore.getState().updateTransaction(tx.linkedFamilyTxId, {
            amount: amt,
            ...(patch.date !== undefined ? { date } : {}),
          });
        }

        set((s) => ({
          transactions: s.transactions.map((t) => (t.id === id ? next : t)),
        }));
        return true;
      },
      removeTransaction: (id, opts) => {
        const tx = get().transactions.find((t) => t.id === id);
        if (
          !opts?.skipFamilyLink &&
          tx?.linkedFamilyTxId
        ) {
          useStore.getState().deleteTransaction(tx.linkedFamilyTxId, {
            skipBusinessLink: true,
          });
        }
        set((s) => ({
          transactions: s.transactions.filter((t) => t.id !== id),
          deletedTransactionIds: [...new Set([...s.deletedTransactionIds, id])].slice(-500),
        }));
        void pushBusinessToCloud();
      },
      addAsset: (unitId, type, name, capitalValue, monthlyNet, hoursPerMonth) => {
        const label = name.trim();
        if (!label || !get().units.some((u) => u.id === unitId)) return;
        const asset: BusinessAsset = {
          id: makeId("asset"),
          unitId,
          type,
          name: label.slice(0, 80),
          capitalValue: Math.max(0, roundMoneyUp(capitalValue)),
          monthlyNet: roundMoneyUp(monthlyNet),
          hoursPerMonth:
            type === "freelance" && hoursPerMonth && hoursPerMonth > 0
              ? Math.round(hoursPerMonth)
              : undefined,
        };
        set((s) => ({ assets: [asset, ...s.assets] }));
        void pushBusinessToCloud();
      },
      removeAsset: (id) => {
        set((s) => ({
          assets: s.assets.filter((a) => a.id !== id),
          deletedAssetIds: [...new Set([...s.deletedAssetIds, id])].slice(-500),
          passiveReceipts: s.passiveReceipts.filter((r) => r.assetId !== id),
        }));
        void pushBusinessToCloud();
      },
      snapshot: (unitId) => {
        const id = unitId === undefined ? get().selectedUnitId : unitId;
        return buildBusinessSnapshot(
          get().transactions,
          get().assets,
          id,
          new Date(),
          get().taxRatePct,
          get().debts,
        );
      },
      exportPayload: () => ({
        version: 2,
        units: get().units,
        transactions: get().transactions,
        deletedTransactionIds: get().deletedTransactionIds,
        assets: get().assets,
        deletedAssetIds: get().deletedAssetIds,
        debts: get().debts,
        deletedUnitsArchive: get().deletedUnitsArchive,
        passiveReceipts: get().passiveReceipts,
        taxRatePct: get().taxRatePct,
        selectedUnitId: get().selectedUnitId,
      }),
      importPayload: (payload) => {
        const currentSelectedUnitId = get().selectedUnitId;
        const data = migratePersisted(payload);
        const selectedUnitId =
          payload.selectedUnitId !== undefined
            ? data.selectedUnitId
            : currentSelectedUnitId &&
                data.units.some((unit) => unit.id === currentSelectedUnitId)
              ? currentSelectedUnitId
              : data.selectedUnitId;
        set((s) => ({
          ...s,
          ...data,
          selectedUnitId,
        }));
      },
      markCloudSynced: () => set({ cloudSyncedAt: new Date().toISOString() }),
    }),
    {
      name: "voicebudget-business-preview-v2",
      version: 2,
      migrate: (persisted) => migratePersisted(persisted),
      partialize: (state) => ({
        units: state.units,
        transactions: state.transactions,
        deletedTransactionIds: state.deletedTransactionIds,
        assets: state.assets,
        deletedAssetIds: state.deletedAssetIds,
        debts: state.debts,
        deletedUnitsArchive: state.deletedUnitsArchive,
        passiveReceipts: state.passiveReceipts,
        selectedUnitId: state.selectedUnitId,
        cloudSyncedAt: state.cloudSyncedAt,
        taxRatePct: state.taxRatePct,
      }),
    },
  ),
);

export function useBusinessSnapshot(unitId?: string | null): BusinessSnapshot {
  const transactions = useBusinessStore((s) => s.transactions);
  const assets = useBusinessStore((s) => s.assets);
  const debts = useBusinessStore((s) => s.debts);
  const selectedUnitId = useBusinessStore((s) => s.selectedUnitId);
  const taxRatePct = useBusinessStore((s) => s.taxRatePct);
  const id = unitId === undefined ? selectedUnitId : unitId;
  return buildBusinessSnapshot(transactions, assets, id, new Date(), taxRatePct, debts);
}

export type BusinessTxKind =
  | "operating_income"
  | "operating_expense"
  | "cushion_deposit"
  | "tax_deposit"
  | "family_withdrawal";

export type BusinessTransaction = {
  id: string;
  unitId: string;
  type: "income" | "expense";
  amount: number;
  kind: BusinessTxKind;
  note: string;
  date: string;
  /** Когда операция была добавлена в приложение. Для старых операций берём время из id. */
  createdAt?: string;
  /** Связанная операция во вкладке «Семья» (перевод себе) */
  linkedFamilyTxId?: string;
};

export type BusinessAssetType = "investment" | "rental" | "freelance";

/** Журнал ЖКХ по месяцам (YYYY-MM) для недвижимости — синхронизируется в облаке в assets. */
export type HousingUtilitiesEntry = {
  month: string;
  amount: number;
  updatedAt?: string;
};

export type BusinessAsset = {
  id: string;
  unitId: string;
  type: BusinessAssetType;
  name: string;
  capitalValue: number;
  /** Плановый пассив в месяц (справочник, не сумма перевода) */
  monthlyNet: number;
  /** Журнал ЖКХ по месяцам (недвижимость). */
  housingUtilitiesLog?: HousingUtilitiesEntry[];
  /** @deprecated миграция в housingUtilitiesLog */
  housingUtilitiesRub?: number;
  /** @deprecated миграция в housingUtilitiesLog */
  housingUtilitiesMonth?: string;
  /** Для фриланса: часов в месяц — чтобы посчитать ₽/ч */
  hoursPerMonth?: number;
};

/** Зачисление пассива с проекта в семейный бюджет (история по проекту). */
export type BusinessPassiveReceipt = {
  id: string;
  assetId: string;
  amount: number;
  date: string;
  linkedFamilyTxId: string;
};

export type BusinessTaxPeriod = "month" | "quarter" | "halfyear" | "year";

export type BusinessDebt = {
  id: string;
  unitId: string;
  name: string;
  balance: number;
  minPayment: number;
  ratePct: number | null;
  nextPaymentDate: string | null;
  priority: "normal" | "high";
  updatedAt?: string;
};

export type BusinessUnit = {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  /** Целевая стоимость часа, ₽ */
  hourlyRate?: number;
  /** Ставка налога для этого бизнеса, % */
  taxRatePct?: number;
  /** За какой период считать резерв налога */
  taxPeriod?: BusinessTaxPeriod;
};

export type DeletedBusinessUnitArchive = {
  id: string;
  deletedAt: string;
  unit: BusinessUnit;
  transactions: BusinessTransaction[];
  assets: BusinessAsset[];
  debts: BusinessDebt[];
  passiveReceipts: BusinessPassiveReceipt[];
};

export type BusinessUnitPeriodStats = {
  unitId: string;
  income: number;
  expense: number;
  remaining: number;
};

export type BusinessIncomeSource = {
  label: string;
  amount: number;
};

export type BusinessPeriodStats = {
  income: number;
  expense: number;
  profit: number;
  profitMarginPct: number;
};

export type BusinessExpenseRow = {
  label: string;
  amount: number;
};

export type BusinessAssetsByType = {
  investment: BusinessAsset[];
  rental: BusinessAsset[];
  freelance: BusinessAsset[];
};

export type BusinessSnapshot = {
  operatingBalance: number;
  cushionBalance: number;
  cushionTarget: number;
  cushionGap: number;
  avgMonthlyExpense: number;
  monthIncome: number;
  monthExpense: number;
  monthProfit: number;
  canToCushion: number;
  canToFamily: number;
  assetsAnnualIncome: number;
  totalCapital: number;
  passiveIncomeMonthly: number;
  weightedYieldPct: number;
  runwayMonths: number;
  suggestedTaxReserve: number;
  debtBalance: number;
  debtMinPayment: number;
};

export type BusinessCloudPayload = {
  version: 2;
  units: BusinessUnit[];
  transactions: BusinessTransaction[];
  deletedTransactionIds?: string[];
  assets: BusinessAsset[];
  deletedAssetIds?: string[];
  passiveReceipts?: BusinessPassiveReceipt[];
  debts?: BusinessDebt[];
  deletedUnitsArchive?: DeletedBusinessUnitArchive[];
  taxRatePct?: number;
  selectedUnitId?: string | null;
};

export const BUSINESS_UNIT_COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
  "#ef4444",
  "#3b82f6",
] as const;

export function defaultBusinessUnit(name = "Мой бизнес"): BusinessUnit {
  return {
    id: `unit-${Date.now().toString(36)}`,
    name: name.slice(0, 60),
    color: BUSINESS_UNIT_COLORS[0],
    createdAt: new Date().toISOString(),
  };
}

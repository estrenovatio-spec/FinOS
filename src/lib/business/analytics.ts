import type { BudgetPeriod } from "@/lib/budget-period";
import { isDateInBudgetPeriod } from "@/lib/budget-period";
import { roundMoneyUp } from "@/lib/format-money";
import { unitTaxReserve } from "@/lib/business/tax";
import type {
  BusinessAsset,
  BusinessAssetType,
  BusinessAssetsByType,
  BusinessDebt,
  BusinessExpenseRow,
  BusinessIncomeSource,
  BusinessPeriodStats,
  BusinessSnapshot,
  BusinessTaxPeriod,
  BusinessTransaction,
  BusinessUnit,
  BusinessUnitPeriodStats,
} from "@/lib/business/types";

function parseDay(date: string): Date {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function isOperating(tx: BusinessTransaction): boolean {
  return tx.kind === "operating_income" || tx.kind === "operating_expense";
}

function inPeriod(tx: BusinessTransaction, period: BudgetPeriod): boolean {
  return isDateInBudgetPeriod(tx.date, period);
}

function signedOperatingEffect(tx: BusinessTransaction): number {
  const amt = roundMoneyUp(tx.amount);
  switch (tx.kind) {
    case "operating_income":
      return amt;
    case "operating_expense":
    case "cushion_deposit":
    case "tax_deposit":
    case "family_withdrawal":
      return -amt;
    default:
      return 0;
  }
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function filterUnitTxs(
  transactions: BusinessTransaction[],
  unitId: string | null,
): BusinessTransaction[] {
  if (!unitId) return transactions;
  return transactions.filter((tx) => tx.unitId === unitId);
}

export function calcOperatingBalance(transactions: BusinessTransaction[]): number {
  return transactions.reduce((acc, tx) => acc + signedOperatingEffect(tx), 0);
}

export function calcCushionBalance(transactions: BusinessTransaction[]): number {
  return transactions.reduce((acc, tx) => {
    if (tx.kind === "cushion_deposit") return acc + roundMoneyUp(tx.amount);
    return acc;
  }, 0);
}

export function calcTaxDepositBalance(transactions: BusinessTransaction[]): number {
  return transactions.reduce((acc, tx) => {
    if (tx.kind === "tax_deposit") return acc + roundMoneyUp(tx.amount);
    return acc;
  }, 0);
}

export function avgMonthlyOperatingExpense(
  transactions: BusinessTransaction[],
  unitId: string | null = null,
  now = new Date(),
): number {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 90);
  const scoped = filterUnitTxs(transactions, unitId);
  const currentMonth = monthKey(now);
  const expenses = scoped.filter(
    (tx) =>
      tx.kind === "operating_expense" &&
      parseDay(tx.date).getTime() >= cutoff.getTime(),
  );
  if (expenses.length === 0) return 0;
  const total = expenses.reduce((s, tx) => s + roundMoneyUp(tx.amount), 0);
  const currentMonthExpense = expenses
    .filter((tx) => monthKey(parseDay(tx.date)) === currentMonth)
    .reduce((s, tx) => s + roundMoneyUp(tx.amount), 0);
  return Math.max(total / 3, currentMonthExpense);
}

export type UnitCardMetrics = {
  unitId: string;
  income: number;
  expense: number;
  profit: number;
  profitMarginPct: number;
  runwayMonths: number;
  passiveMonthly: number;
  avgMonthlyExpense: number;
  cushionBalance: number;
  cushionTarget: number;
  canToCushion: number;
  operatingBalance: number;
  taxReserve: number;
  taxDeposited: number;
  taxGap: number;
  taxRatePct: number;
  taxPeriod: BusinessTaxPeriod;
  debtBalance: number;
  debtMinPayment: number;
};

/** Сводка выбранного бизнеса: период + KPI по юниту. */
export function unitCardMetrics(
  transactions: BusinessTransaction[],
  assets: BusinessAsset[],
  unit: BusinessUnit,
  period: BudgetPeriod,
  now = new Date(),
  debts: BusinessDebt[] = [],
): UnitCardMetrics {
  const taxRate = unit.taxRatePct ?? 0;
  const taxPeriod = unit.taxPeriod ?? "quarter";
  const periodStats = periodOperatingStats(transactions, period, unit.id);
  const snap = buildBusinessSnapshot(transactions, assets, unit.id, now, taxRate, debts);
  const taxReserve = unitTaxReserve(transactions, unit.id, taxRate, taxPeriod, now);
  const taxDeposited = calcTaxDepositBalance(filterUnitTxs(transactions, unit.id));
  return {
    unitId: unit.id,
    income: periodStats.income,
    expense: periodStats.expense,
    profit: periodStats.profit,
    profitMarginPct: periodStats.profitMarginPct,
    runwayMonths: snap.runwayMonths,
    passiveMonthly: snap.passiveIncomeMonthly,
    avgMonthlyExpense: snap.avgMonthlyExpense,
    cushionBalance: snap.cushionBalance,
    cushionTarget: snap.cushionTarget,
    canToCushion: snap.canToCushion,
    operatingBalance: snap.operatingBalance,
    taxReserve,
    taxDeposited,
    taxGap: Math.max(0, roundMoneyUp(taxReserve - taxDeposited)),
    taxRatePct: taxRate,
    taxPeriod,
    debtBalance: snap.debtBalance,
    debtMinPayment: snap.debtMinPayment,
  };
}

export function unitPeriodStats(
  transactions: BusinessTransaction[],
  unitId: string,
  period: BudgetPeriod,
): BusinessUnitPeriodStats {
  let income = 0;
  let expense = 0;
  let remaining = 0;
  for (const tx of transactions) {
    if (tx.unitId !== unitId) continue;
    if (!inPeriod(tx, period) && tx.kind !== "cushion_deposit" && tx.kind !== "family_withdrawal") {
      /* balance uses all time for remaining */
    }
    remaining += signedOperatingEffect(tx);
    if (!inPeriod(tx, period)) continue;
    if (tx.kind === "operating_income") income += roundMoneyUp(tx.amount);
    if (tx.kind === "operating_expense") expense += roundMoneyUp(tx.amount);
  }
  return {
    unitId,
    income: roundMoneyUp(income),
    expense: roundMoneyUp(expense),
    remaining: roundMoneyUp(remaining),
  };
}

export function incomeSourcesForPeriod(
  transactions: BusinessTransaction[],
  period: BudgetPeriod,
  unitId: string | null = null,
): BusinessIncomeSource[] {
  const map = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.kind !== "operating_income" || tx.type !== "income") continue;
    if (unitId && tx.unitId !== unitId) continue;
    if (!inPeriod(tx, period)) continue;
    const label = tx.note.trim() || "Доход";
    map.set(label, (map.get(label) ?? 0) + roundMoneyUp(tx.amount));
  }
  return Array.from(map.entries())
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export function assetEffectiveHourlyRate(asset: BusinessAsset): number {
  if (asset.type !== "freelance" || !asset.hoursPerMonth || asset.hoursPerMonth <= 0) return 0;
  return Math.round((roundMoneyUp(asset.monthlyNet) / asset.hoursPerMonth) * 10) / 10;
}

export function impliedOperatingHourlyRate(monthProfit: number, hoursPerMonth = 160): number {
  if (hoursPerMonth <= 0) return 0;
  return Math.round((roundMoneyUp(monthProfit) / hoursPerMonth) * 10) / 10;
}

export function assetAnnualYieldPct(asset: BusinessAsset): number {
  const cap = roundMoneyUp(asset.capitalValue);
  if (cap <= 0) return 0;
  const annual = roundMoneyUp(asset.monthlyNet * 12);
  return Math.round((annual / cap) * 1000) / 10;
}

export function assetsSummary(assets: BusinessAsset[], unitId: string | null = null): {
  totalCapital: number;
  annualIncome: number;
} {
  let totalCapital = 0;
  let annualIncome = 0;
  for (const a of assets) {
    if (unitId && a.unitId !== unitId) continue;
    totalCapital += roundMoneyUp(a.capitalValue);
    annualIncome += roundMoneyUp(a.monthlyNet * 12);
  }
  return { totalCapital: roundMoneyUp(totalCapital), annualIncome: roundMoneyUp(annualIncome) };
}

export function weightedPortfolioYieldPct(assets: BusinessAsset[]): number {
  let totalCap = 0;
  let weighted = 0;
  for (const a of assets) {
    const cap = roundMoneyUp(a.capitalValue);
    if (cap <= 0) continue;
    totalCap += cap;
    weighted += cap * assetAnnualYieldPct(a);
  }
  if (totalCap <= 0) return 0;
  return Math.round((weighted / totalCap) * 10) / 10;
}

export function groupAssetsByType(
  assets: BusinessAsset[],
  unitId: string | null = null,
): BusinessAssetsByType {
  const result: BusinessAssetsByType = { investment: [], rental: [], freelance: [] };
  for (const a of assets) {
    if (unitId && a.unitId !== unitId) continue;
    result[a.type].push(a);
  }
  return result;
}

export function passiveIncomeMonthly(assets: BusinessAsset[], unitId: string | null = null): number {
  let total = 0;
  for (const a of assets) {
    if (unitId && a.unitId !== unitId) continue;
    total += roundMoneyUp(a.monthlyNet);
  }
  return roundMoneyUp(total);
}

export function runwayMonths(operatingBalance: number, avgMonthlyExpense: number): number {
  if (avgMonthlyExpense <= 0) return operatingBalance > 0 ? 99 : 0;
  return Math.round((Math.max(0, operatingBalance) / avgMonthlyExpense) * 10) / 10;
}

export function profitMarginPct(income: number, expense: number): number {
  if (income <= 0) return 0;
  return Math.round(((income - expense) / income) * 1000) / 10;
}

export function periodOperatingStats(
  transactions: BusinessTransaction[],
  period: BudgetPeriod,
  unitId: string | null = null,
): BusinessPeriodStats {
  let income = 0;
  let expense = 0;
  for (const tx of transactions) {
    if (unitId && tx.unitId !== unitId) continue;
    if (!inPeriod(tx, period)) continue;
    if (tx.kind === "operating_income") income += roundMoneyUp(tx.amount);
    if (tx.kind === "operating_expense") expense += roundMoneyUp(tx.amount);
  }
  income = roundMoneyUp(income);
  expense = roundMoneyUp(expense);
  return {
    income,
    expense,
    profit: roundMoneyUp(income - expense),
    profitMarginPct: profitMarginPct(income, expense),
  };
}

export function expenseBreakdownForPeriod(
  transactions: BusinessTransaction[],
  period: BudgetPeriod,
  unitId: string | null = null,
): BusinessExpenseRow[] {
  const map = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.kind !== "operating_expense") continue;
    if (unitId && tx.unitId !== unitId) continue;
    if (!inPeriod(tx, period)) continue;
    const label = tx.note.trim() || "Расход";
    map.set(label, (map.get(label) ?? 0) + roundMoneyUp(tx.amount));
  }
  return Array.from(map.entries())
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export function typeAssetsSummary(assets: BusinessAsset[], type: BusinessAssetType): {
  count: number;
  capital: number;
  monthlyNet: number;
  yieldPct: number;
} {
  let capital = 0;
  let monthlyNet = 0;
  for (const a of assets) {
    if (a.type !== type) continue;
    capital += roundMoneyUp(a.capitalValue);
    monthlyNet += roundMoneyUp(a.monthlyNet);
  }
  const yieldPct = capital > 0 ? Math.round(((monthlyNet * 12) / capital) * 1000) / 10 : 0;
  return {
    count: assets.filter((a) => a.type === type).length,
    capital: roundMoneyUp(capital),
    monthlyNet: roundMoneyUp(monthlyNet),
    yieldPct,
  };
}

export function buildBusinessSnapshot(
  transactions: BusinessTransaction[],
  assets: BusinessAsset[],
  unitId: string | null = null,
  now = new Date(),
  taxRatePct = 0,
  debts: BusinessDebt[] = [],
): BusinessSnapshot {
  const scopedTxs = filterUnitTxs(transactions, unitId);
  const scopedAssets = unitId ? assets.filter((a) => a.unitId === unitId) : assets;
  const scopedDebts = unitId ? debts.filter((d) => d.unitId === unitId) : debts;

  const operatingBalance = calcOperatingBalance(scopedTxs);
  const cushionBalance = calcCushionBalance(scopedTxs);
  const avgMonthlyExpense = avgMonthlyOperatingExpense(transactions, unitId, now);
  const cushionTarget = roundMoneyUp(avgMonthlyExpense * 3);
  const cushionGap = Math.max(0, roundMoneyUp(cushionTarget - cushionBalance));

  const mk = monthKey(now);
  let monthIncome = 0;
  let monthExpense = 0;
  for (const tx of scopedTxs) {
    if (!isOperating(tx)) continue;
    if (monthKey(parseDay(tx.date)) !== mk) continue;
    if (tx.type === "income") monthIncome += roundMoneyUp(tx.amount);
    else monthExpense += roundMoneyUp(tx.amount);
  }
  monthIncome = roundMoneyUp(monthIncome);
  monthExpense = roundMoneyUp(monthExpense);
  const monthProfit = roundMoneyUp(monthIncome - monthExpense);

  const liquid = Math.max(0, operatingBalance);
  const canToCushion =
    cushionGap > 0
      ? roundMoneyUp(Math.min(liquid, cushionGap))
      : roundMoneyUp(liquid);
  const canToFamily = roundMoneyUp(liquid);

  const { totalCapital, annualIncome: assetsAnnualIncome } = assetsSummary(scopedAssets);
  const passiveMonthly = passiveIncomeMonthly(scopedAssets);
  const weightedYield = weightedPortfolioYieldPct(scopedAssets);
  const monthsRunway = runwayMonths(operatingBalance, avgMonthlyExpense);
  const suggestedTaxReserve =
    taxRatePct > 0 ? roundMoneyUp((monthIncome * taxRatePct) / 100) : 0;
  const debtBalance = roundMoneyUp(scopedDebts.reduce((s, d) => s + Math.max(0, d.balance), 0));
  const debtMinPayment = roundMoneyUp(
    scopedDebts.reduce((s, d) => s + Math.max(0, d.minPayment), 0),
  );

  return {
    operatingBalance,
    cushionBalance,
    cushionTarget,
    cushionGap,
    avgMonthlyExpense,
    monthIncome,
    monthExpense,
    monthProfit,
    canToCushion,
    canToFamily,
    assetsAnnualIncome,
    totalCapital,
    passiveIncomeMonthly: passiveMonthly,
    weightedYieldPct: weightedYield,
    runwayMonths: monthsRunway,
    suggestedTaxReserve,
    debtBalance,
    debtMinPayment,
  };
}

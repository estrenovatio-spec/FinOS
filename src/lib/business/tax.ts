import type { BusinessTaxPeriod, BusinessTransaction } from "@/lib/business/types";
import { roundMoneyUp } from "@/lib/format-money";

function parseDay(date: string): Date {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthsBack(now: Date, count: number): string[] {
  const keys: string[] = [];
  const d = new Date(now);
  for (let i = 0; i < count; i++) {
    keys.push(monthKey(d));
    d.setMonth(d.getMonth() - 1);
  }
  return keys;
}

/** Операционный доход юнита за окно для расчёта налога. */
export function unitOperatingIncomeForTax(
  transactions: BusinessTransaction[],
  unitId: string,
  taxPeriod: BusinessTaxPeriod,
  now = new Date(),
): number {
  const months =
    taxPeriod === "month"
      ? 1
      : taxPeriod === "quarter"
        ? 3
        : taxPeriod === "halfyear"
          ? 6
          : 12;
  const keys = new Set(monthsBack(now, months));
  let income = 0;
  for (const tx of transactions) {
    if (tx.unitId !== unitId || tx.kind !== "operating_income") continue;
    if (!keys.has(monthKey(parseDay(tx.date)))) continue;
    income += roundMoneyUp(tx.amount);
  }
  return roundMoneyUp(income);
}

export function unitTaxReserve(
  transactions: BusinessTransaction[],
  unitId: string,
  taxRatePct: number,
  taxPeriod: BusinessTaxPeriod,
  now = new Date(),
): number {
  if (taxRatePct <= 0) return 0;
  const income = unitOperatingIncomeForTax(transactions, unitId, taxPeriod, now);
  return roundMoneyUp((income * taxRatePct) / 100);
}

export function taxPeriodLabel(period: BusinessTaxPeriod, locale: "ru" | "en"): string {
  if (locale === "en") {
    if (period === "month") return "month";
    if (period === "quarter") return "quarter";
    if (period === "halfyear") return "6 mo";
    return "year";
  }
  if (period === "month") return "месяц";
  if (period === "quarter") return "квартал";
  if (period === "halfyear") return "полгода";
  return "год";
}

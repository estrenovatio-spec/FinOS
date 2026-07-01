import type { BusinessAsset, HousingUtilitiesEntry } from "@/lib/business/types";
import { roundMoneyUp } from "@/lib/format-money";

export function currentUtilitiesMonthKey(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

export function normalizeHousingUtilitiesLog(
  asset: BusinessAsset,
): HousingUtilitiesEntry[] {
  const raw = Array.isArray(asset.housingUtilitiesLog) ? asset.housingUtilitiesLog : [];
  const map = new Map<string, number>();

  for (const item of raw) {
    if (!item || typeof item.month !== "string" || !/^\d{4}-\d{2}$/.test(item.month)) continue;
    const amount = Math.max(0, roundMoneyUp(Number(item.amount) || 0));
    if (amount > 0) map.set(item.month, amount);
  }

  if (
    asset.type === "rental" &&
    typeof asset.housingUtilitiesMonth === "string" &&
    /^\d{4}-\d{2}$/.test(asset.housingUtilitiesMonth) &&
    typeof asset.housingUtilitiesRub === "number" &&
    asset.housingUtilitiesRub > 0 &&
    !map.has(asset.housingUtilitiesMonth)
  ) {
    map.set(asset.housingUtilitiesMonth, roundMoneyUp(asset.housingUtilitiesRub));
  }

  return Array.from(map.entries())
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

export function utilitiesAmountForMonth(
  asset: BusinessAsset,
  monthKey = currentUtilitiesMonthKey(),
): number {
  if (asset.type !== "rental") return 0;
  const entry = normalizeHousingUtilitiesLog(asset).find((e) => e.month === monthKey);
  return entry?.amount ?? 0;
}

export function upsertUtilitiesLogEntry(
  log: HousingUtilitiesEntry[] | undefined,
  monthKey: string,
  amountRub: number,
): HousingUtilitiesEntry[] | undefined {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return log;
  const next = [...(log ?? [])];
  const amount = Math.max(0, roundMoneyUp(amountRub));
  const idx = next.findIndex((e) => e.month === monthKey);
  if (amount <= 0) {
    if (idx >= 0) next.splice(idx, 1);
  } else {
    const entry: HousingUtilitiesEntry = {
      month: monthKey,
      amount,
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) next[idx] = entry;
    else next.push(entry);
  }
  next.sort((a, b) => b.month.localeCompare(a.month));
  return next.length > 0 ? next : undefined;
}

export type UtilitiesYearGroup = {
  year: string;
  total: number;
  months: { monthKey: string; amount: number; netAfter: number }[];
};

export function groupUtilitiesByYear(asset: BusinessAsset): UtilitiesYearGroup[] {
  const gross = Math.max(0, roundMoneyUp(asset.monthlyNet));
  const log = normalizeHousingUtilitiesLog(asset);
  const byYear = new Map<string, UtilitiesYearGroup>();

  for (const e of log) {
    const year = e.month.slice(0, 4);
    let group = byYear.get(year);
    if (!group) {
      group = { year, total: 0, months: [] };
      byYear.set(year, group);
    }
    group.months.push({
      monthKey: e.month,
      amount: e.amount,
      netAfter: Math.max(0, gross - e.amount),
    });
    group.total += e.amount;
  }

  for (const g of byYear.values()) {
    g.months.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }

  return Array.from(byYear.values()).sort((a, b) => b.year.localeCompare(a.year));
}

export function formatUtilitiesMonthLabel(monthKey: string, locale: "ru" | "en"): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(y, m - 1, 1));
}

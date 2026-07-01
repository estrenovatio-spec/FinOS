import { passiveReceiptsForAsset } from "@/lib/business/passive";
import type { BusinessPassiveReceipt } from "@/lib/business/types";
import { roundMoneyUp } from "@/lib/format-money";

export type PassiveReceiptMonthGroup = {
  monthKey: string;
  count: number;
  total: number;
  receipts: BusinessPassiveReceipt[];
};

export type PassiveReceiptYearGroup = {
  year: string;
  count: number;
  total: number;
  months: PassiveReceiptMonthGroup[];
};

export function groupPassiveReceiptsByYear(
  receipts: BusinessPassiveReceipt[],
  assetId: string,
): PassiveReceiptYearGroup[] {
  const list = passiveReceiptsForAsset(receipts, assetId);
  const yearMap = new Map<string, Map<string, BusinessPassiveReceipt[]>>();

  for (const r of list) {
    const y = r.date.slice(0, 4);
    const m = r.date.slice(0, 7);
    if (!yearMap.has(y)) yearMap.set(y, new Map());
    const months = yearMap.get(y)!;
    const bucket = months.get(m) ?? [];
    bucket.push(r);
    months.set(m, bucket);
  }

  const years: PassiveReceiptYearGroup[] = [];
  for (const year of Array.from(yearMap.keys()).sort((a, b) => b.localeCompare(a))) {
    const monthsMap = yearMap.get(year)!;
    const months: PassiveReceiptMonthGroup[] = [];
    let yearCount = 0;
    let yearTotal = 0;

    for (const monthKey of Array.from(monthsMap.keys()).sort((a, b) => b.localeCompare(a))) {
      const bucket = monthsMap.get(monthKey)!;
      let total = 0;
      for (const r of bucket) total += roundMoneyUp(r.amount);
      total = roundMoneyUp(total);
      yearCount += bucket.length;
      yearTotal += total;
      months.push({
        monthKey,
        count: bucket.length,
        total,
        receipts: bucket.sort((a, b) => b.date.localeCompare(a.date)),
      });
    }

    years.push({
      year,
      count: yearCount,
      total: roundMoneyUp(yearTotal),
      months,
    });
  }

  return years;
}

export function formatReceiptMonthLabel(monthKey: string, locale: "ru" | "en"): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(y, m - 1, 1));
}

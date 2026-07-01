import type { BusinessAsset } from "@/lib/business/types";
import { roundMoneyUp } from "@/lib/format-money";
import {
  currentUtilitiesMonthKey,
  normalizeHousingUtilitiesLog,
  utilitiesAmountForMonth,
} from "@/lib/business/housing-utilities-log";

export { currentUtilitiesMonthKey } from "@/lib/business/housing-utilities-log";

/** ЖКХ за календарный месяц из журнала. */
export function rentalUtilitiesForMonth(
  asset: BusinessAsset,
  monthKey = currentUtilitiesMonthKey(),
): number {
  return utilitiesAmountForMonth(asset, monthKey);
}

/** Плановый доход минус ЖКХ этого месяца (не меньше 0). */
export function rentalEffectiveMonthlyNet(
  asset: BusinessAsset,
  monthKey = currentUtilitiesMonthKey(),
): number {
  const gross = Math.max(0, roundMoneyUp(asset.monthlyNet));
  return Math.max(0, gross - rentalUtilitiesForMonth(asset, monthKey));
}

export function sumRentalUtilities(
  assets: BusinessAsset[],
  monthKey = currentUtilitiesMonthKey(),
): number {
  return assets
    .filter((a) => a.type === "rental")
    .reduce((s, a) => s + rentalUtilitiesForMonth(a, monthKey), 0);
}

export function sumRentalEffectiveMonthly(
  assets: BusinessAsset[],
  monthKey = currentUtilitiesMonthKey(),
): number {
  return assets
    .filter((a) => a.type === "rental")
    .reduce((s, a) => s + rentalEffectiveMonthlyNet(a, monthKey), 0);
}

/** Среднее ЖКХ по месяцам с записями (для динамики). */
export function rentalUtilitiesAverage(asset: BusinessAsset): number | null {
  const log = normalizeHousingUtilitiesLog(asset);
  if (log.length === 0) return null;
  const sum = log.reduce((s, e) => s + e.amount, 0);
  return roundMoneyUp(sum / log.length);
}

import type { BusinessPassiveReceipt } from "@/lib/business/types";
import { roundMoneyUp } from "@/lib/format-money";

export function passiveReceivedTotal(
  receipts: BusinessPassiveReceipt[],
  assetId: string,
): number {
  let sum = 0;
  for (const r of receipts) {
    if (r.assetId === assetId) sum += roundMoneyUp(r.amount);
  }
  return roundMoneyUp(sum);
}

export function passiveReceiptsForAsset(
  receipts: BusinessPassiveReceipt[],
  assetId: string,
): BusinessPassiveReceipt[] {
  return receipts
    .filter((r) => r.assetId === assetId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

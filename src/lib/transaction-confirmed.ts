import type { Transaction } from "@/types";
import { isPartnerTransferCategory } from "@/lib/partner-transfer";

/** Учитывается в балансе и статистике (регулярные — после подтверждения). */
export function countsInBalance(tx: Transaction): boolean {
  return tx.confirmed !== false;
}

/** Переводы между супругами не меняют сумму «всего в семье». */
export function countsInHouseholdTotal(tx: Transaction): boolean {
  if (!countsInBalance(tx)) return false;
  return !isPartnerTransferCategory(tx.categoryId);
}

export function isPendingTransaction(tx: Transaction): boolean {
  return tx.confirmed === false;
}

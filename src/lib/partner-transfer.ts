import { normalizeAppCurrency } from "@/lib/app-currency";
import { roundMoneyUp } from "@/lib/format-money";
import type { BudgetOwner, ParsedTransaction, Transaction } from "@/types";

/** Внутренний перевод между «мной» и партнёром — в общий баланс не входит. */
export const PARTNER_TRANSFER_CATEGORY_ID = "partner_transfer";

export function isPartnerTransferCategory(categoryId: string): boolean {
  return categoryId === PARTNER_TRANSFER_CATEGORY_ID;
}

export function isPartnerTransferLike(tx: Pick<Transaction, "categoryId" | "note">): boolean {
  if (isPartnerTransferCategory(tx.categoryId)) return true;
  const note = tx.note.toLowerCase();
  return (
    (note.includes("перевод") || note.includes("transfer")) &&
    (note.includes("партн") ||
      note.includes("partner") ||
      note.includes("жене") ||
      note.includes("жена") ||
      note.includes("мужу") ||
      note.includes("муж"))
  );
}

export function isPartnerTransferPairCandidate(
  base: Pick<Transaction, "id" | "amount" | "type" | "date" | "categoryId" | "note" | "transferPairId">,
  candidate: Pick<Transaction, "id" | "amount" | "type" | "date" | "categoryId" | "note" | "transferPairId">,
): boolean {
  if (candidate.id === base.id) return true;
  if (base.transferPairId && candidate.transferPairId === base.transferPairId) return true;
  return (
    isPartnerTransferLike(base) &&
    isPartnerTransferLike(candidate) &&
    candidate.amount === base.amount &&
    candidate.date === base.date &&
    candidate.type !== base.type
  );
}

/** Колонка баланса для перевода партнёру (отдельно от обычных операций). */
export function resolvePartnerTransferOwnerForViewer(
  tx: Transaction,
  viewerUserId: string,
  householdMemberUserIds: readonly string[],
): BudgetOwner | null {
  if (!isPartnerTransferCategory(tx.categoryId)) return null;
  if (!tx.createdBy) {
    return tx.owner === "partner" ? "partner" : "me";
  }
  if (tx.createdBy === viewerUserId) {
    if (tx.type === "expense") return "me";
    if (tx.type === "income" && tx.owner === "partner") return "partner";
    return "me";
  }
  if (
    householdMemberUserIds.length === 0 ||
    householdMemberUserIds.includes(tx.createdBy)
  ) {
    return "partner";
  }
  if (tx.owner === "partner" || tx.owner === "me") return tx.owner;
  return "me";
}

export function buildPartnerTransferPair(
  amount: number,
  direction: "to_partner" | "from_partner",
  partnerLabel: string,
  date = new Date().toISOString().slice(0, 10),
): { expense: ParsedTransaction; income: ParsedTransaction } {
  const amt = roundMoneyUp(amount);
  const pairId = `ptr-${Date.now().toString(36)}`;
  const noteTo =
    direction === "to_partner"
      ? `Перевод: ${partnerLabel}`
      : `Перевод от ${partnerLabel}`;
  const noteFrom =
    direction === "to_partner"
      ? `От партнёра`
      : `Партнёру`;

  return {
    expense: {
      amount: amt,
      type: "expense",
      categoryId: PARTNER_TRANSFER_CATEGORY_ID,
      currency: normalizeAppCurrency(),
      note: noteTo,
      date,
      owner: direction === "to_partner" ? "me" : "partner",
      transferPairId: pairId,
    },
    income: {
      amount: amt,
      type: "income",
      categoryId: PARTNER_TRANSFER_CATEGORY_ID,
      currency: normalizeAppCurrency(),
      note: noteFrom,
      date,
      owner: direction === "to_partner" ? "partner" : "me",
      transferPairId: pairId,
    },
  };
}

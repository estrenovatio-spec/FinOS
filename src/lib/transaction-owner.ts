import { resolvePartnerTransferOwnerForViewer } from "@/lib/partner-transfer";
import type { BudgetOwner, Transaction } from "@/types";

function householdPartnerUserId(
  viewerUserId: string,
  householdMemberUserIds: readonly string[],
): string | null {
  const partnerId = householdMemberUserIds.find((id) => id !== viewerUserId);
  return partnerId ?? null;
}

function isPartnerAuthor(
  authorId: string,
  viewerUserId: string,
  householdMemberUserIds: readonly string[],
): boolean {
  const partnerId = householdPartnerUserId(viewerUserId, householdMemberUserIds);
  if (partnerId) return authorId === partnerId;
  return (
    householdMemberUserIds.length > 0 &&
    authorId !== viewerUserId &&
    householdMemberUserIds.includes(authorId)
  );
}

/**
 * Кто потратил/получил с точки зрения текущего зрителя.
 * createdBy в облаке — id автора операции; owner в БД чаще «me» относительно createdBy.
 */
export function resolveTransactionOwnerForViewer(
  tx: Transaction,
  viewerUserId: string | null,
  householdMemberUserIds: readonly string[],
): BudgetOwner {
  if (viewerUserId) {
    const transferOwner = resolvePartnerTransferOwnerForViewer(
      tx,
      viewerUserId,
      householdMemberUserIds,
    );
    if (transferOwner) return transferOwner;
  }

  if (viewerUserId && tx.createdBy) {
    if (tx.createdBy === viewerUserId) return "me";
    if (isPartnerAuthor(tx.createdBy, viewerUserId, householdMemberUserIds)) {
      return "partner";
    }
  }

  if (!viewerUserId || !tx.createdBy) {
    return tx.owner === "partner" ? "partner" : "me";
  }

  const authorId = tx.createdBy;
  if (authorId === viewerUserId) {
    return tx.owner === "partner" ? "partner" : "me";
  }
  if (isPartnerAuthor(authorId, viewerUserId, householdMemberUserIds)) {
    return tx.owner === "me" ? "partner" : "me";
  }
  return tx.owner === "partner" ? "partner" : "me";
}

export function mapTransactionsForViewer(
  transactions: Transaction[],
  viewerUserId: string | null,
  householdMemberUserIds: readonly string[],
): Transaction[] {
  if (!viewerUserId) return transactions;
  return transactions.map((tx) => ({
    ...tx,
    owner: resolveTransactionOwnerForViewer(tx, viewerUserId, householdMemberUserIds),
  }));
}

/** Сохранение из формы «я / партнёр» → createdBy того, кто реально совершил операцию */
export function spenderFromViewerOwner(
  viewerUserId: string | null,
  householdMemberUserIds: readonly string[],
  viewerOwner: BudgetOwner,
): { owner: BudgetOwner; createdBy: string | null } {
  if (!viewerUserId) {
    return { owner: viewerOwner, createdBy: null };
  }
  const partnerId = householdMemberUserIds.find((id) => id !== viewerUserId);
  if (!partnerId) {
    return { owner: "me", createdBy: viewerUserId };
  }
  const spenderId = viewerOwner === "partner" ? partnerId : viewerUserId;
  return { owner: "me", createdBy: spenderId };
}

/** @deprecated используйте spenderFromViewerOwner */
export function viewerOwnerToAuthorOwner(
  tx: Transaction,
  viewerUserId: string | null,
  householdMemberUserIds: readonly string[],
  viewerOwner: BudgetOwner,
): BudgetOwner {
  const { owner, createdBy } = spenderFromViewerOwner(
    viewerUserId,
    householdMemberUserIds,
    viewerOwner,
  );
  if (!createdBy || createdBy === viewerUserId) return owner;
  return owner;
}

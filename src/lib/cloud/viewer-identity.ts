import type { Transaction } from "@/types";
import { useCloudStore } from "@/store/useCloudStore";

/** userId из JWT сессии облака (без проверки подписи — только для UI на этом устройстве). */
export function decodeUserIdFromHouseholdToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const body = token.split(".")[0];
  if (!body) return null;
  try {
    const pad = body.length % 4 === 0 ? "" : "=".repeat(4 - (body.length % 4));
    const json = atob(body.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const payload = JSON.parse(json) as { userId?: string };
    return typeof payload.userId === "string" && payload.userId ? payload.userId : null;
  } catch {
    return null;
  }
}

/**
 * Id текущего пользователя на этом телефоне.
 * Важно: сначала JWT (истина), потом bootstrap — иначе залипает чужой id в persist.
 */
export function ensureCloudViewerUserId(explicitUserId?: string | null): string | null {
  const cloud = useCloudStore.getState();
  if (explicitUserId) {
    cloud.setCloudUserId(explicitUserId);
    return explicitUserId;
  }
  const fromToken = decodeUserIdFromHouseholdToken(cloud.token);
  if (fromToken) {
    cloud.setCloudUserId(fromToken);
    return fromToken;
  }
  return cloud.cloudUserId || null;
}

export function viewerIdentityMismatch(): boolean {
  const cloud = useCloudStore.getState();
  const fromToken = decodeUserIdFromHouseholdToken(cloud.token);
  if (!fromToken || !cloud.cloudUserId) return false;
  return fromToken !== cloud.cloudUserId;
}

export function collectHouseholdMemberUserIds(
  stored: readonly string[],
  transactions: readonly Transaction[],
  viewerUserId: string | null,
): string[] {
  const ids = new Set(stored);
  if (viewerUserId) ids.add(viewerUserId);
  for (const tx of transactions) {
    if (tx.createdBy) ids.add(tx.createdBy);
  }
  return [...ids];
}

/** userId второго члена семьи (для переводов партнёру). */
export function findHouseholdPartnerUserId(
  viewerUserId: string | null,
  storedMemberIds: readonly string[],
  transactions: readonly Transaction[],
): string | undefined {
  if (!viewerUserId) return undefined;
  return collectHouseholdMemberUserIds(storedMemberIds, transactions, viewerUserId).find(
    (id) => id !== viewerUserId,
  );
}

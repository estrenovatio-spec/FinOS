import type { BalanceOffsetsByUser } from "@/lib/balance-offsets";

/** Баланс в этом приложении живёт только локально, без cloud-sync. */
export function applyBalanceOffsetsFromCloud(
  _offsets?: BalanceOffsetsByUser | null,
  _memberUserIds?: readonly string[],
): void {
  return;
}

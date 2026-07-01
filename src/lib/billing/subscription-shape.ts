import type { SubscriptionPublic } from "@/lib/payments/types";

/** Drop legacy persisted subscription blobs (pre trial-banner fields). */
export function isValidSubscriptionPublic(
  sub: unknown,
): sub is SubscriptionPublic {
  if (!sub || typeof sub !== "object") return false;
  const s = sub as SubscriptionPublic;
  return (
    typeof s.active === "boolean" &&
    typeof s.enforced === "boolean" &&
    typeof s.onFreeAccess === "boolean" &&
    typeof s.showTrialBanner === "boolean" &&
    (s.daysRemaining === null || typeof s.daysRemaining === "number")
  );
}

export function resolveDaysRemaining(sub: SubscriptionPublic | null): number | null {
  if (!sub) return null;
  if (sub.daysRemaining !== null && sub.daysRemaining !== undefined) {
    return sub.daysRemaining;
  }
  if (!sub.expiresAt) return null;
  const end = new Date(sub.expiresAt);
  if (Number.isNaN(end.getTime())) return null;
  return Math.max(0, Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

export function subscriptionShowsTrialBanner(sub: SubscriptionPublic | null): boolean {
  if (!sub) return false;
  if (sub.showTrialBanner) return true;
  const days = resolveDaysRemaining(sub);
  return Boolean(sub.enforced && sub.active && sub.onFreeAccess && days !== null);
}

const SEEN_PREFIX = "voicebudget-access-banner-seen";

type AccessBannerMilestone = "welcome" | "last_day";

function milestoneKey(expiresAt: string, milestone: AccessBannerMilestone): string {
  return `${SEEN_PREFIX}:${expiresAt}:${milestone}`;
}

function readSeen(expiresAt: string, milestone: AccessBannerMilestone): boolean {
  try {
    return localStorage.getItem(milestoneKey(expiresAt, milestone)) === "1";
  } catch {
    return false;
  }
}

function writeSeen(expiresAt: string, milestone: AccessBannerMilestone): void {
  try {
    localStorage.setItem(milestoneKey(expiresAt, milestone), "1");
  } catch {
    /* ignore */
  }
}

/** Last day of access (0–1 days left). */
export function isAccessLastDay(daysRemaining: number): boolean {
  return daysRemaining <= 1;
}

/**
 * Show access strip only:
 * - once at start of period (welcome), and
 * - again on the last day (≤1 day left).
 */
export function shouldShowAccessBannerMilestone(
  expiresAt: string | null,
  daysRemaining: number | null,
): boolean {
  if (!expiresAt || daysRemaining === null) return false;

  if (isAccessLastDay(daysRemaining)) {
    return !readSeen(expiresAt, "last_day");
  }

  return !readSeen(expiresAt, "welcome");
}

/** Call when user closes the strip (X). */
export function dismissAccessBanner(
  expiresAt: string | null,
  daysRemaining: number | null,
): void {
  if (!expiresAt || daysRemaining === null) return;
  writeSeen(expiresAt, isAccessLastDay(daysRemaining) ? "last_day" : "welcome");
}

/** After welcome strip was shown — hide until last day. */
export function markAccessWelcomeSeen(expiresAt: string | null): void {
  if (!expiresAt) return;
  writeSeen(expiresAt, "welcome");
}

/** @deprecated use shouldShowAccessBannerMilestone */
export function isAccessBannerDismissed(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return readSeen(expiresAt, "welcome") && readSeen(expiresAt, "last_day");
}

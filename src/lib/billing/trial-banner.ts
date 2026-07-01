export const OPEN_SETTINGS_EVENT = "voicebudget:open-settings";

export function requestOpenSettings(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT));
}

const SEEN_PREFIX = "voicebudget-trial-banner-seen";

type TrialBannerMilestone = "welcome" | "last_day";

function milestoneKey(expiresAt: string, milestone: TrialBannerMilestone): string {
  return `${SEEN_PREFIX}:${expiresAt}:${milestone}`;
}

function readSeen(expiresAt: string, milestone: TrialBannerMilestone): boolean {
  try {
    return localStorage.getItem(milestoneKey(expiresAt, milestone)) === "1";
  } catch {
    return false;
  }
}

function writeSeen(expiresAt: string, milestone: TrialBannerMilestone): void {
  try {
    localStorage.setItem(milestoneKey(expiresAt, milestone), "1");
  } catch {
    /* ignore */
  }
}

/** Last day of trial (0–1 days left). */
export function isTrialLastDay(daysRemaining: number | null): boolean {
  return daysRemaining !== null && daysRemaining <= 1;
}

/**
 * Show trial strip only:
 * - once at start of period (welcome), and
 * - again on the last day (≤1 day left).
 */
export function shouldShowTrialBannerMilestone(
  expiresAt: string | null,
  daysRemaining: number | null,
): boolean {
  if (!expiresAt || daysRemaining === null) return false;

  if (isTrialLastDay(daysRemaining)) {
    return !readSeen(expiresAt, "last_day");
  }

  return !readSeen(expiresAt, "welcome");
}

/** Call when user closes the strip (X or tap). */
export function dismissTrialBanner(
  expiresAt: string | null,
  daysRemaining: number | null,
): void {
  if (!expiresAt) return;
  writeSeen(expiresAt, isTrialLastDay(daysRemaining) ? "last_day" : "welcome");
}

/** After welcome strip was shown once this session — hide on next app open until last day. */
export function markTrialWelcomeSeen(expiresAt: string | null): void {
  if (!expiresAt) return;
  writeSeen(expiresAt, "welcome");
}

export function markTrialLastDaySeen(expiresAt: string | null): void {
  if (!expiresAt) return;
  writeSeen(expiresAt, "last_day");
}

/** @deprecated use shouldShowTrialBannerMilestone */
export function isTrialBannerDismissed(
  expiresAt: string | null,
  daysRemaining?: number | null,
): boolean {
  if (!expiresAt) return false;
  return !shouldShowTrialBannerMilestone(expiresAt, daysRemaining ?? 0);
}

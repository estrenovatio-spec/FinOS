const STORAGE_KEY = "voicebudget-subscription-reminder-date";

export function subscriptionReminderShownToday(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const today = new Date().toISOString().slice(0, 10);
    return localStorage.getItem(STORAGE_KEY) === today;
  } catch {
    return false;
  }
}

export function markSubscriptionReminderShownToday(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString().slice(0, 10));
  } catch {
    /* ignore */
  }
}

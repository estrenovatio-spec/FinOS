const PAUSE_KEY = "voicebudget-cloud-paused";

export function isCloudPaused(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      sessionStorage.getItem(PAUSE_KEY) === "1" ||
      localStorage.getItem(PAUSE_KEY) === "1"
    );
  } catch {
    return false;
  }
}

export function setCloudPaused(paused: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (paused) {
      sessionStorage.setItem(PAUSE_KEY, "1");
      localStorage.setItem(PAUSE_KEY, "1");
    } else {
      sessionStorage.removeItem(PAUSE_KEY);
      localStorage.removeItem(PAUSE_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function clearCloudPause(): void {
  setCloudPaused(false);
}

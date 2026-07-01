import { APP_BUILD_KEY } from "@/lib/storage-reset";
import { fetchWithRetry } from "@/lib/fetch-retry";

export function getStoredBuildTag(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(APP_BUILD_KEY);
  } catch {
    return null;
  }
}

export function storeBuildTag(tag: string): void {
  try {
    localStorage.setItem(APP_BUILD_KEY, tag);
  } catch {
    /* ignore */
  }
}

export async function fetchServerBuildTag(): Promise<string | null> {
  try {
    const res = await fetchWithRetry(`/api/status?vb=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { buildTag?: string };
    return data.buildTag ?? null;
  } catch {
    return null;
  }
}

export async function checkForAppUpdate(): Promise<{
  serverTag: string | null;
  storedTag: string | null;
  updateAvailable: boolean;
}> {
  const serverTag = await fetchServerBuildTag();
  const storedTag = getStoredBuildTag();
  if (!serverTag) {
    return { serverTag, storedTag, updateAvailable: false };
  }
  if (!storedTag) {
    storeBuildTag(serverTag);
    return { serverTag, storedTag: serverTag, updateAvailable: false };
  }
  return {
    serverTag,
    storedTag,
    updateAvailable: serverTag !== storedTag,
  };
}

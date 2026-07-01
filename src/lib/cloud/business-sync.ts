import { mergeBusinessPayload } from "@/lib/business/merge";
import type { BusinessCloudPayload } from "@/lib/business/types";
import { apiPullBusiness, apiPushBusiness } from "@/lib/cloud/client";
import { isCloudPaused } from "@/lib/cloud/cloud-pause";
import { useBusinessStore } from "@/store/useBusinessStore";
import { useCloudStore } from "@/store/useCloudStore";

let pushTimer: ReturnType<typeof setTimeout> | null = null;
/** Не пушить в облако до первого pull — иначе пустое состояние затирает проекты на сервере. */
let businessCloudReady = false;

export function isBusinessCloudReady(): boolean {
  return businessCloudReady;
}

export async function pullBusinessFromCloud(): Promise<boolean> {
  if (isCloudPaused()) return false;
  const token = useCloudStore.getState().token;
  if (!token) return false;
  businessCloudReady = false;
  try {
    const res = await apiPullBusiness(token);
    if (!res.ok || !res.business) return false;
    const local = useBusinessStore.getState().exportPayload();
    const remote = res.business;
    const merged = mergeBusinessPayload(local, remote);
    useBusinessStore.getState().importPayload(merged);
    useBusinessStore.getState().markCloudSynced();
    return true;
  } catch {
    return false;
  } finally {
    businessCloudReady = true;
  }
}

export function scheduleBusinessCloudPush(delayMs = 1200): void {
  if (isCloudPaused()) return;
  const token = useCloudStore.getState().token;
  if (!token) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    if (!businessCloudReady || !useBusinessStore.persist.hasHydrated()) return;
    void pushBusinessToCloud();
  }, delayMs);
}

export async function pushBusinessToCloud(): Promise<boolean> {
  if (isCloudPaused()) return false;
  const token = useCloudStore.getState().token;
  if (!token || !businessCloudReady || !useBusinessStore.persist.hasHydrated()) return false;
  try {
    const business: BusinessCloudPayload = useBusinessStore.getState().exportPayload();
    const res = await apiPushBusiness(token, business);
    if (!res.ok) return false;
    useBusinessStore.getState().markCloudSynced();
    return true;
  } catch {
    return false;
  }
}

export async function replaceBusinessCloudWithThisDevice(): Promise<boolean> {
  if (isCloudPaused()) return false;
  const token = useCloudStore.getState().token;
  if (!token || !useBusinessStore.persist.hasHydrated()) return false;
  try {
    const business: BusinessCloudPayload = useBusinessStore.getState().exportPayload();
    const res = await apiPushBusiness(token, business);
    if (!res.ok) return false;
    businessCloudReady = true;
    useBusinessStore.getState().markCloudSynced();
    return true;
  } catch {
    return false;
  }
}

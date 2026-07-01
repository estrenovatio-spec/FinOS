import { applyHouseholdSync } from "@/lib/cloud/apply-sync";
import { getCloudAuthBody, hasCloudAuth } from "@/lib/cloud/auth-payload";
import { getTelegramInitData, hasTelegramWebApp } from "@/lib/cloud/telegram";
import { waitForTelegramInitData } from "@/lib/cloud/wait-telegram-init";
import { isCloudPaused } from "@/lib/cloud/cloud-pause";
import { isCloudRestoreInProgress } from "@/lib/cloud/restore-lock";
import { isAuthSyncError, isSubscriptionSyncError } from "@/lib/cloud/sync-errors";
import { fetchAndApplyDevSubscription } from "@/lib/billing/dev-subscription";
import { isValidSubscriptionPublic } from "@/lib/billing/subscription-shape";
import {
  apiBootstrap,
  apiCreateHousehold,
  apiSubscriptionStatus,
  apiSync,
} from "@/lib/cloud/client";
import { useCloudStore } from "@/store/useCloudStore";

function shouldReplaceOnPull(): boolean {
  return false;
}

function clearStaleHouseholdSession(): void {
  const { token, household } = useCloudStore.getState();
  if (token || household) {
    useCloudStore.getState().clearHouseholdSession();
  }
}

/** После смены секрета на сервере или 401 — перевыпустить токен из Telegram, не сбрасывать облако */
export async function refreshCloudSessionFromTelegram(): Promise<boolean> {
  if (isCloudPaused()) return false;
  const auth = getCloudAuthBody();
  if (!auth.initData && !auth.telegramLogin) return false;
  await runHouseholdBootstrap();
  return Boolean(useCloudStore.getState().token && useCloudStore.getState().household);
}

function hasPersistedSubscription(): boolean {
  return isValidSubscriptionPublic(useCloudStore.getState().subscription);
}

export async function runHouseholdBootstrap(): Promise<void> {
  if (isCloudPaused() || isCloudRestoreInProgress()) return;

  await fetchAndApplyDevSubscription(2);

  let auth = getCloudAuthBody();
  if (hasTelegramWebApp() && !auth.initData) {
    await waitForTelegramInitData(8000);
    auth = getCloudAuthBody();
  }

  if (auth.initData || auth.telegramLogin) {
    let res: Awaited<ReturnType<typeof apiBootstrap>>;
    try {
      res = await apiBootstrap(auth);
      if (!res.ok && res.error === "invalid_init_data" && hasTelegramWebApp()) {
        await waitForTelegramInitData(3000);
        const retryAuth = getCloudAuthBody();
        if (retryAuth.initData) {
          res = await apiBootstrap(retryAuth);
        }
      }
    } catch (e) {
      console.error("[household/bootstrap] client", e);
      const dev = await fetchAndApplyDevSubscription(2);
      if (!dev.ok && !hasPersistedSubscription()) {
        useCloudStore.getState().setSubscription(null);
      }
      return;
    }
    if (!res.ok) {
      console.warn("[household/bootstrap]", res.error, "initData len", getTelegramInitData().length);
      const dev = await fetchAndApplyDevSubscription(2);
      if (!dev.ok && !hasPersistedSubscription()) {
        useCloudStore.getState().setSubscription(null);
      }
      return;
    }
    if (res.configured === false) {
      useCloudStore.getState().setServerConfigured(false);
      return;
    }
    useCloudStore.getState().setServerConfigured(true);

    if (res.subscription) {
      useCloudStore.getState().setSubscription(res.subscription);
    }
    useCloudStore.getState().setAccessSummary(res.accessSummary ?? null);
    useCloudStore.getState().setReferralsEnabled(Boolean(res.referralsEnabled));
    useCloudStore.getState().setReferralProfile(res.referralProfile ?? null);

    if (res.user?.id) {
      useCloudStore.getState().setCloudUserId(res.user.id);
    }
    if (res.token && res.sync && res.household) {
      applyHouseholdSync(res.sync, res.token);
      useCloudStore.getState().touchSync();
    } else if (res.token && res.household) {
      useCloudStore.getState().setSession(res.token, res.household);
    } else if (
      hasTelegramWebApp() &&
      (!res.subscription?.enforced || res.subscription.active)
    ) {
      try {
        const created = await apiCreateHousehold({ ...auth, mode: "solo" });
        if (created.user?.id) {
          useCloudStore.getState().setCloudUserId(created.user.id);
        }
        applyHouseholdSync(created.sync, created.token);
        useCloudStore.getState().touchSync();
      } catch (e) {
        console.warn("[household/bootstrap auto-create]", e);
        clearStaleHouseholdSession();
      }
    } else if (!res.subscription?.enforced || res.subscription.active) {
      clearStaleHouseholdSession();
    }
    return;
  }

  const token = useCloudStore.getState().token;
  if (!token) return;

  try {
    const res = await apiSync(token);
    applyHouseholdSync(res.sync, token, { replace: shouldReplaceOnPull() });
    useCloudStore.getState().setServerConfigured(true);
    useCloudStore.getState().touchSync();
  } catch (e) {
    if (isSubscriptionSyncError(e)) {
      try {
        const subRes = await apiSubscriptionStatus(token);
        useCloudStore.getState().setSubscription(subRes.subscription);
      } catch {
        /* ignore */
      }
      return;
    }
    if (isAuthSyncError(e)) {
      const refreshed = await refreshCloudSessionFromTelegram();
      if (!refreshed) {
        /* Keep the previous session alive; a temporary auth miss should not
           kick the device out of household sync. */
      }
    }
  }
}

export function canRunCloudBootstrap(): boolean {
  if (hasCloudAuth()) return true;
  // In Telegram Mini App always bootstrap via initData — never stale token alone.
  if (hasTelegramWebApp()) return false;
  return Boolean(useCloudStore.getState().token);
}

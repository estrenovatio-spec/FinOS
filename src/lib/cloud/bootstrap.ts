import { applyHouseholdSync } from "@/lib/cloud/apply-sync";
import { getCloudAuthBody, hasCloudAuth } from "@/lib/cloud/auth-payload";
import { getTelegramInitData, hasTelegramWebApp } from "@/lib/cloud/telegram";
import { waitForTelegramInitData } from "@/lib/cloud/wait-telegram-init";
import { isCloudPaused } from "@/lib/cloud/cloud-pause";
import { isCloudRestoreInProgress } from "@/lib/cloud/restore-lock";
import { isAuthSyncError, isSubscriptionSyncError } from "@/lib/cloud/sync-errors";
import { fetchAndApplyDevSubscription } from "@/lib/billing/dev-subscription";
import { isValidSubscriptionPublic } from "@/lib/billing/subscription-shape";
import { resolveInitialSyncDecision } from "@/lib/cloud/initial-sync";
import {
  apiBootstrap,
  apiCreateHousehold,
  apiSubscriptionStatus,
  apiSync,
} from "@/lib/cloud/client";
import { useCloudStore } from "@/store/useCloudStore";
import { useStore } from "@/store/useStore";

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

function beginBootstrap(status: "checking" | "hydrating" = "checking"): void {
  useCloudStore.getState().setSyncBootstrapStatus(status);
}

function finishBootstrap(): void {
  useCloudStore.getState().setSyncBootstrapStatus("ready");
}

function failBootstrap(): void {
  useCloudStore.getState().setSyncBootstrapStatus("error");
}

export function applyBootstrapSyncPayload(
  sync: Parameters<typeof applyHouseholdSync>[0],
  token: string,
): void {
  const local = useStore.getState();
  const decision = resolveInitialSyncDecision({
    localState: {
      transactions: local.transactions,
      categories: local.categories,
      savingsGoals: local.savingsGoals,
      categoryBudgets: local.categoryBudgets,
      recurringTransactions: local.recurringTransactions,
      debts: local.debts,
      moneySetup: local.moneySetup,
      cashOffsetMe: local.cashOffsetMe,
      cashOffsetPartner: local.cashOffsetPartner,
    },
    cloudSync: sync,
  });
  useCloudStore.getState().setLastInitialSyncDecision(decision);
  beginBootstrap("hydrating");
  if (decision === "download_cloud" || decision === "no_action") {
    applyHouseholdSync(sync, token, {
      replace: true,
      pushLocalOnly: false,
    });
  } else {
    applyHouseholdSync(sync, token, {
      replace: false,
      pushLocalOnly: true,
    });
  }
  finishBootstrap();
}

export async function runHouseholdBootstrap(): Promise<void> {
  if (isCloudPaused() || isCloudRestoreInProgress()) return;
  beginBootstrap();

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
      failBootstrap();
      const dev = await fetchAndApplyDevSubscription(2);
      if (!dev.ok && !hasPersistedSubscription()) {
        useCloudStore.getState().setSubscription(null);
      }
      return;
    }
    if (!res.ok) {
      console.warn("[household/bootstrap]", res.error, "initData len", getTelegramInitData().length);
      failBootstrap();
      const dev = await fetchAndApplyDevSubscription(2);
      if (!dev.ok && !hasPersistedSubscription()) {
        useCloudStore.getState().setSubscription(null);
      }
      return;
    }
    if (res.configured === false) {
      useCloudStore.getState().setServerConfigured(false);
      failBootstrap();
      return;
    }
    useCloudStore.getState().setServerConfigured(true);

    if (res.subscription) {
      useCloudStore.getState().setSubscription(res.subscription);
    }
    useCloudStore.getState().setAccessSummary(res.accessSummary ?? null);
    useCloudStore.getState().setReferralsEnabled(Boolean(res.referralsEnabled));
    useCloudStore.getState().setReferralProfile(res.referralProfile ?? null);
    useCloudStore.getState().setAuthIdentity({
      email: res.user?.email ?? null,
      authMethod: res.user?.authMethod ?? (auth.initData || auth.telegramLogin ? "telegram" : null),
    });

    if (res.user?.id) {
      useCloudStore.getState().setCloudUserId(res.user.id);
    }
    if (res.token && res.sync && res.household) {
      applyBootstrapSyncPayload(res.sync, res.token);
      useCloudStore.getState().touchSync();
    } else if (res.token && res.household) {
      useCloudStore.getState().setSession(res.token, res.household);
      finishBootstrap();
    } else if (
      hasTelegramWebApp() &&
      (!res.subscription?.enforced || res.subscription.active)
    ) {
      try {
        const created = await apiCreateHousehold({ ...auth, mode: "solo" });
        if (created.user?.id) {
          useCloudStore.getState().setCloudUserId(created.user.id);
        }
        applyBootstrapSyncPayload(created.sync, created.token);
        useCloudStore.getState().touchSync();
      } catch (e) {
        console.warn("[household/bootstrap auto-create]", e);
        failBootstrap();
        clearStaleHouseholdSession();
      }
    } else if (!res.subscription?.enforced || res.subscription.active) {
      clearStaleHouseholdSession();
      finishBootstrap();
    }
    return;
  }

  const token = useCloudStore.getState().token;
  if (!token) {
    finishBootstrap();
    return;
  }

  try {
    const res = await apiSync(token);
    applyBootstrapSyncPayload(res.sync, token);
    useCloudStore.getState().setServerConfigured(true);
    useCloudStore.getState().touchSync();
  } catch (e) {
    failBootstrap();
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
  return true;
}

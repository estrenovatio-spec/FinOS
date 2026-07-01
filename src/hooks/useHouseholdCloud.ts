"use client";

import { useCallback, useState } from "react";
import { applyHouseholdSync } from "@/lib/cloud/apply-sync";
import { getCloudAuthBody, hasCloudAuth } from "@/lib/cloud/auth-payload";
import { runHouseholdBootstrap } from "@/lib/cloud/bootstrap";
import { setCloudPaused } from "@/lib/cloud/cloud-pause";
import {
  apiCreateHousehold,
  apiImportLocal,
  apiJoinHousehold,
  apiSync,
} from "@/lib/cloud/client";
import { clearWebTelegramLogin } from "@/lib/cloud/web-login-storage";
import { hasTelegramWebApp } from "@/lib/cloud/telegram";
import { saveWebTelegramLogin } from "@/lib/cloud/web-login-storage";
import type { TelegramLoginPayload } from "@/lib/telegram/login-widget";
import { looksLikeReferralInviteInput } from "@/lib/referrals/looks-like-referral-input";
import { useCloudStore } from "@/store/useCloudStore";
import { useStore } from "@/store/useStore";

function shouldReplaceOnPull(): boolean {
  return false;
}

export function useHouseholdCloud() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = useCloudStore((s) => s.token);
  const household = useCloudStore((s) => s.household);
  const subscription = useCloudStore((s) => s.subscription);
  const serverConfigured = useCloudStore((s) => s.serverConfigured);

  const subscriptionRequired = Boolean(subscription?.enforced && !subscription.active);
  const isActive = Boolean(
    token && household && (!subscription?.enforced || subscription.active),
  );

  const createHousehold = useCallback(
    async (opts: {
      mode: "solo" | "shared";
      partnerLabel?: string | null;
      name?: string;
    }) => {
      if (!hasCloudAuth()) {
        setError("telegram_required");
        return false;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await apiCreateHousehold({
          ...getCloudAuthBody(),
          mode: opts.mode,
          partnerLabel: opts.partnerLabel ?? null,
          name: opts.name,
        });
        if (res.user?.id) useCloudStore.getState().setCloudUserId(res.user.id);
        applyHouseholdSync(res.sync, res.token);
        const label = opts.partnerLabel?.trim();
        const { partnerName, partnerNameCustomized } = useStore.getState();
        if (label && !partnerNameCustomized && !partnerName?.trim()) {
          useStore.getState().setPartnerName(label);
        }
        useCloudStore.getState().touchSync();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "create_failed");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const joinHousehold = useCallback(async (inviteCode: string) => {
    if (!hasCloudAuth()) {
      setError("telegram_required");
      return false;
    }
    if (looksLikeReferralInviteInput(inviteCode)) {
      setError("referral_link_not_household");
      return false;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiJoinHousehold(getCloudAuthBody(), inviteCode);
      if (res.user?.id) useCloudStore.getState().setCloudUserId(res.user.id);
      applyHouseholdSync(res.sync, res.token);
      useCloudStore.getState().touchSync();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "join_failed");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const pullSync = useCallback(async () => {
    const t = useCloudStore.getState().token;
    if (!t) return false;
    setLoading(true);
    setError(null);
    try {
      const res = await apiSync(t);
      applyHouseholdSync(res.sync, t, { replace: shouldReplaceOnPull() });
      useCloudStore.getState().touchSync();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "sync_failed");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  /** Local device wins: upsert all operations on this device into the cloud */
  const pushToCloud = useCallback(async () => {
    const sessionToken = useCloudStore.getState().token;
    if (!sessionToken) return false;
    const { transactions, categories } = useStore.getState();

    setLoading(true);
    setError(null);
    try {
      const res = await apiImportLocal(sessionToken, { transactions, categories });
      applyHouseholdSync(res.sync, sessionToken, { replace: shouldReplaceOnPull() });
      useCloudStore.getState().touchSync();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "import_failed");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  /** Current phone wins completely: cloud operations not present here are deleted. */
  const replaceCloudWithThisDevice = useCallback(async () => {
    if (!hasCloudAuth() && !useCloudStore.getState().token) {
      setError("telegram_required");
      return false;
    }

    const {
      transactions,
      categories,
      savingsGoals,
      categoryBudgets,
      recurringTransactions,
      debts,
    } = useStore.getState();
    setLoading(true);
    setError(null);
    try {
      let sessionToken = useCloudStore.getState().token;
      if (!sessionToken) {
        setCloudPaused(false);
        const created = await apiCreateHousehold({
          ...getCloudAuthBody(),
          mode: "solo",
        });
        sessionToken = created.token;
        useCloudStore.getState().setSession(created.token, created.household);
        if (created.user?.id) useCloudStore.getState().setCloudUserId(created.user.id);
      }

      const res = await apiImportLocal(sessionToken, {
        transactions,
        categories,
        savingsGoals,
        categoryBudgets,
        recurringTransactions,
        debts,
        replaceTransactions: true,
        replacePlanning: true,
      });
      setCloudPaused(false);
      applyHouseholdSync(res.sync, sessionToken);
      useCloudStore.getState().setDeletedTransactionIds([]);
      useCloudStore.getState().touchSync();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "replace_failed");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  /** Only pauses sync on this device — never removes membership on server. */
  const disconnectCloud = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCloudPaused(true);
      clearWebTelegramLogin();
      useCloudStore.getState().clearSession();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "disconnect_failed");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const resumeCloud = useCallback(() => {
    setCloudPaused(false);
    return runHouseholdBootstrap();
  }, []);

  /** Phone already has cloud — browser only needs the same Telegram session */
  const attachExistingCloud = useCallback(async () => {
    if (!hasCloudAuth()) {
      setError("telegram_required");
      return false;
    }
    setLoading(true);
    setError(null);
    try {
      setCloudPaused(false);
      await runHouseholdBootstrap();
      const active = Boolean(
        useCloudStore.getState().token && useCloudStore.getState().household,
      );
      if (!active) setError("household_not_found");
      return active;
    } catch (e) {
      setError(e instanceof Error ? e.message : "sync_failed");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const loginWithTelegramWeb = useCallback(async (payload: TelegramLoginPayload) => {
    setLoading(true);
    setError(null);
    try {
      setCloudPaused(false);
      saveWebTelegramLogin(payload);
      await runHouseholdBootstrap();
      const active = Boolean(
        useCloudStore.getState().token && useCloudStore.getState().household,
      );
      if (!active) setError("household_not_found");
      return active;
    } catch (e) {
      setError(e instanceof Error ? e.message : "invalid_init_data");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    token,
    household,
    serverConfigured,
    createHousehold,
    joinHousehold,
    pullSync,
    pushToCloud,
    replaceCloudWithThisDevice,
    importLocal: pushToCloud,
    loginWithTelegramWeb,
    disconnectCloud,
    resumeCloud,
    attachExistingCloud,
    isTelegram: hasTelegramWebApp(),
    canUseCloud: hasTelegramWebApp() || hasCloudAuth() || Boolean(token),
    isActive,
    subscription,
    subscriptionRequired,
  };
}

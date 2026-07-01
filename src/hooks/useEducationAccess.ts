"use client";

import { useCallback, useEffect, useState } from "react";
import { getCloudAuthBody } from "@/lib/cloud/auth-payload";
import { apiCreateEducationCheckout, apiEducationAccess } from "@/lib/cloud/client";
import { runHouseholdBootstrap } from "@/lib/cloud/bootstrap";
import type { EducationAccessPublic } from "@/lib/payments/education";
import { useCloudStore } from "@/store/useCloudStore";

function openPaymentUrl(url: string) {
  const tg = window.Telegram?.WebApp;
  if (tg?.openLink) {
    tg.openLink(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function useEducationAccess() {
  const token = useCloudStore((s) => s.token);
  const [access, setAccess] = useState<EducationAccessPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let t = token;
      if (!t) {
        await runHouseholdBootstrap();
        t = useCloudStore.getState().token;
      }
      if (t) {
        const res = await apiEducationAccess(t);
        setAccess(res.access);
        return;
      }
      const res = await fetch("/api/payments/education", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`http_${res.status}`);
      const data = (await res.json()) as { access: EducationAccessPublic };
      setAccess(data.access);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
      setAccess(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pay = useCallback(async () => {
    setPaying(true);
    setError(null);
    try {
      let t = token;
      if (!t) {
        await runHouseholdBootstrap();
        t = useCloudStore.getState().token;
      }
      let confirmationUrl: string;
      if (t) {
        const res = await apiCreateEducationCheckout(t);
        if (!res.confirmationUrl) throw new Error("no_confirmation_url");
        confirmationUrl = res.confirmationUrl;
      } else {
        const res = await fetch("/api/payments/education", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(getCloudAuthBody()),
        });
        const data = (await res.json()) as { confirmationUrl?: string; error?: string };
        if (!res.ok) throw new Error(data.error ?? `http_${res.status}`);
        if (!data.confirmationUrl) throw new Error("no_confirmation_url");
        confirmationUrl = data.confirmationUrl;
      }
      openPaymentUrl(confirmationUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "checkout_failed");
    } finally {
      setPaying(false);
    }
  }, [token]);

  return {
    access,
    loading,
    paying,
    error,
    refresh,
    pay,
    paid: Boolean(access?.paid),
  };
}

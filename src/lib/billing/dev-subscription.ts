import type { AccessSummaryPublic, SubscriptionPublic } from "@/lib/payments/types";
import { isValidSubscriptionPublic } from "@/lib/billing/subscription-shape";
import { useCloudStore } from "@/store/useCloudStore";

export type DevSubscriptionFetchResult =
  | { ok: true; subscription: SubscriptionPublic }
  | { ok: false; reason: "not_configured" | "forbidden" | "not_found" | "server_error" | "network" };

/** @deprecated Client id optional — server uses BILLING_DEV_TELEGRAM_ID from env. */
export function billingDevTelegramId(): string | undefined {
  return process.env.NEXT_PUBLIC_BILLING_DEV_TELEGRAM_ID?.trim() || undefined;
}

export function isBillingDevFallbackEnabled(): boolean {
  return Boolean(billingDevTelegramId());
}

async function fetchDevSubscriptionOnce(): Promise<DevSubscriptionFetchResult> {
  try {
    const res = await fetch("/api/billing/dev-subscription", {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      subscription?: SubscriptionPublic;
      accessSummary?: AccessSummaryPublic | null;
      error?: string;
    };

    if (res.status === 404 && data.error === "not_available") {
      return { ok: false, reason: "not_configured" };
    }
    if (res.status === 403) return { ok: false, reason: "forbidden" };
    if (res.status === 404 && data.error === "user_not_found") {
      return { ok: false, reason: "not_found" };
    }
    if (!res.ok) return { ok: false, reason: "server_error" };

    if (!data.subscription || !isValidSubscriptionPublic(data.subscription)) {
      return { ok: false, reason: "server_error" };
    }

    useCloudStore.getState().setSubscription(data.subscription);
    useCloudStore.getState().setAccessSummary(data.accessSummary ?? null);
    useCloudStore.getState().setServerConfigured(true);
    return { ok: true, subscription: data.subscription };
  } catch {
    return { ok: false, reason: "network" };
  }
}

/** Load subscription without Telegram initData (preview billing tests). */
export async function fetchAndApplyDevSubscription(
  retries = 3,
): Promise<DevSubscriptionFetchResult> {
  for (let i = 0; i < retries; i += 1) {
    const result = await fetchDevSubscriptionOnce();
    if (result.ok) return result;
    if (result.reason === "forbidden" || result.reason === "not_configured") {
      return result;
    }
    if (i < retries - 1) {
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  return fetchDevSubscriptionOnce();
}

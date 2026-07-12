import type { HouseholdPublic, SyncPayload } from "@/lib/household/types";
import type { MoneySetup } from "@/lib/money-setup";
import type { AccessSummaryPublic, SubscriptionPublic } from "@/lib/payments/types";
import type { ReferralProfilePublic } from "@/lib/referrals/service";
import type { CategoryDefinition, Transaction } from "@/types";
import type { CategoryBudget, DebtItem, RecurringTransaction, SavingsGoal } from "@/types/planning";
import type { Vehicle, VehicleGaragePrefs } from "@/types/vehicle";
import { fetchWithRetry } from "@/lib/fetch-retry";

export type CloudApiError =
  | "database_not_configured"
  | "invalid_init_data"
  | "unauthorized"
  | "bad_request"
  | string;

export interface BootstrapResponse {
  ok: boolean;
  configured?: boolean;
  error?: string;
  user?: { id: string; firstName: string | null };
  household: HouseholdPublic | null;
  token: string | null;
  sync: SyncPayload | null;
  subscription?: SubscriptionPublic;
  accessSummary?: AccessSummaryPublic | null;
  referralsEnabled?: boolean;
  referralProfile?: ReferralProfilePublic | null;
}

export interface HouseholdActionResponse {
  ok: boolean;
  user?: { id: string };
  household: HouseholdPublic;
  token: string;
  sync: SyncPayload;
}

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetchWithRetry(url, {
    ...init,
    cache: "no-store",
    headers: init?.headers,
  });
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `http_${res.status}`);
  }
  return data;
}

export type CloudAuthBody = {
  initData?: string;
  telegramLogin?: Record<string, string | number>;
};

export async function apiBootstrap(auth: CloudAuthBody): Promise<BootstrapResponse> {
  const res = await apiFetch("/api/household/bootstrap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(auth),
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 503) {
    return { ok: false, configured: false, household: null, token: null, sync: null };
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return {
      ok: false,
      error: data.error ?? `http_${res.status}`,
      household: null,
      token: null,
      sync: null,
    };
  }
  return parseJson(res);
}

export async function apiConsumeWebLoginToken(token: string): Promise<BootstrapResponse> {
  const res = await apiFetch("/api/household/web-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return {
      ok: false,
      error: data.error ?? `http_${res.status}`,
      household: null,
      token: null,
      sync: null,
    };
  }
  return parseJson(res);
}

export async function apiCreateHousehold(
  body: CloudAuthBody & {
    name?: string;
    mode?: "solo" | "shared";
    partnerLabel?: string | null;
  },
): Promise<HouseholdActionResponse> {
  const res = await apiFetch("/api/household/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function apiJoinHousehold(auth: CloudAuthBody, inviteCode: string) {
  const res = await apiFetch("/api/household/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...auth, inviteCode }),
  });
  return parseJson<HouseholdActionResponse>(res);
}

export async function apiLeaveHousehold(token: string) {
  const res = await apiFetch("/api/household/leave", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson<{ ok: boolean }>(res);
}

export type AiReportRecord = {
  id: string;
  kind: "weekly" | "monthly";
  periodStart: string;
  periodEnd: string;
  locale: string;
  tips: string[];
  fallback: boolean;
  createdAt: string;
};

export async function apiListAiReports(
  token: string,
  kind?: "weekly" | "monthly",
): Promise<{ ok: boolean; reports: AiReportRecord[]; tableReady?: boolean }> {
  const q = kind ? `?kind=${kind}` : "";
  const res = await apiFetch(`/api/household/ai-reports${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res);
}

export async function apiSaveAiReport(
  token: string,
  body: {
    kind: "weekly" | "monthly";
    periodStart: string;
    periodEnd: string;
    locale: "ru" | "en";
    tips: string[];
    fallback?: boolean;
    summaryJson?: unknown;
  },
): Promise<{ ok: boolean; report?: AiReportRecord }> {
  const res = await apiFetch("/api/household/ai-reports", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function apiSync(token: string) {
  const res = await apiFetch("/api/household/sync", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson<{ ok: boolean; sync: SyncPayload }>(res);
}

export async function apiImportLocal(
  token: string,
  data: {
    transactions: Transaction[];
    categories: CategoryDefinition[];
    replaceTransactions?: boolean;
    replacePlanning?: boolean;
    savingsGoals?: SavingsGoal[];
    categoryBudgets?: CategoryBudget[];
    recurringTransactions?: RecurringTransaction[];
    debts?: DebtItem[];
  },
) {
  const res = await apiFetch("/api/household/import", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  return parseJson<{ ok: boolean; sync: SyncPayload }>(res);
}

export async function apiPatchPartnerLabel(token: string, partnerLabel: string | null) {
  const res = await apiFetch("/api/household/partner-label", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ partnerLabel }),
  });
  return parseJson<{ ok: boolean; sync: SyncPayload }>(res);
}

export async function apiPatchBalanceOffset(
  token: string,
  targetUserId: string,
  offset: number,
) {
  const res = await apiFetch("/api/household/balance-offsets", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ targetUserId, offset }),
  });
  return parseJson<{ ok: boolean; sync: SyncPayload }>(res);
}

export async function apiPatchMoneySetup(token: string, moneySetup: MoneySetup) {
  const res = await apiFetch("/api/household/money-setup", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ moneySetup }),
  });
  return parseJson<{ ok: boolean; sync: SyncPayload }>(res);
}

export async function apiCreateTransaction(token: string, tx: Transaction) {
  const res = await apiFetch("/api/household/transactions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(tx),
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? `http_${res.status}`);
  }
  return parseJson<{ ok: boolean; sync: SyncPayload }>(res);
}

export async function apiUpdateTransaction(
  token: string,
  id: string,
  patch: Partial<
    Pick<
      Transaction,
      | "amount"
      | "categoryId"
      | "date"
      | "owner"
      | "createdBy"
      | "type"
      | "goalId"
      | "goalAmount"
      | "odometerKm"
      | "fuelLiters"
      | "vehicleId"
      | "note"
    >
  >,
) {
  const res = await apiFetch(`/api/household/transactions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? `http_${res.status}`);
  }
  return parseJson<{ ok: boolean; sync: SyncPayload }>(res);
}

export async function apiDeleteTransaction(token: string, id: string) {
  const res = await apiFetch(`/api/household/transactions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? `http_${res.status}`);
  }
  return parseJson<{ ok: boolean; sync: SyncPayload }>(res);
}

export async function apiUpsertCategory(token: string, cat: CategoryDefinition) {
  const res = await apiFetch("/api/household/categories", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cat),
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? `http_${res.status}`);
  }
}

export async function apiDeleteCategory(token: string, id: string) {
  const res = await apiFetch(`/api/household/categories/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? `http_${res.status}`);
  }
}

export async function apiUpsertGoal(token: string, goal: SavingsGoal) {
  const res = await apiFetch("/api/household/goals", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(goal),
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? `http_${res.status}`);
  }
}

export async function apiDeleteGoal(token: string, id: string) {
  const res = await apiFetch(`/api/household/goals/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? `http_${res.status}`);
  }
}

export async function apiUpsertCategoryBudget(token: string, budget: CategoryBudget) {
  const res = await apiFetch("/api/household/category-budgets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(budget),
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? `http_${res.status}`);
  }
}

export async function apiDeleteCategoryBudget(token: string, categoryId: string) {
  const res = await apiFetch(
    `/api/household/category-budgets/${encodeURIComponent(categoryId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? `http_${res.status}`);
  }
}

export async function apiUpsertRecurring(token: string, item: RecurringTransaction) {
  const res = await apiFetch("/api/household/recurring", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(item),
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? `http_${res.status}`);
  }
}

export async function apiDeleteRecurring(token: string, id: string) {
  const res = await apiFetch(`/api/household/recurring/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? `http_${res.status}`);
  }
}

export async function apiUpsertDebt(token: string, item: DebtItem) {
  const res = await apiFetch("/api/household/debts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(item),
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? `http_${res.status}`);
  }
}

export async function apiDeleteDebt(token: string, id: string) {
  const res = await apiFetch(`/api/household/debts/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? `http_${res.status}`);
  }
}

export async function apiEducationAccess(token: string) {
  const res = await apiFetch("/api/payments/education", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson<{
    ok: boolean;
    access: import("@/lib/payments/education").EducationAccessPublic;
  }>(res);
}

export async function apiCreateEducationCheckout(token: string) {
  const res = await apiFetch("/api/payments/education", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  return parseJson<{
    ok: boolean;
    confirmationUrl?: string;
    paymentId?: string;
    amountDueRub?: number;
    error?: string;
  }>(res);
}

export async function apiCreateYookassaCheckout(token: string, useReferralWallet = false) {
  const res = await apiFetch("/api/payments/yookassa/create", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ useReferralWallet }),
  });
  return parseJson<{
    ok: boolean;
    confirmationUrl?: string;
    paymentId?: string;
    paidFromWallet?: boolean;
    walletUsedRub?: number;
    amountDueRub?: number;
  }>(res);
}

export async function apiSubscriptionStatus(token: string) {
  const res = await apiFetch("/api/payments/yookassa/create", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson<{ ok: boolean; subscription: SubscriptionPublic; paymentsConfigured: boolean }>(
    res,
  );
}

export async function apiPutGarage(
  token: string,
  vehicles: Vehicle[],
  vehiclePrefs: VehicleGaragePrefs,
) {
  const res = await apiFetch("/api/household/vehicle", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ vehicles, vehiclePrefs }),
  });
  return parseJson<{ ok: boolean; sync: SyncPayload }>(res);
}

export async function apiDeleteGarage(token: string) {
  const res = await apiFetch("/api/household/vehicle", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson<{ ok: boolean; sync: SyncPayload }>(res);
}

export async function apiRedeemPromoCode(token: string, code: string) {
  const res = await apiFetch("/api/payments/promo/redeem", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code }),
  });
  return parseJson<{
    ok: boolean;
    bonusDays: number;
    expiresAt: string;
    label: string | null;
    subscription: SubscriptionPublic;
  }>(res);
}

export async function apiPullBusiness(token: string) {
  const res = await apiFetch("/api/business/sync", {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 503) return { ok: false as const, business: null };
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false as const, error: data.error, business: null };
  }
  return parseJson<{ ok: boolean; business: import("@/lib/business/types").BusinessCloudPayload | null }>(
    res,
  );
}

export async function apiPushBusiness(
  token: string,
  business: import("@/lib/business/types").BusinessCloudPayload,
) {
  const res = await apiFetch("/api/business/sync", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(business),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false as const, error: data.error };
  }
  return parseJson<{ ok: boolean }>(res);
}

export type BusinessBackupSummary = {
  id: string;
  createdAt: string;
  reason: string;
  units: number;
  transactions: number;
  assets: number;
  debts: number;
  unitNames: string[];
  assetNames: string[];
};

export async function apiListBusinessBackups(token: string) {
  const res = await apiFetch("/api/business/backups", {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  return parseJson<{ ok: boolean; backups: BusinessBackupSummary[] }>(res);
}

export async function apiRestoreBusinessBackup(token: string, backupId: string) {
  const res = await apiFetch("/api/business/backups", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ backupId }),
    signal: AbortSignal.timeout(20_000),
  });
  return parseJson<{
    ok: boolean;
    business: import("@/lib/business/types").BusinessCloudPayload;
  }>(res);
}

export async function apiCreateBusinessBackup(token: string) {
  const res = await apiFetch("/api/business/backups", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "create" }),
    signal: AbortSignal.timeout(20_000),
  });
  return parseJson<{ ok: boolean; backups: BusinessBackupSummary[] }>(res);
}

export type HouseholdBackupSummary = {
  id: string;
  createdAt: string;
  reason: string;
  transactions: number;
  categories: number;
  goals: number;
  recurring: number;
  debts: number;
  budgets: number;
  vehicles: number;
};

export async function apiListHouseholdBackups(token: string) {
  const res = await apiFetch("/api/household/backups", {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  return parseJson<{ ok: boolean; backups: HouseholdBackupSummary[] }>(res);
}

export async function apiCreateHouseholdBackup(
  token: string,
  snapshot?: SyncPayload | null,
) {
  const res = await apiFetch("/api/household/backups", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "create", snapshot }),
    signal: AbortSignal.timeout(20_000),
  });
  return parseJson<{ ok: boolean; backups: HouseholdBackupSummary[] }>(res);
}

export async function apiRestoreHouseholdBackup(token: string, backupId: string) {
  const res = await apiFetch("/api/household/backups", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "restore", backupId }),
    signal: AbortSignal.timeout(25_000),
  });
  return parseJson<{ ok: boolean; sync: SyncPayload }>(res);
}

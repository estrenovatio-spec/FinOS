import { getCloudAuthBody } from "@/lib/cloud/auth-payload";

/** Report a calendar day with an entry (local or cloud) for referral qualify. */
export function reportReferralActivityDay(date: string): void {
  const auth = getCloudAuthBody();
  if (!auth.initData && !auth.telegramLogin) return;
  if (!date?.trim()) return;

  void fetch("/api/referrals/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...auth, date }),
    keepalive: true,
  }).then(async (res) => {
    if (!res.ok) return;
    const data = (await res.json()) as { qualified?: boolean };
    if (data.qualified) {
      const { runHouseholdBootstrap } = await import("@/lib/cloud/bootstrap");
      await runHouseholdBootstrap();
    }
  });
}

import { prisma } from "@/lib/db";

let cached: boolean | null = null;
let cachedAt = 0;
const TTL_MS = 60_000;

/** Referral tables + qualify migration applied in Supabase. */
export async function isReferralSchemaReady(): Promise<boolean> {
  const now = Date.now();
  if (cached !== null && now - cachedAt < TTL_MS) return cached;

  try {
    const rows = await prisma.$queryRaw<{ referral: number; activity: number; status: number }[]>`
      SELECT
        (SELECT COUNT(*) FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'Referral')::int AS referral,
        (SELECT COUNT(*) FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'ReferralActivityDay')::int AS activity,
        (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'Referral' AND column_name = 'status')::int AS status
    `;
    const ok =
      (rows[0]?.referral ?? 0) > 0 &&
      (rows[0]?.activity ?? 0) > 0 &&
      (rows[0]?.status ?? 0) > 0;
    cached = ok;
    cachedAt = now;
    return ok;
  } catch {
    cached = false;
    cachedAt = now;
    return false;
  }
}

export function resetReferralSchemaReadyCache(): void {
  cached = null;
  cachedAt = 0;
}

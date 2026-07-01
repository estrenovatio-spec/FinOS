import { prisma } from "@/lib/db";
import { referralActivityDaysRequired } from "@/lib/referrals/config";

/** Normalize tx.date to YYYY-MM-DD. */
export function normalizeActivityDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function recordReferralActivityDay(
  userId: string,
  rawDate: string,
): Promise<number> {
  const activityDate = normalizeActivityDate(rawDate);
  if (!activityDate) return countReferralActivityDays(userId);

  await prisma.referralActivityDay.upsert({
    where: {
      userId_activityDate: { userId, activityDate },
    },
    create: { userId, activityDate },
    update: {},
  });

  return countReferralActivityDays(userId);
}

export async function countReferralActivityDays(
  userId: string,
  since?: Date,
): Promise<number> {
  const rows = await prisma.referralActivityDay.findMany({
    where: { userId },
    select: { activityDate: true, createdAt: true },
  });

  const sinceIso = since?.toISOString().slice(0, 10);
  const dates = new Set<string>();
  for (const row of rows) {
    if (sinceIso && row.activityDate < sinceIso) continue;
    dates.add(row.activityDate);
  }
  return dates.size;
}

export function referralActivityDaysRequiredCount(): number {
  return referralActivityDaysRequired();
}

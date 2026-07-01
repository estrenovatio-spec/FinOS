import { AiAnalysisKind } from "@prisma/client";
import { prisma } from "@/lib/db";

export type AiReportPublic = {
  id: string;
  kind: "weekly" | "monthly";
  periodStart: string;
  periodEnd: string;
  locale: string;
  tips: string[];
  fallback: boolean;
  createdAt: string;
};

export type SaveAiAnalysisReportResult = {
  report: AiReportPublic;
  created: boolean;
};

export async function isAiReportsTableReady(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'AiAnalysisReport'
    `;
    return (rows[0]?.n ?? 0) >= 1;
  } catch {
    return false;
  }
}

export async function saveAiAnalysisReport(input: {
  userId: string;
  kind: "weekly" | "monthly";
  periodStart: string;
  periodEnd: string;
  locale: string;
  tips: string[];
  fallback?: boolean;
  summaryJson?: unknown;
}): Promise<SaveAiAnalysisReportResult | null> {
  if (!(await isAiReportsTableReady())) return null;

  const kind = input.kind === "monthly" ? AiAnalysisKind.monthly : AiAnalysisKind.weekly;

  const existing = await prisma.aiAnalysisReport.findFirst({
    where: {
      userId: input.userId,
      kind,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return { report: toPublic(existing), created: false };

  const row = await prisma.aiAnalysisReport.create({
    data: {
      userId: input.userId,
      kind,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      locale: input.locale,
      tips: input.tips,
      fallback: Boolean(input.fallback),
      summaryJson: input.summaryJson ?? undefined,
    },
  });

  return { report: toPublic(row), created: true };
}

export async function listAiAnalysisReports(
  userId: string,
  kind?: "weekly" | "monthly",
  limit = 24,
): Promise<AiReportPublic[]> {
  if (!(await isAiReportsTableReady())) return [];

  const rows = await prisma.aiAnalysisReport.findMany({
    where: {
      userId,
      ...(kind
        ? { kind: kind === "monthly" ? AiAnalysisKind.monthly : AiAnalysisKind.weekly }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(1, limit), 50),
  });

  return rows.map(toPublic);
}

function toPublic(row: {
  id: string;
  kind: AiAnalysisKind;
  periodStart: string;
  periodEnd: string;
  locale: string;
  tips: unknown;
  fallback: boolean;
  createdAt: Date;
}): AiReportPublic {
  const tips = Array.isArray(row.tips)
    ? row.tips.filter((t): t is string => typeof t === "string")
    : [];
  return {
    id: row.id,
    kind: row.kind === AiAnalysisKind.monthly ? "monthly" : "weekly",
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    locale: row.locale,
    tips,
    fallback: row.fallback,
    createdAt: row.createdAt.toISOString(),
  };
}

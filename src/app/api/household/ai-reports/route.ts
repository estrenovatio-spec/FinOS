import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api/household-auth";
import { dbUnavailable, unauthorized } from "@/lib/api/household-response";
import { isDatabaseConfigured } from "@/lib/db";
import { mapHouseholdApiError } from "@/lib/household/api-errors";
import {
  isAiReportsTableReady,
  listAiAnalysisReports,
  saveAiAnalysisReport,
} from "@/lib/household/ai-reports";
import { notifyAiReportReady } from "@/lib/household/ai-report-notifications";

export const dynamic = "force-dynamic";

const saveSchema = z.object({
  kind: z.enum(["weekly", "monthly"]),
  periodStart: z.string().min(8),
  periodEnd: z.string().min(8),
  locale: z.enum(["ru", "en"]),
  tips: z.array(z.string().min(1)).min(1).max(12),
  fallback: z.boolean().optional(),
  summaryJson: z.unknown().optional(),
});

export async function GET(req: NextRequest) {
  if (!isDatabaseConfigured()) return dbUnavailable();

  const session = requireSession(req);
  if (!session) return unauthorized();

  if (!(await isAiReportsTableReady())) {
    return NextResponse.json({ ok: true, reports: [], tableReady: false });
  }

  const kind = req.nextUrl.searchParams.get("kind");
  const parsedKind = kind === "weekly" || kind === "monthly" ? kind : undefined;

  try {
    const reports = await listAiAnalysisReports(session.userId, parsedKind);
    return NextResponse.json({ ok: true, reports, tableReady: true });
  } catch (e) {
    console.error("[household/ai-reports GET]", e);
    const { code, status } = mapHouseholdApiError(e);
    return NextResponse.json({ error: code }, { status });
  }
}

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) return dbUnavailable();

  const session = requireSession(req);
  if (!session) return unauthorized();

  if (!(await isAiReportsTableReady())) {
    return NextResponse.json(
      { ok: false, error: "ai_reports_db_not_migrated" },
      { status: 503 },
    );
  }

  let body: z.infer<typeof saveSchema>;
  try {
    body = saveSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const saved = await saveAiAnalysisReport({
      userId: session.userId,
      ...body,
    });
    if (!saved) {
      return NextResponse.json(
        { ok: false, error: "ai_reports_db_not_migrated" },
        { status: 503 },
      );
    }
    if (saved.created && !body.fallback) {
      notifyAiReportReady({
        userId: session.userId,
        kind: body.kind,
        locale: body.locale,
      }).catch((error) => {
        console.error("[household/ai-reports notify]", error);
      });
    }
    const report = saved.report;
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    console.error("[household/ai-reports POST]", e);
    const { code, status } = mapHouseholdApiError(e);
    return NextResponse.json({ error: code }, { status });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireSession } from "@/lib/api/household-auth";
import { isDatabaseConfigured, prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const MAX_EXPORT_BYTES = 6 * 1024 * 1024;
const EXPORT_TTL_MS = 10 * 60_000;

function sessionFromRequest(req: NextRequest) {
  const headerSession = requireSession(req);
  if (headerSession) return headerSession;
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token) return null;
  const authReq = new NextRequest(req.url, {
    headers: { authorization: `Bearer ${token}` },
  });
  return requireSession(authReq);
}

function safeFilename(value: string): string {
  const fallback = "prosto-budget-export";
  return (
    value
      .replace(/[/\\?%*:|"<>]+/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140) || fallback
  );
}

function encodeContentDisposition(filename: string): string {
  const ascii = filename.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

async function ensureReportExportTable(): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ReportExportFile" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "filename" TEXT NOT NULL,
        "mime" TEXT NOT NULL,
        "content" BYTEA NOT NULL,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ReportExportFile_userId_idx"
      ON "ReportExportFile" ("userId")
    `);
    await prisma.$executeRawUnsafe(`
      DELETE FROM "ReportExportFile" WHERE "expiresAt" < NOW()
    `);
    return true;
  } catch (e) {
    console.error("[reports/file table]", e);
    return false;
  }
}

export async function POST(req: NextRequest) {
  const session = sessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await ensureReportExportTable())) {
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 });
  }

  let body: { filename?: string; mime?: string; base64?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const filename = safeFilename(body.filename ?? "");
  const mime = body.mime?.trim() || "application/octet-stream";
  const base64 = body.base64?.trim() ?? "";
  if (!base64) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  let content: Buffer;
  try {
    content = Buffer.from(base64, "base64");
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (content.length <= 0 || content.length > MAX_EXPORT_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }

  const id = randomUUID();
  const expiresAt = new Date(Date.now() + EXPORT_TTL_MS);
  await prisma.$executeRaw`
    INSERT INTO "ReportExportFile" ("id", "userId", "filename", "mime", "content", "expiresAt")
    VALUES (${id}, ${session.userId}, ${filename}, ${mime}, ${content}, ${expiresAt})
  `;

  return NextResponse.json({ ok: true, id, expiresAt: expiresAt.toISOString() });
}

export async function GET(req: NextRequest) {
  const session = sessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await ensureReportExportTable())) {
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 });
  }

  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const rows = await prisma.$queryRaw<
    { filename: string; mime: string; content: Buffer; expiresAt: Date }[]
  >`
    SELECT "filename", "mime", "content", "expiresAt"
    FROM "ReportExportFile"
    WHERE "id" = ${id} AND "userId" = ${session.userId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || row.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(row.content), {
    headers: {
      "Content-Type": row.mime,
      "Content-Disposition": encodeContentDisposition(row.filename),
      "Cache-Control": "no-store",
    },
  });
}

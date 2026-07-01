import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { isPaymentsConfigured } from "@/lib/payments/config";
import type { YookassaNotification } from "@/lib/payments/types";
import { handleYookassaNotification } from "@/lib/payments/yookassa";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured() || !isPaymentsConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  let body: YookassaNotification;
  try {
    body = (await req.json()) as YookassaNotification;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    await handleYookassaNotification(body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[payments/yookassa/webhook]", e);
    return NextResponse.json({ error: "webhook_failed" }, { status: 500 });
  }
}

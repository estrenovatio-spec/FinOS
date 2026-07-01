import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dbUnavailable } from "@/lib/api/household-response";
import { isDatabaseConfigured } from "@/lib/db";
import { householdAuthSchema } from "@/lib/household/auth-body";
import { upsertTelegramUser } from "@/lib/household/service";
import { requireTelegramUser } from "@/lib/household/require-telegram-user";
import { recordActivityAndTryQualify } from "@/lib/referrals/qualify";

export const dynamic = "force-dynamic";

const bodySchema = householdAuthSchema.and(
  z.object({
    date: z.string().min(4),
  }),
);

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) return dbUnavailable();

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const tgUser = requireTelegramUser(body);
  if (!tgUser) {
    return NextResponse.json({ error: "invalid_init_data" }, { status: 401 });
  }

  try {
    const user = await upsertTelegramUser(tgUser);
    const result = await recordActivityAndTryQualify(user.id, body.date);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[referrals/activity]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

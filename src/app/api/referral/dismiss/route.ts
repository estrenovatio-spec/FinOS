import { NextResponse } from "next/server";
import { z } from "zod";
import { householdAuthBaseSchema, householdAuthSchema } from "@/lib/household/auth-body";
import { requireTelegramUser } from "@/lib/household/require-telegram-user";
import { upsertTelegramUser } from "@/lib/household/service";
import { dismissPendingReferral } from "@/lib/referrals/dismiss-pending";

export const dynamic = "force-dynamic";

const bodySchema = householdAuthBaseSchema
  .extend({
    referralId: z.string().min(1).max(64),
  })
  .refine((b) => Boolean(b.initData?.trim() || b.telegramLogin), {
    message: "auth_required",
  });

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const data = bodySchema.parse(json);
    const tgUser = requireTelegramUser(householdAuthSchema.parse(data));
    if (!tgUser) {
      return NextResponse.json({ error: "telegram_required" }, { status: 401 });
    }

    const user = await upsertTelegramUser(tgUser);
    const result = await dismissPendingReferral(user.id, data.referralId);
    if ("error" in result) {
      const status =
        result.error === "not_found" ? 404 : result.error === "too_early" ? 400 : 409;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
}

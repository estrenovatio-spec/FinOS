import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dbUnavailable, notFound } from "@/lib/api/household-response";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import { householdAuthBaseSchema } from "@/lib/household/auth-body";
import { mapHouseholdApiError } from "@/lib/household/api-errors";
import { requireTelegramUser } from "@/lib/household/require-telegram-user";
import { signHouseholdSession } from "@/lib/household/token";
import { scheduleHouseholdMemberGoogleSheetLog } from "@/lib/google-sheets-schedule";
import { joinHousehold, upsertTelegramUser } from "@/lib/household/service";

const bodySchema = householdAuthBaseSchema
  .extend({
    inviteCode: z.string().min(4).max(12),
  })
  .refine((b) => Boolean(b.initData?.trim() || b.telegramLogin), {
    message: "auth_required",
  });

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) return dbUnavailable();

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const tgUser = requireTelegramUser(body);
  if (!tgUser) return NextResponse.json({ error: "invalid_init_data" }, { status: 401 });

  try {
    const user = await upsertTelegramUser(tgUser);
    const { household, sync, isNew } = await joinHousehold(user.id, body.inviteCode);
    if (isNew) {
      scheduleHouseholdMemberGoogleSheetLog({
        action: "join",
        tgUser,
        household,
        logTag: "household/join",
        onSuccess: async () => {
          await prisma.user.update({
            where: { id: user.id },
            data: { googleSheetsOpenLogged: true },
          });
        },
      });
    }
    const token = signHouseholdSession({ userId: user.id, householdId: household.id });
    return NextResponse.json({ ok: true, user: { id: user.id }, household, token, sync });
  } catch (e) {
    if (!(e instanceof Error)) {
      console.error("[household/join]", e);
      const { code, status } = mapHouseholdApiError(e);
      return NextResponse.json({ error: code }, { status });
    }
    if (e.message === "household_not_found") return notFound();
    if (e.message === "invalid_code") {
      return NextResponse.json({ error: "invalid_code" }, { status: 400 });
    }
    console.error("[household/join]", e);
    const { code, status } = mapHouseholdApiError(e);
    return NextResponse.json({ error: code }, { status });
  }
}

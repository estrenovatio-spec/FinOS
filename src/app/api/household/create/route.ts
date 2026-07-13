import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setHouseholdSessionCookie } from "@/lib/auth/session-cookie";
import { dbUnavailable } from "@/lib/api/household-response";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import { householdAuthBaseSchema } from "@/lib/household/auth-body";
import { mapHouseholdApiError } from "@/lib/household/api-errors";
import { requireTelegramUser } from "@/lib/household/require-telegram-user";
import { signHouseholdSession } from "@/lib/household/token";
import { scheduleHouseholdMemberGoogleSheetLog } from "@/lib/google-sheets-schedule";
import { createHousehold, upsertTelegramUser } from "@/lib/household/service";

const bodySchema = householdAuthBaseSchema
  .extend({
    name: z.string().max(80).optional(),
    mode: z.enum(["solo", "shared"]).optional(),
    partnerLabel: z.string().max(40).nullable().optional(),
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
    const { household, sync, isNew } = await createHousehold(user.id, {
      name: body.name,
      mode: body.mode ?? "solo",
      partnerLabel: body.partnerLabel ?? null,
    });
    if (isNew) {
      scheduleHouseholdMemberGoogleSheetLog({
        action: "create",
        tgUser,
        household,
        logTag: "household/create",
        onSuccess: async () => {
          await prisma.user.update({
            where: { id: user.id },
            data: { googleSheetsOpenLogged: true },
          });
        },
      });
    }
    const token = signHouseholdSession({ userId: user.id, householdId: household.id });
    const response = NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email ?? null },
      household,
      token,
      sync,
    });
    setHouseholdSessionCookie(response, token);
    return response;
  } catch (e) {
    console.error("[household/create]", e);
    const { code, status } = mapHouseholdApiError(e);
    return NextResponse.json({ error: code }, { status });
  }
}

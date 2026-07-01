import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dbUnavailable } from "@/lib/api/household-response";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import { mapHouseholdApiError } from "@/lib/household/api-errors";
import { getUserMembership } from "@/lib/household/service";
import { logHouseholdMemberToGoogleSheet, type HouseholdMemberLogAction } from "@/lib/google-sheets";
import { logServiceInquiryToGoogleSheet } from "@/lib/google-sheets-service-inquiry";
import { SERVICE_INQUIRY_IDS } from "@/lib/services/inquiry-types";
import type { HouseholdPublic } from "@/lib/household/types";
import type { TelegramWebAppUser } from "@/lib/telegram/init-data";
import { isAdminAuthorized, requireAdminSecrets } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

function toPublicFromRow(
  h: {
    id: string;
    name: string;
    mode: "SOLO" | "SHARED";
    inviteCode: string;
    partnerLabel: string | null;
  },
  memberCount: number,
): HouseholdPublic {
  return {
    id: h.id,
    name: h.name,
    inviteCode: h.inviteCode,
    partnerLabel: h.partnerLabel,
    mode: h.mode === "SHARED" ? "shared" : "solo",
    memberCount,
  };
}

const bodySchema = z.object({
  kind: z.enum(["member", "service"]).optional(),
  action: z.enum(["open", "create", "join"]).optional(),
  serviceId: z.enum(SERVICE_INQUIRY_IDS).optional(),
  telegramUserId: z.union([z.string(), z.number()]).optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  username: z.string().optional(),
  phone: z.string().optional(),
});

/** POST Authorization: Bearer <HOUSEHOLD_SESSION_SECRET> — тест или догоняющая запись в Google Таблицу */
export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) return dbUnavailable();

  if (!requireAdminSecrets()) {
    return NextResponse.json({ error: "admin_not_configured" }, { status: 503 });
  }

  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json().catch(() => ({})));
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const webhookConfigured = Boolean(process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim());
  if (!webhookConfigured) {
    return NextResponse.json({ error: "google_sheets_not_configured" }, { status: 503 });
  }

  try {
    let action: HouseholdMemberLogAction = body.action ?? "open";
    let tgUser: TelegramWebAppUser = {
      id: 999999001,
      first_name: body.firstName ?? "Тест",
      last_name: body.lastName ?? "Просто Бюджет",
      username: body.username ?? "voicebudget_test",
    };
    let household: HouseholdPublic | null = null;

    if (body.telegramUserId != null) {
      const telegramId = BigInt(String(body.telegramUserId).trim());
      const user = await prisma.user.findUnique({
        where: { telegramId },
        select: { id: true, telegramId: true, firstName: true, username: true },
      });
      if (!user) {
        return NextResponse.json({ error: "user_not_found" }, { status: 404 });
      }

      tgUser = {
        id: Number(user.telegramId),
        first_name: user.firstName ?? "",
        ...(user.username ? { username: user.username } : {}),
      };

      const membership = await getUserMembership(user.id);
      if (membership) {
        const row = await prisma.household.findUnique({
          where: { id: membership.householdId },
          include: { members: true },
        });
        if (row) {
          household = toPublicFromRow(row, row.members.length);
          if (!body.action) action = "create";
        }
      } else if (!body.action) {
        action = "open";
      }
    }

    if (body.kind === "service") {
      const serviceId = body.serviceId ?? "osago";
      await logServiceInquiryToGoogleSheet({
        serviceId,
        fullName: `${tgUser.first_name ?? "Тест"} ${body.lastName ?? "Sheets"}`.trim(),
        phone: body.phone?.trim() || "+79990000000",
        tgUser,
      });
      return NextResponse.json({
        ok: true,
        kind: "service",
        serviceId,
        telegramUserId: tgUser.id,
      });
    }

    await logHouseholdMemberToGoogleSheet({ action, tgUser, household });

    return NextResponse.json({
      ok: true,
      kind: "member",
      action,
      telegramUserId: tgUser.id,
      householdId: household?.id ?? null,
    });
  } catch (e) {
    console.error("[admin/test-google-sheets]", e);
    const message = e instanceof Error ? e.message : "unknown";
    const { code, status } = mapHouseholdApiError(e);
    return NextResponse.json({ error: code, message }, { status });
  }
}

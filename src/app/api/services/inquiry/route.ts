import { NextResponse } from "next/server";
import { z } from "zod";
import { logServiceInquiryToGoogleSheet } from "@/lib/google-sheets-service-inquiry";
import { householdAuthBaseSchema, householdAuthSchema } from "@/lib/household/auth-body";
import { requireTelegramUser } from "@/lib/household/require-telegram-user";
import { SERVICE_INQUIRY_IDS } from "@/lib/services/inquiry-types";
import { notifyServiceInquiryAdmin } from "@/lib/services/notify-admin";

export const dynamic = "force-dynamic";

const bodySchema = householdAuthBaseSchema
  .extend({
    serviceId: z.enum(SERVICE_INQUIRY_IDS),
    name: z.string().min(1).max(120),
    phone: z.string().min(5).max(32),
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

    const fullName = data.name.trim();
    const phone = data.phone.trim();
    const telegram = tgUser.username ? `@${tgUser.username.replace(/^@/, "")}` : undefined;

    await notifyServiceInquiryAdmin({
      serviceId: data.serviceId,
      fullName,
      phone,
      telegram,
    });

    try {
      await logServiceInquiryToGoogleSheet({
        serviceId: data.serviceId,
        fullName,
        phone,
        tgUser,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[services/inquiry] google sheets failed:", msg, {
        serviceId: data.serviceId,
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
}

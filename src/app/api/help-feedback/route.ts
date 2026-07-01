import { NextResponse } from "next/server";
import { z } from "zod";
import { householdAuthBaseSchema, householdAuthSchema } from "@/lib/household/auth-body";
import { requireTelegramUser } from "@/lib/household/require-telegram-user";
import { escapeHtml, sendMessage } from "@/lib/telegram/bot-api";

export const dynamic = "force-dynamic";

const bodySchema = householdAuthBaseSchema
  .extend({
    kind: z.enum(["idea", "issue", "thanks"]),
    message: z.string().min(3).max(2000),
  })
  .refine((b) => Boolean(b.initData?.trim() || b.telegramLogin), {
    message: "auth_required",
  });

const KIND_LABEL: Record<z.infer<typeof bodySchema>["kind"], string> = {
  idea: "Предложение",
  issue: "Замечание",
  thanks: "Благодарность",
};

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      const authIssue = parsed.error.issues.some((issue) => issue.message === "auth_required");
      return NextResponse.json(
        { error: authIssue ? "telegram_required" : "invalid_request" },
        { status: authIssue ? 401 : 400 },
      );
    }
    const data = parsed.data;
    const tgUser = requireTelegramUser(householdAuthSchema.parse(data));
    if (!tgUser) {
      return NextResponse.json({ error: "telegram_required" }, { status: 401 });
    }

    const chatIdRaw = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();
    const chatId = chatIdRaw ? Number(chatIdRaw) : NaN;
    if (!Number.isFinite(chatId)) {
      console.warn("TELEGRAM_ADMIN_CHAT_ID не задан — feedback не отправлен");
      return NextResponse.json({ error: "admin_chat_not_configured" }, { status: 500 });
    }

    const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ").trim();
    const username = tgUser.username ? `@${tgUser.username.replace(/^@/, "")}` : "—";
    const lines = [
      "💬 <b>Просто Бюджет — обратная связь</b>",
      "",
      `<b>Тип:</b> ${escapeHtml(KIND_LABEL[data.kind])}`,
      `<b>Пользователь:</b> ${escapeHtml(name || "—")}`,
      `<b>Telegram:</b> ${escapeHtml(username)}`,
      `<b>ID:</b> ${escapeHtml(String(tgUser.id))}`,
      "",
      "<b>Сообщение:</b>",
      escapeHtml(data.message.trim()),
    ];

    await sendMessage(chatId, lines.join("\n"), { parse_mode: "HTML" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[help-feedback]", err);
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
}

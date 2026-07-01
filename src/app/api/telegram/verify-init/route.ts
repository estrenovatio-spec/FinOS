import { NextRequest, NextResponse } from "next/server";
import { diagnoseTelegramInitData, parseTelegramInitData } from "@/lib/telegram/init-data";
import { getTelegramBotName } from "@/lib/telegram/bot-name";
import { getTelegramBotTokens } from "@/lib/telegram/bot-token";

export const dynamic = "force-dynamic";

/** POST { initData } — check if Mini App session matches server bot token(s). */
export async function POST(req: NextRequest) {
  let initData = "";
  try {
    const body = (await req.json()) as { initData?: string };
    initData = body.initData?.trim() ?? "";
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  if (!initData) {
    return NextResponse.json({
      ok: false,
      reason: "empty_init_data",
      expectedBot: getTelegramBotName(),
    });
  }

  const parsed = parseTelegramInitData(initData);
  if (!parsed) {
    const diag = diagnoseTelegramInitData(initData);
    return NextResponse.json({
      ok: false,
      reason: diag.reason === "wrong_bot" ? "wrong_bot" : diag.reason,
      expectedBot: getTelegramBotName(),
      hint:
        diag.reason === "wrong_bot"
          ? "Сессия от @Fin_BU_bot. Откройте Mini App только из @fintest_BU_bot."
          : diag.reason === "expired"
            ? "Сессия устарела. Закройте Telegram полностью и откройте Mini App снова."
            : "Откройте Mini App из чата @fintest_BU_bot (не @Fin_BU_bot), затем полностью закройте Telegram.",
    });
  }

  return NextResponse.json({
    ok: true,
    reason: "valid",
    expectedBot: getTelegramBotName(),
    tokensConfigured: getTelegramBotTokens().length,
    tokenSource: parsed.tokenSource ?? null,
    userId: parsed.user.id,
  });
}

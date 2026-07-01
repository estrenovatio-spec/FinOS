import { createHmac, timingSafeEqual } from "crypto";
import {
  getTelegramBotTokens,
  requirePreviewBotTokenOnInitData,
} from "@/lib/telegram/bot-token";

export type InitDataTokenSource = "preview" | "production";

export interface TelegramWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

function parseTelegramInitDataWithToken(
  initData: string,
  botToken: string,
): { user: TelegramWebAppUser; authDate: number } | null {
  if (!botToken || !initData.trim()) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;

  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key !== "hash") pairs.push(`${key}=${value}`);
  });
  pairs.sort((a, b) => a.localeCompare(b));
  const dataCheckString = pairs.join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculated = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  try {
    const a = Buffer.from(calculated, "hex");
    const b = Buffer.from(hash, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  const authDate = Number(params.get("auth_date") ?? 0);
  const maxAgeSec = Number(process.env.TELEGRAM_INIT_MAX_AGE_SEC ?? 86400);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;

  const userRaw = params.get("user");
  if (!userRaw) return null;

  try {
    const user = JSON.parse(userRaw) as TelegramWebAppUser;
    if (!user?.id) return null;
    return { user, authDate };
  } catch {
    return null;
  }
}

function tokenSourceForBotToken(botToken: string): InitDataTokenSource {
  const preview = process.env.TELEGRAM_BOT_TOKEN_PREVIEW?.trim();
  return botToken === preview ? "preview" : "production";
}

export function parseTelegramInitData(initData: string): {
  user: TelegramWebAppUser;
  authDate: number;
  tokenSource?: InitDataTokenSource;
} | null {
  const strictPreview = requirePreviewBotTokenOnInitData();
  for (const token of getTelegramBotTokens()) {
    const parsed = parseTelegramInitDataWithToken(initData, token);
    if (!parsed) continue;
    const tokenSource = tokenSourceForBotToken(token);
    if (strictPreview && tokenSource === "production") continue;
    return { ...parsed, tokenSource };
  }
  return null;
}

/** Why initData failed (for diagnostics). */
export function diagnoseTelegramInitData(initData: string): {
  reason: "empty" | "expired" | "wrong_bot" | "invalid" | "valid";
  tokenSource?: InitDataTokenSource;
} {
  const trimmed = initData.trim();
  if (!trimmed) return { reason: "empty" };

  const preview = process.env.TELEGRAM_BOT_TOKEN_PREVIEW?.trim();
  const prod = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const tokens = [preview, prod].filter(Boolean) as string[];
  const strictPreview = requirePreviewBotTokenOnInitData();

  let sawExpired = false;
  let sawProdOnly = false;

  for (const token of tokens) {
    const params = new URLSearchParams(trimmed);
    const hash = params.get("hash");
    if (!hash) continue;

    const pairs: string[] = [];
    params.forEach((value, key) => {
      if (key !== "hash") pairs.push(`${key}=${value}`);
    });
    pairs.sort((a, b) => a.localeCompare(b));
    const dataCheckString = pairs.join("\n");
    const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
    const calculated = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    try {
      const a = Buffer.from(calculated, "hex");
      const b = Buffer.from(hash, "hex");
      if (a.length !== b.length || !timingSafeEqual(a, b)) continue;
    } catch {
      continue;
    }

    const authDate = Number(params.get("auth_date") ?? 0);
    const maxAgeSec = Number(process.env.TELEGRAM_INIT_MAX_AGE_SEC ?? 86400);
    if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) {
      sawExpired = true;
      continue;
    }

    const source = tokenSourceForBotToken(token);
    if (strictPreview && source === "production") {
      sawProdOnly = true;
      continue;
    }

    return { reason: "valid", tokenSource: source };
  }

  if (sawProdOnly) return { reason: "wrong_bot" };
  if (sawExpired) return { reason: "expired" };
  return { reason: "invalid" };
}

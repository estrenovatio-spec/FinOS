import { createHash, createHmac, timingSafeEqual } from "crypto";
import type { TelegramWebAppUser } from "@/lib/telegram/init-data";
import { getTelegramBotTokens } from "@/lib/telegram/bot-token";

export type TelegramLoginPayload = Record<string, string | number>;

/** Validates Telegram Login Widget callback (https://core.telegram.org/widgets/login) */
function parseTelegramLoginWidgetWithToken(
  raw: TelegramLoginPayload,
  botToken: string,
): { user: TelegramWebAppUser; authDate: number } | null {
  const hash = String(raw.hash ?? "");
  if (!hash) return null;

  const pairs: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (key === "hash") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort((a, b) => a.localeCompare(b));
  const dataCheckString = pairs.join("\n");

  const secretKey = createHash("sha256").update(botToken).digest();
  const calculated = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  try {
    const a = Buffer.from(calculated, "hex");
    const b = Buffer.from(hash, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  const authDate = Number(raw.auth_date ?? 0);
  const maxAgeSec = Number(process.env.TELEGRAM_INIT_MAX_AGE_SEC ?? 86400);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;

  const id = Number(raw.id);
  if (!id) return null;

  return {
    user: {
      id,
      first_name: raw.first_name != null ? String(raw.first_name) : undefined,
      last_name: raw.last_name != null ? String(raw.last_name) : undefined,
      username: raw.username != null ? String(raw.username) : undefined,
    },
    authDate,
  };
}

export function parseTelegramLoginWidget(
  raw: TelegramLoginPayload,
): { user: TelegramWebAppUser; authDate: number } | null {
  for (const token of getTelegramBotTokens()) {
    const parsed = parseTelegramLoginWidgetWithToken(raw, token);
    if (parsed) return parsed;
  }
  return null;
}

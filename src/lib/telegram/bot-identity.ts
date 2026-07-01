/** Resolve @username for a bot token via Telegram getMe (no token in response). */
export async function fetchTelegramBotUsername(
  botToken: string | undefined,
): Promise<string | null> {
  if (!botToken?.trim()) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken.trim()}/getMe`, {
      cache: "no-store",
    });
    const data = (await res.json()) as {
      ok?: boolean;
      result?: { username?: string };
    };
    if (!data.ok || !data.result?.username) return null;
    return data.result.username;
  } catch {
    return null;
  }
}

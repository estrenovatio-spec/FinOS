/** POST в Google Apps Script (см. docs/GOOGLE-SHEETS.md). */
export async function postToGoogleAppsScript(
  webhookUrl: string,
  body: Record<string, unknown>,
): Promise<void> {
  const payload = JSON.stringify(body);
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    redirect: "follow",
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Google Sheets webhook HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  try {
    const parsed = JSON.parse(text) as { ok?: boolean; error?: string };
    if (parsed.ok === false) {
      throw new Error(parsed.error ?? "Apps Script returned ok: false");
    }
  } catch (e) {
    if (e instanceof SyntaxError) {
      if (!text.includes('"ok":true') && !text.includes('"ok": true')) {
        throw new Error(`Google Sheets unexpected response: ${text.slice(0, 200)}`);
      }
    } else {
      throw e;
    }
  }
}

async function postToAppsScript(webhookUrl, body) {
  const payload = JSON.stringify(body);
  const headers = { "Content-Type": "application/json" };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: payload,
    redirect: "follow",
  });

  const text = await res.text().catch(() => "");
  console.log("HTTP", res.status, text.slice(0, 300));
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed.ok === false) throw new Error(parsed.error ?? "ok: false");
  } catch (e) {
    if (e instanceof SyntaxError) {
      if (!text.includes('"ok":true') && !text.includes('"ok": true')) {
        throw new Error(`Unexpected response: ${text.slice(0, 200)}`);
      }
    } else {
      throw e;
    }
  }
}

async function main() {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    console.error("GOOGLE_SHEETS_WEBHOOK_URL не задан");
    process.exit(1);
  }

  console.log("Webhook host:", new URL(webhookUrl).host);

  await postToAppsScript(webhookUrl, {
    type: "voicebudget_member",
    createdAt: new Date().toISOString(),
    action: "open",
    actionLabel: "Тест диагностики",
    firstName: "Тест",
    lastName: "Диагностика",
    telegram: "@voicebudget_test",
    telegramUserId: 999999001,
    mode: "",
    memberCount: "",
    inviteCode: "",
    householdId: "",
    siteUrl: "https://voicebudget.vercel.app",
  });

  console.log("OK");
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});

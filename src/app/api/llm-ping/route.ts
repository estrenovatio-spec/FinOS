import { NextResponse } from "next/server";
import { createLlmChatCompletion, getLlmBaseUrl, getLlmClient, getLlmModel, isLlmConfigured } from "@/lib/llm";
import { extractJsonFromLlmContent } from "@/lib/llm-json";

export const dynamic = "force-dynamic";

/** Проверка AI на сервере: откройте /api/llm-ping в браузере после деплоя */
export async function GET() {
  if (!isLlmConfigured()) {
    return NextResponse.json({
      ok: false,
      error: "no_api_key",
      hint: "Задайте LLM_API_KEY, LLM_BASE_URL и LLM_MODEL на Vercel.",
    });
  }

  const baseUrl = getLlmBaseUrl();
  const model = getLlmModel();

  if (!baseUrl) {
    return NextResponse.json({
      ok: false,
      error: "missing_base_url",
      hint: "Задайте LLM_BASE_URL, например https://apinet.cloud/v1.",
      model,
    });
  }

  const client = getLlmClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "client_init_failed" });
  }

  try {
    const completion = await createLlmChatCompletion(client, {
      messages: [
        {
          role: "user",
          content:
            'Ответь ТОЛЬКО JSON без markdown: {"ping":true,"model":"test"}',
        },
      ],
      temperature: 0,
    });

    const content = completion.choices[0]?.message?.content ?? "";
    let parsed: unknown = null;
    try {
      parsed = extractJsonFromLlmContent(content);
    } catch {
      parsed = { raw: content.slice(0, 300) };
    }

    return NextResponse.json({
      ok: true,
      baseUrl,
      model,
      parsed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      ok: false,
      error: message,
      baseUrl,
      model,
      hint: "Проверьте ключ, баланс/квоту у провайдера и имя модели LLM_MODEL.",
    });
  }
}

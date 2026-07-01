function envFirst(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function isPreviewDeploy(): boolean {
  return process.env.VERCEL_ENV === "preview";
}

/** Preview: GROQ_API_KEY_PREVIEW или GROQ_API_KEY */
function getGroqApiKey(): string | undefined {
  if (isPreviewDeploy()) {
    return envFirst("GROQ_API_KEY_PREVIEW", "GROQ_API_KEY");
  }
  return envFirst("GROQ_API_KEY");
}

export type SttProvider = {
  id: string;
  apiKey: string;
  baseUrl: string;
  model: string;
};

/** Какие STT-провайдеры настроены (без секретов) */
export function listSttProviderIds(): string[] {
  return getSttProviders().map((p) => p.id);
}

/**
 * Только быстрые Whisper-совместимые API (Groq, apinet, OpenAI).
 * xinghu/Gemini для голоса в боте не используем — там стабильно падает.
 */
export function getSttProviders(): SttProvider[] {
  const out: SttProvider[] = [];
  const seen = new Set<string>();

  const add = (p: SttProvider) => {
    const key = `${p.baseUrl}|${p.model}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(p);
  };

  const groq = getGroqApiKey();
  if (groq) {
    add({
      id: "groq",
      apiKey: groq,
      baseUrl: "https://api.groq.com/openai/v1",
      model: envFirst("GROQ_STT_MODEL") ?? "whisper-large-v3-turbo",
    });
  }

  const sttKey = envFirst(
    "STT_API_KEY",
    "STT_OPENAI_API_KEY",
    "APINET_API_KEY",
    "OPENAI_WHISPER_API_KEY",
  );
  const sttBase =
    envFirst("STT_BASE_URL", "STT_OPENAI_BASE_URL", "APINET_BASE_URL")?.replace(/\/$/, "") ??
    "https://apinet.cloud/v1";

  if (sttKey) {
    add({
      id: sttBase.includes("apinet") ? "apinet" : "stt",
      apiKey: sttKey,
      baseUrl: sttBase,
      model: envFirst("STT_MODEL") ?? "whisper-1",
    });
  }

  const llmBase = envFirst("LLM_BASE_URL", "OPENAI_BASE_URL")?.replace(/\/$/, "");
  const llmKey = envFirst("LLM_API_KEY", "OPENAI_API_KEY");
  if (llmBase?.includes("apinet.cloud") && llmKey && !sttKey) {
    add({
      id: "apinet-llm-key",
      apiKey: llmKey,
      baseUrl: llmBase.endsWith("/v1") ? llmBase : `${llmBase}/v1`,
      model: envFirst("STT_MODEL") ?? "whisper-1",
    });
  }

  if (llmKey && !sttKey && !groq && !llmBase) {
    add({
      id: "openai-direct",
      apiKey: llmKey,
      baseUrl: "https://api.openai.com/v1",
      model: envFirst("STT_MODEL") ?? "whisper-1",
    });
  }

  return out;
}

/** Для Telegram-бота: сначала Groq (быстрый Whisper), остальные — запас */
export function getTelegramSttProviders(): SttProvider[] {
  const all = getSttProviders();
  const groq = all.find((p) => p.id === "groq");
  if (!groq) return all;
  return [groq, ...all.filter((p) => p.id !== "groq")];
}

/** Запасные модели Groq, если основная недоступна */
export function groqSttModelFallbacks(primary: string): string[] {
  const candidates = [
    primary,
    "whisper-large-v3-turbo",
    "whisper-large-v3",
    "distil-whisper-large-v3-en",
  ];
  return [...new Set(candidates)];
}

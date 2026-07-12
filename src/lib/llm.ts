import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";

function envFirst(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

/** API key: LLM_API_KEY или OPENAI_API_KEY */
export function getLlmApiKey(): string | undefined {
  return envFirst("LLM_API_KEY", "OPENAI_API_KEY");
}

const XINGHU_BASE = "https://xinghuapi.com/v1";

function llmProvider(): string | undefined {
  return envFirst("LLM_PROVIDER")?.toLowerCase();
}

export function getLlmProvider(): string {
  const provider = llmProvider();
  if (provider) return provider;
  return getLlmBaseUrl() ? "custom" : "openai";
}

/** Base URL прокси, напр. https://xinghuapi.com/v1 */
export function getLlmBaseUrl(): string | undefined {
  const explicit = envFirst("LLM_BASE_URL", "OPENAI_BASE_URL");
  if (explicit) return explicit.replace(/\/$/, "");
  if (llmProvider() === "xinghu") return XINGHU_BASE;
  return undefined;
}

export function isLlmConfigured(): boolean {
  return Boolean(getLlmApiKey());
}

export function getLlmClient(): OpenAI | null {
  const apiKey = getLlmApiKey();
  if (!apiKey) return null;

  const baseURL = getLlmBaseUrl();
  return new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    timeout: 25_000,
    maxRetries: 0,
  });
}

/** Клиент для STT — без повторов, длинный таймаут (прокси xinghu медленный) */
export function getSttClient(): OpenAI | null {
  const apiKey = getLlmApiKey();
  if (!apiKey) return null;

  const baseURL = getLlmBaseUrl();
  return new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    timeout: 90_000,
    maxRetries: 0,
  });
}

/** Модель: LLM_MODEL / OPENAI_MODEL, иначе gemini для прокси или gpt-4o-mini для OpenAI */
export function getLlmModel(): string {
  const explicit = envFirst("LLM_MODEL", "OPENAI_MODEL");
  if (explicit) return explicit;
  if (llmProvider() === "xinghu" || getLlmBaseUrl() === XINGHU_BASE) {
    return "gemini-2.5-flash";
  }
  if (getLlmBaseUrl()) return "gemini-2.5-flash";
  return "gpt-4o-mini";
}

/** Speech-to-text model for /api/transcribe */
export function getSttModel(): string {
  const explicit = envFirst("STT_MODEL");
  if (explicit) return explicit;
  return "whisper-1";
}

/**
 * response_format json_object — у официального OpenAI по умолчанию.
 * У прокси (xinghu и т.п.) часто не работает — тогда только промпт «JSON only».
 */
export function shouldUseJsonResponseFormat(): boolean {
  const flag = envFirst("LLM_JSON_FORMAT");
  if (flag === "true") return true;
  if (flag === "false") return false;
  return !getLlmBaseUrl();
}

export async function createLlmChatCompletion(
  client: OpenAI,
  params: Omit<ChatCompletionCreateParamsNonStreaming, "model"> & { model?: string },
) {
  const { model: modelOverride, ...rest } = params;
  const model = modelOverride ?? getLlmModel();

  return client.chat.completions.create({
    ...rest,
    model,
    ...(shouldUseJsonResponseFormat()
      ? { response_format: { type: "json_object" as const } }
      : {}),
  });
}

export function getPlainTextLlmClient(): OpenAI | null {
  const apiKey = getLlmApiKey();
  if (!apiKey) return null;

  const baseURL = getLlmBaseUrl();
  return new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    timeout: 25_000,
    maxRetries: 0,
  });
}

/** Чат помощи / monthly-chat — только plain text, без json_object */
export async function createPlainTextChatCompletion(
  client: OpenAI,
  params: Omit<ChatCompletionCreateParamsNonStreaming, "model"> & { model?: string },
) {
  const { model: modelOverride, ...rest } = params;
  const model = modelOverride ?? getLlmModel();

  return client.chat.completions.create({
    ...rest,
    model,
  });
}

/** Ответ модели: текст или поле reply/answer/message в JSON */
export function extractPlainTextFromLlmContent(content: string | null | undefined): string {
  const trimmed = content?.trim() ?? "";
  if (!trimmed) return "";

  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return trimmed;
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    for (const key of ["reply", "answer", "text", "message", "content"]) {
      const v = parsed[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  } catch {
    /* not json */
  }

  return trimmed;
}

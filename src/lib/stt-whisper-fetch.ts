import { cleanTranscript } from "@/lib/transcript-guard";
import type { SttProvider } from "@/lib/stt-providers";
import { groqSttModelFallbacks } from "@/lib/stt-providers";

async function transcribeWhisperFetchOnce(
  provider: SttProvider,
  model: string,
  file: File,
  locale: string,
  timeoutMs: number,
): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("model", model);
  form.append("language", locale === "en" ? "en" : "ru");
  form.append("response_format", "json");
  form.append("temperature", "0");
  form.append(
    "prompt",
    locale === "en"
      ? "Personal finance: spent, bought, salary, lunch."
      : "Личные финансы: потратил, купил, зарплата, обед.",
  );

  const url = `${provider.baseUrl.replace(/\/$/, "")}/audio/transcriptions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      body: form,
      signal: controller.signal,
    });

    let json: { text?: string; error?: { message?: string } | string } = {};
    try {
      json = (await res.json()) as typeof json;
    } catch {
      /* empty */
    }

    if (!res.ok) {
      const msg =
        typeof json.error === "string"
          ? json.error
          : json.error?.message ?? `http_${res.status}`;
      throw new Error(`${provider.id}:${msg}`);
    }

    return cleanTranscript(json.text ?? "");
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("stt_timeout");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function transcribeWhisperFetch(
  provider: SttProvider,
  file: File,
  locale: string,
  timeoutMs: number,
): Promise<string> {
  const models =
    provider.id === "groq"
      ? groqSttModelFallbacks(provider.model)
      : [provider.model];

  let lastError = "";
  for (const model of models) {
    try {
      return await transcribeWhisperFetchOnce(provider, model, file, locale, timeoutMs);
    } catch (e) {
      lastError = e instanceof Error ? e.message.slice(0, 220) : "error";
      const retryable =
        lastError.includes("404") ||
        lastError.includes("model") ||
        lastError.includes("decommissioned") ||
        lastError.includes("not found") ||
        lastError.includes("413") ||
        lastError.includes("too large");
      if (!retryable || model === models[models.length - 1]) {
        throw new Error(lastError);
      }
    }
  }
  throw new Error(lastError || "all_models_failed");
}

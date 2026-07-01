import type OpenAI from "openai";
import type { OpenAI as OpenAIType } from "openai";
import { telegramVoiceToWavFile } from "@/lib/audio/telegram-ogg-to-wav";
import { cleanTranscript, isGarbageTranscript } from "@/lib/transcript-guard";
import {
  getSttProviders,
  getTelegramSttProviders,
  listSttProviderIds,
} from "@/lib/stt-providers";
import { transcribeWhisperFetch } from "@/lib/stt-whisper-fetch";
import { getLlmBaseUrl, getLlmClient, getLlmModel, getSttClient, getSttModel, isLlmConfigured } from "@/lib/llm";

export { listSttProviderIds };

function envFirst(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function getAudioChatModel(): string {
  return envFirst("AUDIO_MODEL", "STT_CHAT_MODEL", "LLM_MODEL") ?? getLlmModel();
}

function audioFormat(mime: string, filename: string): "webm" | "mp4" | "wav" | "ogg" {
  const hint = `${mime} ${filename}`.toLowerCase();
  if (hint.includes("wav")) return "wav";
  if (hint.includes("mp4") || hint.includes("m4a") || hint.includes("aac") || hint.includes("3gp")) {
    return "mp4";
  }
  if (hint.includes("mpeg") || hint.includes("mp3")) return "mp4";
  if (hint.includes("ogg")) return "ogg";
  return "webm";
}

function wrapAudioFile(audio: File, ext: "webm" | "m4a" | "ogg" | "mp4"): File {
  const fileExt = ext === "mp4" ? "m4a" : ext;
  const type =
    ext === "m4a" || ext === "mp4" ? "audio/mp4" : ext === "ogg" ? "audio/ogg" : "audio/webm";
  return new File([audio], `voice.${fileExt}`, { type });
}

async function transcribeWhisper(
  client: OpenAIType,
  audio: File,
  locale: string,
  withLanguage: boolean,
): Promise<string> {
  const language = locale === "en" ? "en" : "ru";
  const prompt =
    locale === "en"
      ? "Personal finance: spent, bought, salary, lunch, groceries."
      : "Личные финансы: потратил, купил, зарплата, обед, продукты.";

  const stt = await client.audio.transcriptions.create({
    model: getSttModel(),
    file: audio,
    ...(withLanguage ? { language } : {}),
    response_format: "json",
    prompt,
  });
  return cleanTranscript(stt.text ?? "");
}

async function transcribeViaChat(
  client: OpenAIType,
  audio: File,
  locale: string,
  format: "webm" | "mp4" | "wav" | "ogg",
): Promise<string> {
  const buffer = Buffer.from(await audio.arrayBuffer());
  if (buffer.length < 32) return "";

  const base64 = buffer.toString("base64");
  const prompt =
    locale === "en"
      ? "Transcribe the voice message. Reply with ONLY the spoken words."
      : "Распознай речь. Ответь ТОЛЬКО сказанной фразой, без пояснений.";

  const completion = await client.chat.completions.create({
    model: getAudioChatModel(),
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "input_audio", input_audio: { data: base64, format } },
        ] as unknown as string,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  return cleanTranscript(typeof raw === "string" ? raw : "");
}

export interface TranscribeResult {
  transcript: string;
  method?: string;
  lastError?: string;
}

function accept(transcript: string, method: string): TranscribeResult | null {
  if (transcript && !isGarbageTranscript(transcript)) {
    return { transcript, method };
  }
  return null;
}

export async function transcribeAudioFile(
  audio: File,
  locale: string,
): Promise<TranscribeResult> {
  if (audio.size < 64) {
    return { transcript: "", lastError: "audio_too_small" };
  }

  let lastError = "";
  const primaryFmt = audioFormat(audio.type || "", audio.name);
  const altFmt: "webm" | "mp4" = primaryFmt === "mp4" ? "webm" : "mp4";
  const altFile = wrapAudioFile(audio, altFmt);
  const providers = getSttProviders();
  const providerFiles =
    primaryFmt === "wav" || primaryFmt === "ogg"
      ? [audio]
      : [audio, altFile];

  for (const provider of providers) {
    for (const file of providerFiles) {
      const method = `${provider.id}-${file.name || primaryFmt}`;
      try {
        const transcript = await transcribeWhisperFetch(provider, file, locale, 12_000);
        const ok = accept(transcript, method);
        if (ok) return ok;
        if (transcript) lastError = "garbage_filtered";
      } catch (e) {
        lastError = e instanceof Error ? e.message.slice(0, 220) : "error";
      }
    }
  }

  if (!isLlmConfigured()) {
    return { transcript: "", lastError: lastError || "no_api_key" };
  }

  const client = getLlmClient();
  if (!client) return { transcript: "", lastError: lastError || "no_client" };

  const steps: Array<{ method: string; run: () => Promise<string> }> = [
    {
      method: "whisper",
      run: () => transcribeWhisper(client, audio, locale, true),
    },
    {
      method: "whisper-no-lang",
      run: () => transcribeWhisper(client, audio, locale, false),
    },
    {
      method: "whisper-alt-ext",
      run: () => transcribeWhisper(client, altFile, locale, true),
    },
    {
      method: "chat",
      run: () => transcribeViaChat(client, audio, locale, primaryFmt),
    },
    {
      method: "chat-alt",
      run: () => transcribeViaChat(client, altFile, locale, altFmt),
    },
  ];

  for (const step of steps) {
    try {
      const transcript = await step.run();
      const ok = accept(transcript, step.method);
      if (ok) return ok;
      if (transcript) lastError = "garbage_filtered";
    } catch (e) {
      lastError = e instanceof Error ? e.message.slice(0, 220) : "error";
    }
  }

  return { transcript: "", lastError: lastError || "all_failed" };
}

/** Голосовые Telegram: Groq / apinet / OpenAI Whisper (fetch). Без xinghu. */
export async function transcribeTelegramVoice(
  buffer: ArrayBuffer,
  locale: string,
  budgetMs = 45_000,
): Promise<TranscribeResult> {
  const providers = getTelegramSttProviders();
  if (providers.length === 0) {
    return { transcript: "", lastError: "no_stt_key" };
  }

  if (buffer.byteLength < 32) {
    return { transcript: "", lastError: "audio_too_small" };
  }

  const oggFile = new File([buffer], "voice.ogg", { type: "audio/ogg" });
  const wavFile = await telegramVoiceToWavFile(buffer);
  const files: File[] = wavFile ? [wavFile, oggFile] : [oggFile];

  let lastError = "";
  const started = Date.now();

  const tryFile = async (
    provider: (typeof providers)[0],
    file: File,
    timeoutMs: number,
  ): Promise<TranscribeResult> => {
    const method = `${provider.id}-${file.name}`;
    const transcript = await transcribeWhisperFetch(provider, file, locale, timeoutMs);
    if (transcript && !isGarbageTranscript(transcript)) {
      return { transcript, method };
    }
    if (transcript) throw new Error("garbage_filtered");
    throw new Error("empty_transcript");
  };

  for (const provider of providers) {
    const remaining = budgetMs - (Date.now() - started);
    if (remaining < 4_000) {
      lastError = lastError || "budget_exhausted";
      break;
    }

    const timeoutMs = Math.min(remaining, 38_000);

    if (provider.id === "groq" && files.length > 1) {
      const parallel = await Promise.allSettled(
        files.map((file) => tryFile(provider, file, timeoutMs)),
      );
      const ok = parallel.find(
        (r): r is PromiseFulfilledResult<TranscribeResult> => r.status === "fulfilled",
      );
      if (ok) return ok.value;
      for (const r of parallel) {
        if (r.status === "rejected") {
          const reason =
            r.reason instanceof Error ? r.reason.message.slice(0, 220) : "error";
          lastError = reason;
          console.warn("[stt/telegram] groq-parallel", reason, "bytes", buffer.byteLength);
        }
      }
      continue;
    }

    for (const file of files) {
      const left = budgetMs - (Date.now() - started);
      if (left < 4_000) {
        lastError = lastError || "budget_exhausted";
        break;
      }

      const method = `${provider.id}-${file.name}`;
      try {
        return await tryFile(provider, file, Math.min(left, 38_000));
      } catch (e) {
        lastError = e instanceof Error ? e.message.slice(0, 220) : "error";
        console.warn("[stt/telegram]", method, lastError, "bytes", buffer.byteLength);
      }
    }
  }

  if (isLlmConfigured()) {
    const client = getLlmClient();
    const fallbackFile = wavFile ?? oggFile;
    if (client) {
      try {
        const transcript = await transcribeViaChat(
          client,
          fallbackFile,
          locale,
          fallbackFile.name.endsWith(".wav") ? "wav" : "ogg",
        );
        if (transcript && !isGarbageTranscript(transcript)) {
          return { transcript, method: "llm-audio-fallback" };
        }
        if (transcript) lastError = "garbage_filtered";
      } catch (e) {
        lastError = e instanceof Error ? e.message.slice(0, 220) : "error";
        console.warn("[stt/telegram] llm-fallback", lastError);
      }
    }
  }

  return { transcript: "", lastError: lastError || "all_failed" };
}

export function isProxyStt(): boolean {
  return Boolean(getLlmBaseUrl());
}

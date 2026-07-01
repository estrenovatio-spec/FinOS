import type { Locale } from "@/types";
import { fetchWithRetry } from "@/lib/fetch-retry";
import { cleanTranscript } from "@/lib/transcript-guard";

type TranscribeError = "stt_not_configured" | "stt_failed";

const STT_MS = 28_000;
export const VOICE_BROWSER_URL = "https://voicebudget.vercel.app/";

function extensionForFile(file: File): string {
  const hint = `${file.type} ${file.name}`.toLowerCase();
  if (hint.includes("wav")) return "wav";
  if (hint.includes("mp4") || hint.includes("m4a") || hint.includes("aac") || hint.includes("3gp")) {
    return "m4a";
  }
  if (hint.includes("ogg")) return "ogg";
  if (hint.includes("mpeg") || hint.includes("mp3")) return "mp3";
  return "webm";
}

export async function transcribeUserAudioFile(
  file: File | Blob,
  locale: Locale,
  filename = "voice.webm",
): Promise<{ text: string; error?: TranscribeError }> {
  const blob = file instanceof File ? file : file;
  const type = blob.type || "audio/webm";
  const ext = file instanceof File ? extensionForFile(file) : extensionForFile(new File([blob], filename, { type }));
  const name = filename.includes(".") ? filename : `voice.${ext}`;

  const form = new FormData();
  form.append("audio", new File([blob], name, { type }));
  form.append("locale", locale);

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), STT_MS);

  try {
    const url = `${window.location.origin}/api/transcribe`;
    const res = await fetchWithRetry(url, {
      method: "POST",
      body: form,
      signal: controller.signal,
      credentials: "same-origin",
    });

    let json: {
      success?: boolean;
      transcript?: string;
      error?: string;
      lastError?: string;
    } = {};
    try {
      json = (await res.json()) as typeof json;
    } catch {
      /* empty */
    }

    const cleaned = cleanTranscript(json.transcript?.trim() ?? "");
    if (res.ok && json.success && cleaned) {
      return { text: cleaned };
    }
    if (res.status === 503 && json.error === "stt_not_configured") {
      return { text: "", error: "stt_not_configured" };
    }
    return { text: "", error: "stt_failed" };
  } catch {
    return { text: "", error: "stt_failed" };
  } finally {
    window.clearTimeout(timer);
  }
}

export async function copyVoiceBrowserLink(): Promise<boolean> {
  const url = VOICE_BROWSER_URL;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch {
    /* fallback below */
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = url;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** В Telegram openLink на свой домен не выходит наружу — intent + копирование ссылки */
export async function openVoiceInExternalBrowser(): Promise<"chrome_intent" | "copied" | "failed"> {
  const url = VOICE_BROWSER_URL;

  if (/android/i.test(navigator.userAgent)) {
    try {
      const intent = `intent://voicebudget.vercel.app/#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
      window.location.href = intent;
      return "chrome_intent";
    } catch {
      /* continue to copy */
    }
  }

  const copied = await copyVoiceBrowserLink();
  return copied ? "copied" : "failed";
}

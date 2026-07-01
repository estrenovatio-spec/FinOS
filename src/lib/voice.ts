/**
 * Одна кнопка: запись → серверный STT → ИИ разбирает сумму и категорию.
 */
import { fallbackParseMany, splitTranscriptClauses, detectType } from "@/lib/ai";
import { refineParsedTransaction, sanitizeCategories } from "@/lib/categories";
import {
  applyDetectedOwner,
  applyDetectedOwnersWithCarry,
  normalizeOwnerDetectOptions,
} from "@/lib/detect-owner";
import { hasPartnerBudget } from "@/lib/owner-labels";
import { fetchWithRetry } from "@/lib/fetch-retry";
import { cleanTranscript, isGarbageTranscript } from "@/lib/transcript-guard";
import { transcribeUserAudioFile } from "@/lib/voice-transcribe-client";
import {
  canUseWavCapture,
  createWavCaptureAsync,
  minWavBytes,
  type WavCapture,
} from "@/lib/wav-capture";
import type { DictKey } from "@/lib/i18n";
import { detectAppLocale, inferParseLocale } from "@/lib/locale-infer";
import type { CategoryDefinition, Locale, ParsedTransaction } from "@/types";

const MIC_ASK_MS = 12_000;
const MIN_RECORD_MS = 800;
const MOBILE_MIC_IDLE_MS = 45 * 60_000;
const MIC_PERMISSION_CACHE_KEY = "voicebudget-mic-permission-ok-at";
const CAPTURE_START_MS = 5_000;
const CAPTURE_STOP_MS = 18_000;

export type VoiceErrorCode =
  | "insecure"
  | "unavailable"
  | "mic_denied"
  | "mic_timeout"
  | "too_short"
  | "record_failed"
  | "recorder_start_failed"
  | "stt_not_configured"
  | "stt_failed"
  | "no_speech";

type LevelMeter = {
  getLevel: () => number;
  stop: () => void;
};

type ActiveSession = {
  stream: MediaStream;
  recorder: MediaRecorder;
  chunks: BlobPart[];
  mime: string;
  startedAt: number;
  getLevel: () => number;
  stopMeter: () => void;
};

function attachLevelMeter(stream: MediaStream): LevelMeter {
  const noop: LevelMeter = { getLevel: () => 0, stop: () => {} };
  if (typeof window === "undefined") return noop;

  const Ctx =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return noop;

  let audioContext: AudioContext | null = null;
  try {
    audioContext = new Ctx();
  } catch {
    return noop;
  }

  let source: MediaStreamAudioSourceNode;
  let analyser: AnalyserNode;
  try {
    source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;
    source.connect(analyser);
  } catch {
    void audioContext.close();
    return noop;
  }

  const buf = new Uint8Array(analyser.fftSize);
  void audioContext.resume();

  return {
    getLevel: () => {
      if (!audioContext) return 0;
      if (audioContext.state === "suspended") void audioContext.resume();
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const n = (buf[i] - 128) / 128;
        sum += n * n;
      }
      return Math.min(1, Math.sqrt(sum / buf.length) * 5.5);
    },
    stop: () => {
      try {
        source.disconnect();
        analyser.disconnect();
      } catch {
        /* ignore */
      }
      const ctx = audioContext;
      audioContext = null;
      void ctx?.close();
    },
  };
}

type WavSession = {
  mode: "wav";
  stream: MediaStream;
  wav: WavCapture;
  getLevel: () => number;
  startedAt: number;
};

type RecorderSession = ActiveSession & { mode: "recorder" };

type SpeechSession = {
  mode: "speech";
  recognition: SpeechRecognition;
  startedAt: number;
  transcript: string;
  interim: string;
  error?: VoiceErrorCode;
  stopped: boolean;
  getLevel: () => number;
};

type VoiceSession = WavSession | RecorderSession | SpeechSession;

let session: VoiceSession | null = null;
let cachedMobileStream: MediaStream | null = null;
let cachedMobileStreamTimer: number | null = null;
let micPermissionState: PermissionState | "unknown" = "unknown";

function isMobileUa(): boolean {
  return typeof navigator !== "undefined" && /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isAndroidUa(): boolean {
  return typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
}

function isIosUa(): boolean {
  return (
    typeof navigator !== "undefined" &&
    (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1))
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function clearCachedMobileStreamTimer(): void {
  if (cachedMobileStreamTimer !== null) {
    window.clearTimeout(cachedMobileStreamTimer);
    cachedMobileStreamTimer = null;
  }
}

function rememberMicPermission(): void {
  micPermissionState = "granted";
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MIC_PERMISSION_CACHE_KEY, String(Date.now()));
}

async function queryMicPermissionState(): Promise<PermissionState | "unknown"> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return micPermissionState;
  }
  try {
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    micPermissionState = status.state;
    status.onchange = () => {
      micPermissionState = status.state;
      if (status.state === "granted") rememberMicPermission();
    };
    return status.state;
  } catch {
    return micPermissionState;
  }
}

function isLiveStream(stream: MediaStream | null): stream is MediaStream {
  return Boolean(stream?.getAudioTracks().some((track) => track.readyState === "live"));
}

function stopStream(stream: MediaStream): void {
  stream.getTracks().forEach((t) => {
    try {
      t.stop();
    } catch {
      /* ignore */
    }
  });
  if (stream === cachedMobileStream) {
    cachedMobileStream = null;
    clearCachedMobileStreamTimer();
  }
}

function releaseMobileStreamAfterIdle(stream: MediaStream): void {
  if (!isMobileUa()) {
    stopStream(stream);
    return;
  }
  cachedMobileStream = stream;
  clearCachedMobileStreamTimer();
  cachedMobileStreamTimer = window.setTimeout(() => {
    if (cachedMobileStream === stream && !session) stopStream(stream);
  }, MOBILE_MIC_IDLE_MS);
}

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const order = isMobileUa()
    ? ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];
  for (const type of order) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function canUseSpeechRecognition(): boolean {
  return Boolean(getSpeechRecognitionCtor());
}

export function canUseVoiceInput(): boolean {
  if (typeof window === "undefined") return false;
  if (!window.isSecureContext) return false;
  return (
    canUseSpeechRecognition() ||
    (Boolean(navigator.mediaDevices?.getUserMedia) &&
      (typeof MediaRecorder !== "undefined" || canUseWavCapture()))
  );
}

export function isVoiceRecording(): boolean {
  return session !== null;
}

export function getVoiceInputLevel(): number {
  if (!session) return 0;
  try {
    return session.getLevel();
  } catch {
    return 0;
  }
}

export function getVoiceMinRecordMs(): number {
  return MIN_RECORD_MS;
}

export async function cancelVoiceRecording(): Promise<void> {
  const s = session;
  session = null;
  if (!s) return;
  if (s.mode === "speech") {
    s.stopped = true;
    try {
      s.recognition.abort();
    } catch {
      /* ignore */
    }
    return;
  }
  if (s.mode === "wav") {
    s.wav.dispose();
  } else {
    s.stopMeter();
    try {
      if (s.recorder.state === "recording") s.recorder.stop();
    } catch {
      /* ignore */
    }
  }
  stopStream(s.stream);
}

function speechLang(locale: Locale): string {
  return locale === "en" ? "en-US" : "ru-RU";
}

function normalizeSpeechCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function appendUniqueSpeechPart(parts: string[], next: string): void {
  const clean = next.trim();
  if (!clean) return;
  const normalizedNext = normalizeSpeechCompare(clean);
  const prev = parts.at(-1);
  if (prev && normalizeSpeechCompare(prev) === normalizedNext) return;
  const all = normalizeSpeechCompare(parts.join(" "));
  if (all.endsWith(normalizedNext)) return;
  parts.push(clean);
}

function collapseRepeatedSpeechText(text: string): string {
  const words = text
    .replace(/\b(\d{2,5})\1\b/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (words.length === 0) return "";

  const compact: string[] = [];
  for (const word of words) {
    const prev = compact.at(-1);
    if (prev && normalizeSpeechCompare(prev) === normalizeSpeechCompare(word)) continue;
    compact.push(word);
  }

  for (let size = Math.floor(compact.length / 2); size >= 2; size--) {
    for (let i = 0; i + size * 2 <= compact.length; i++) {
      const left = normalizeSpeechCompare(compact.slice(i, i + size).join(" "));
      const right = normalizeSpeechCompare(compact.slice(i + size, i + size * 2).join(" "));
      if (left !== right) continue;
      compact.splice(i + size, size);
      i = Math.max(-1, i - size);
    }
  }

  return compact.join(" ");
}

function finalSpeechText(finalText: string, interimText: string): string {
  const finalClean = finalText.trim();
  const interimClean = interimText.trim();
  if (!finalClean) return collapseRepeatedSpeechText(interimClean);
  if (!interimClean) return collapseRepeatedSpeechText(finalClean);

  const finalNorm = normalizeSpeechCompare(finalClean);
  const interimNorm = normalizeSpeechCompare(interimClean);
  if (finalNorm.includes(interimNorm) || interimNorm.includes(finalNorm)) {
    return collapseRepeatedSpeechText(interimClean.length > finalClean.length ? interimClean : finalClean);
  }
  return collapseRepeatedSpeechText(`${finalClean} ${interimClean}`);
}

async function createSpeechSession(locale: Locale): Promise<SpeechSession | null> {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  const finalParts: string[] = [];
  const speechSession: SpeechSession = {
    mode: "speech",
    recognition,
    startedAt: Date.now(),
    transcript: "",
    interim: "",
    stopped: false,
    getLevel: () => 0,
  };

  recognition.lang = speechLang(locale);
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    const start = Math.max(0, event.resultIndex ?? 0);
    let interimText = "";
    for (let i = start; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0]?.transcript?.trim();
      if (!text) continue;
      if (result.isFinal) appendUniqueSpeechPart(finalParts, text);
      else interimText += ` ${text}`;
    }
    speechSession.transcript = finalParts.join(" ");
    speechSession.interim = interimText.trim();
    if (speechSession.transcript || speechSession.interim) {
      console.warn("[voice] recognition result received");
    }
  };
  recognition.onerror = (event) => {
    console.warn("[voice] microphone permission error", event.error);
    speechSession.error =
      event.error === "no-speech" || event.error === "audio-capture"
        ? "no_speech"
        : event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "mic_denied"
          : "record_failed";
  };
  recognition.onend = () => {
    speechSession.stopped = true;
  };

  try {
    recognition.start();
  } catch {
    return null;
  }

  return speechSession;
}

async function openMicStream(): Promise<MediaStream> {
  clearCachedMobileStreamTimer();
  if (isMobileUa() && isLiveStream(cachedMobileStream)) {
    return cachedMobileStream;
  }

  const permission = await queryMicPermissionState();
  if (permission === "denied") {
    throw new Error("mic_denied");
  }

  const ask = (constraints: MediaStreamConstraints) =>
    Promise.race([
      navigator.mediaDevices.getUserMedia(constraints),
      new Promise<MediaStream>((_, reject) => {
        window.setTimeout(() => reject(new Error("mic_timeout")), MIC_ASK_MS);
      }),
    ]);
  const isPermissionError = (error: unknown) => {
    if (
      typeof DOMException !== "undefined" &&
      error instanceof DOMException
    ) {
      return error.name === "NotAllowedError" || error.name === "SecurityError";
    }
    return (
      error instanceof Error &&
      (error.name === "NotAllowedError" || error.name === "SecurityError")
    );
  };

  // На телефоне — простой запрос без обработки (AGC иногда глушит WebView)
  if (isMobileUa()) {
    try {
      const stream = await ask({ audio: true });
      rememberMicPermission();
      return stream;
    } catch (error) {
      if (isPermissionError(error)) throw new Error("mic_denied");
      const stream = await ask({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      rememberMicPermission();
      return stream;
    }
  }

  try {
    const stream = await ask({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    rememberMicPermission();
    return stream;
  } catch (error) {
    if (isPermissionError(error)) throw new Error("mic_denied");
    const stream = await ask({ audio: true });
    rememberMicPermission();
    return stream;
  }
}

function createRecorder(stream: MediaStream): MediaRecorder {
  const mime = pickMimeType();
  if (mime) {
    try {
      return new MediaRecorder(stream, { mimeType: mime });
    } catch {
      /* fallback */
    }
  }
  return new MediaRecorder(stream);
}

async function createWavSession(stream: MediaStream): Promise<WavSession | null> {
  if (!canUseWavCapture()) return null;
  const wav = await withTimeout(
    createWavCaptureAsync(stream),
    CAPTURE_START_MS,
    "wav_start_timeout",
  ).catch(() => null);
  if (!wav) return null;
  return {
    mode: "wav",
    stream,
    wav,
    getLevel: wav.getLevel,
    startedAt: Date.now(),
  };
}

async function waitRecorderStart(recorder: MediaRecorder): Promise<void> {
  if (recorder.state === "recording") return;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let poll: number | null = null;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (poll !== null) window.clearInterval(poll);
      fn();
    };
    const timer = window.setTimeout(() => done(() => reject(new Error("start_timeout"))), 5_000);
    poll = window.setInterval(() => {
      if (recorder.state === "recording") done(() => resolve());
    }, 120);
    recorder.onstart = () => {
      done(() => resolve());
    };
    recorder.onerror = () => {
      done(() => reject(new Error("record_failed")));
    };
    try {
      recorder.start(isMobileUa() ? 500 : 400);
      if (recorder.state === "recording") done(() => resolve());
    } catch {
      done(() => reject(new Error("record_failed")));
    }
  });
}

export async function startVoiceRecording(
  locale: Locale,
): Promise<{ ok: boolean; error?: VoiceErrorCode }> {
  if (!canUseVoiceInput()) return { ok: false, error: "unavailable" };
  if (!window.isSecureContext) return { ok: false, error: "insecure" };

  await cancelVoiceRecording();

  if (canUseSpeechRecognition()) {
    const speechSession = await createSpeechSession(locale);
    if (speechSession) {
      session = speechSession;
      return { ok: true };
    }
    console.warn("[voice] SpeechRecognition unavailable");
  }

  try {
    const stream = await openMicStream();
    const track = stream.getAudioTracks()[0];
    if (!track || track.readyState !== "live") {
      stopStream(stream);
      return { ok: false, error: "mic_denied" };
    }

    rememberMicPermission();

    if (isAndroidUa() || (isMobileUa() && !isIosUa())) {
      const wavSession = await createWavSession(stream);
      if (wavSession) {
        session = wavSession;
        return { ok: true };
      }
    }

    const mime = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = createRecorder(stream);
    } catch {
      const wavSession = await createWavSession(stream);
      if (wavSession) {
        session = wavSession;
        return { ok: true };
      }
      stopStream(stream);
      return { ok: false, error: "recorder_start_failed" };
    }
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data?.size > 0) chunks.push(e.data);
    };

    const meter = attachLevelMeter(stream);

    session = {
      mode: "recorder",
      stream,
      recorder,
      chunks,
      mime,
      startedAt: Date.now(),
      getLevel: meter.getLevel,
      stopMeter: meter.stop,
    };

    try {
      await waitRecorderStart(recorder);
    } catch (e) {
      session = null;
      meter.stop();
      const wavSession = await createWavSession(stream);
      if (wavSession) {
        session = wavSession;
        return { ok: true };
      }
      stopStream(stream);
      throw e;
    }
    if (recorder.state !== "recording") {
      await cancelVoiceRecording();
      return { ok: false, error: "recorder_start_failed" };
    }

    return { ok: true };
  } catch (e) {
    await cancelVoiceRecording();
    const msg = e instanceof Error ? e.message : "";
    if (msg === "mic_timeout") return { ok: false, error: "mic_timeout" };
    if (msg === "record_failed" || msg === "start_timeout") {
      return { ok: false, error: "recorder_start_failed" };
    }
    return { ok: false, error: "mic_denied" };
  }
}

async function stopRecorderBlob(s: ActiveSession): Promise<Blob> {
  const { recorder, chunks, mime } = s;
  const minBytes = isMobileUa() ? 48 : 200;

  return new Promise((resolve, reject) => {
    const build = () => {
      const first = chunks[0];
      const chunkType = first instanceof Blob ? first.type : "";
      const type = mime || recorder.mimeType || chunkType || "audio/webm";
      return new Blob(chunks, { type });
    };

    const finish = () => {
      const b = build();
      if (b.size < minBytes) reject(new Error("too_short"));
      else resolve(b);
    };

    if (recorder.state === "inactive") {
      finish();
      return;
    }

    recorder.onstop = () => window.setTimeout(finish, isMobileUa() ? 400 : 250);
    recorder.onerror = () => reject(new Error("record_failed"));

    try {
      if (typeof recorder.requestData === "function") recorder.requestData();
      recorder.stop();
    } catch {
      reject(new Error("record_failed"));
    }
  });
}

async function stopSpeechSession(s: SpeechSession): Promise<string> {
  if (s.stopped) return cleanTranscript(finalSpeechText(s.transcript, s.interim));

  await new Promise<void>((resolve) => {
    const done = () => resolve();
    const timer = window.setTimeout(done, 1_800);
    const prevEnd = s.recognition.onend;
    s.recognition.onend = function onSpeechEnd(event) {
      window.clearTimeout(timer);
      prevEnd?.call(this, event);
      done();
    };
    try {
      s.recognition.stop();
    } catch {
      window.clearTimeout(timer);
      done();
    }
  });

  return cleanTranscript(finalSpeechText(s.transcript, s.interim));
}

export async function finalizeVoiceCapture(
  locale: Locale,
): Promise<{ text: string; error?: VoiceErrorCode }> {
  const s = session;
  if (!s) return { text: "", error: "unavailable" };

  session = null;

  if (s.mode === "speech") {
    const text = await stopSpeechSession(s);
    if (text && !isGarbageTranscript(text)) return { text };
    return { text: "", error: s.error ?? "no_speech" };
  }

  const tgLang =
    typeof window !== "undefined"
      ? window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code
      : undefined;
  const sttLocale = detectAppLocale(tgLang);

  let blob: Blob;
  if (s.mode === "wav") {
    try {
      blob = await withTimeout(s.wav.stop(), CAPTURE_STOP_MS, "wav_stop_timeout");
    } catch {
      releaseMobileStreamAfterIdle(s.stream);
      return { text: "", error: "record_failed" };
    }
    if (blob.size < minWavBytes()) {
      releaseMobileStreamAfterIdle(s.stream);
      return { text: "", error: "too_short" };
    }
  } else {
    s.stopMeter();
    try {
      blob = await withTimeout(stopRecorderBlob(s), CAPTURE_STOP_MS, "recorder_stop_timeout");
    } catch (e) {
      releaseMobileStreamAfterIdle(s.stream);
      const msg = e instanceof Error ? e.message : "";
      return { text: "", error: msg === "too_short" ? "too_short" : "record_failed" };
    }
  }

  releaseMobileStreamAfterIdle(s.stream);

  const isWav = s.mode === "wav" || blob.type.includes("wav");
  const file = new File([blob], isWav ? "voice.wav" : "voice.webm", {
    type: blob.type || (isWav ? "audio/wav" : "audio/webm"),
  });
  const server = await transcribeUserAudioFile(file, sttLocale);
  if (server.text) return server;
  return { text: "", error: server.error ?? "stt_failed" };
}

export type ParseVoiceOwnerContext = {
  partnerName?: string | null;
  partnerKeywords?: readonly string[];
  myName?: string | null;
  hasPartner?: boolean;
};

export async function parseVoiceTranscripts(
  transcript: string,
  locale: Locale,
  categories: CategoryDefinition[],
  ownerCtx?: ParseVoiceOwnerContext | string | null,
): Promise<{ items: ParsedTransaction[]; usedFallback: boolean } | null> {
  const text = cleanTranscript(transcript);
  if (!text || isGarbageTranscript(text)) return null;
  const parseLocale = inferParseLocale(text, locale);

  const mergedCategories = sanitizeCategories(categories);

  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 10_000);
    const res = await fetchWithRetry(`${window.location.origin}/api/parse-voice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        transcript: text,
        locale: parseLocale,
        categories: mergedCategories,
        partnerName:
          typeof ownerCtx === "string"
            ? ownerCtx
            : (ownerCtx?.partnerName ?? null),
        partnerKeywords:
          typeof ownerCtx === "string" ? undefined : ownerCtx?.partnerKeywords,
        myName: typeof ownerCtx === "string" ? null : (ownerCtx?.myName ?? null),
        hasPartner:
          typeof ownerCtx === "string" ? undefined : ownerCtx?.hasPartner,
      }),
      signal: controller.signal,
    });
    window.clearTimeout(timer);

    if (res.ok) {
      const json = (await res.json()) as {
        success?: boolean;
        data?: ParsedTransaction;
        items?: ParsedTransaction[];
        fallback?: boolean;
      };
      const rawItems = (json.items ?? (json.data ? [json.data] : [])).filter(
        (item) => item.amount > 0,
      );
      if (json.success && rawItems.length > 0) {
        const clauses = splitTranscriptClauses(text);
        const ownerOpts = normalizeOwnerDetectOptions(ownerCtx, parseLocale);
        if (ownerOpts.hasPartner === undefined) {
          ownerOpts.hasPartner = hasPartnerBudget(
          ownerOpts.partnerName,
          ownerOpts.partnerKeywords,
        );
        }
        const items = rawItems.map((item, index) => {
          const clause = clauses[index]?.trim() || item.note?.trim() || text;
          return applyDetectedOwner(
            refineParsedTransaction(
              item,
              clause,
              mergedCategories,
              detectType,
              parseLocale,
            ),
            clause,
            ownerOpts,
            "me",
          );
        });
        const carriedItems = applyDetectedOwnersWithCarry(
          items,
          items.map((item, index) => clauses[index]?.trim() || item.note?.trim() || text),
          ownerOpts,
          "me",
        );
        return {
          items: carriedItems,
          usedFallback: Boolean(json.fallback),
        };
      }
    }
  } catch {
    /* локальный разбор ниже */
  }

  const local = fallbackParseMany(text, parseLocale, mergedCategories);
  if (local.length > 0) {
    const ownerOpts = normalizeOwnerDetectOptions(
      typeof ownerCtx === "string" ? { partnerName: ownerCtx, locale } : { ...ownerCtx, locale },
      locale,
    );
    if (ownerOpts.hasPartner === undefined) {
      ownerOpts.hasPartner = hasPartnerBudget(
        ownerOpts.partnerName,
        ownerOpts.partnerKeywords,
      );
    }
    const clauses = splitTranscriptClauses(text);
    const itemClauses = local.map(
      (item, index) => clauses[index]?.trim() || item.note?.trim() || text,
    );
    const items = applyDetectedOwnersWithCarry(local, itemClauses, ownerOpts, "me");
    return { items, usedFallback: true };
  }
  return null;
}

export async function parseVoiceTranscript(
  transcript: string,
  locale: Locale,
  categories: CategoryDefinition[],
  ownerCtx?: ParseVoiceOwnerContext | string | null,
): Promise<{ data: ParsedTransaction; usedFallback: boolean } | null> {
  const parsed = await parseVoiceTranscripts(transcript, locale, categories, ownerCtx);
  if (!parsed?.items[0]) return null;
  return { data: parsed.items[0], usedFallback: parsed.usedFallback };
}

export function mapVoiceError(code: VoiceErrorCode | undefined): DictKey {
  switch (code) {
    case "insecure":
      return "voiceInsecure";
    case "mic_denied":
      return "micDenied";
    case "mic_timeout":
      return "voiceMicTimeout";
    case "too_short":
      return "voiceTooShort";
    case "recorder_start_failed":
    case "record_failed":
      return "voiceRecorderFailed";
    case "stt_not_configured":
      return "voiceSttUnavailable";
    case "stt_failed":
      return "voiceSttFailed";
    case "no_speech":
      return "voiceNoSpeech";
    default:
      return "voiceTryManual";
  }
}

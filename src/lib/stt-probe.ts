import { transcribeWhisperFetch } from "@/lib/stt-whisper-fetch";
import type { SttProvider } from "@/lib/stt-providers";

export type SttProbeResult = {
  id: string;
  ok: boolean;
  status: number;
  detail: string;
};

/** Короткий WAV для live-проверки Whisper (не /models). */
function makeProbeWavFile(): File {
  const sampleRate = 16_000;
  const numSamples = 4_800;
  const channels = 1;
  const bitsPerSample = 16;
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  return new File([buffer], "probe.wav", { type: "audio/wav" });
}

/** Проверка ключа Groq/OpenAI-совместимого API без аудиофайла */
export async function probeSttProvider(provider: SttProvider): Promise<SttProbeResult> {
  const base = provider.baseUrl.replace(/\/$/, "");
  const url = `${base}/models`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    let detail = `http_${res.status}`;
    try {
      const json = (await res.json()) as { error?: { message?: string } };
      if (json.error?.message) detail = json.error.message.slice(0, 160);
    } catch {
      /* ignore */
    }
    return {
      id: provider.id,
      ok: res.ok,
      status: res.status,
      detail,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 160) : "fetch_failed";
    return { id: provider.id, ok: false, status: 0, detail: msg };
  }
}

export async function probeAllSttProviders(
  providers: SttProvider[],
): Promise<SttProbeResult[]> {
  const results: SttProbeResult[] = [];
  for (const p of providers) {
    results.push(await probeSttProvider(p));
  }
  return results;
}

/** Реальный POST /audio/transcriptions (ключ + модель + формат). */
export async function probeSttTranscription(
  provider: SttProvider,
): Promise<SttProbeResult> {
  const file = makeProbeWavFile();
  try {
    const text = await transcribeWhisperFetch(provider, file, "ru", 28_000);
    return {
      id: `${provider.id}-audio`,
      ok: true,
      status: 200,
      detail: text ? `ok_len_${text.length}` : "ok_empty",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 160) : "transcribe_failed";
    return { id: `${provider.id}-audio`, ok: false, status: 0, detail: msg };
  }
}

export async function probeAllSttTranscriptions(
  providers: SttProvider[],
): Promise<SttProbeResult[]> {
  const groq = providers.find((p) => p.id === "groq");
  const targets = groq ? [groq] : providers.slice(0, 1);
  const results: SttProbeResult[] = [];
  for (const p of targets) {
    results.push(await probeSttTranscription(p));
  }
  return results;
}

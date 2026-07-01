/**
 * Live Groq/apinet Whisper test (needs .env.local GROQ_API_KEY).
 * Usage: node scripts/with-env-local.cjs node scripts/stt-live-test.mjs
 */
import { readFileSync } from "fs";
import wavefilePkg from "wavefile";
const { WaveFile } = wavefilePkg;

const groqKey = process.env.GROQ_API_KEY?.trim();
const model = process.env.GROQ_STT_MODEL?.trim() || "whisper-large-v3-turbo";

function makeSilentWav() {
  const wav = new WaveFile();
  const samples = new Float32Array(16_000); // 1s silence @ 16kHz
  wav.fromScratch(1, 16_000, "32f", [samples]);
  wav.toBitDepth("16");
  return Buffer.from(wav.toBuffer());
}

async function probeModels(baseUrl, key, label) {
  const res = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(12_000),
  });
  console.log(`[${label}] GET /models → ${res.status}`);
  return res.ok;
}

async function transcribe(baseUrl, key, label, file, filename, mime) {
  const form = new FormData();
  form.append("file", new Blob([file], { type: mime }), filename);
  form.append("model", model);
  form.append("language", "ru");
  form.append("response_format", "json");

  const url = `${baseUrl.replace(/\/$/, "")}/audio/transcriptions`;
  const started = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(45_000),
  });
  const ms = Date.now() - started;
  let json = {};
  try {
    json = await res.json();
  } catch {
    /* */
  }
  const text = json.text ?? "";
  const err =
    typeof json.error === "string"
      ? json.error
      : json.error?.message ?? `http_${res.status}`;
  console.log(
    `[${label}] POST ${filename} (${file.length} B) → ${res.status} in ${ms}ms`,
    res.ok ? `text="${String(text).slice(0, 80)}"` : `error=${err}`,
  );
  return res.ok;
}

async function main() {
  if (!groqKey) {
    console.error("GROQ_API_KEY missing");
    process.exit(1);
  }

  const wav = makeSilentWav();
  await probeModels("https://api.groq.com/openai/v1", groqKey, "groq");

  const oggOk = await transcribe(
    "https://api.groq.com/openai/v1",
    groqKey,
    "groq",
    wav,
    "voice.wav",
    "audio/wav",
  );

  // Tiny valid OGG header stub fails decode — skip unless we have a sample
  const samplePath = new URL("../test-fixtures/voice-sample.ogg", import.meta.url);
  try {
    const ogg = readFileSync(samplePath);
    await transcribe(
      "https://api.groq.com/openai/v1",
      groqKey,
      "groq-ogg",
      ogg,
      "voice.ogg",
      "audio/ogg",
    );
  } catch {
    console.log("[groq-ogg] no test-fixtures/voice-sample.ogg — skipped");
  }

  process.exit(oggOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

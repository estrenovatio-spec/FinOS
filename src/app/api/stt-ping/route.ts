import { NextResponse } from "next/server";
import { getLlmBaseUrl, getLlmModel, getSttModel, isLlmConfigured } from "@/lib/llm";
import { probeAllSttProviders, probeAllSttTranscriptions } from "@/lib/stt-probe";
import { getSttProviders, listSttProviderIds } from "@/lib/stt-providers";

export const dynamic = "force-dynamic";

export async function GET() {
  const providers = getSttProviders();
  const llm = isLlmConfigured();
  const probes = await probeAllSttProviders(providers);
  const audioProbes = await probeAllSttTranscriptions(providers);
  const anyProbeOk = probes.some((p) => p.ok);
  const groqProbe = probes.find((p) => p.id === "groq");
  const groqAudioProbe = audioProbes.find((p) => p.id === "groq-audio");
  const audioOk = audioProbes.some((p) => p.ok);

  if (providers.length === 0) {
    return NextResponse.json({
      ok: false,
      error: "no_stt_key",
      sttProviders: [],
      probes: [],
      hint:
        "На Vercel: GROQ_API_KEY (https://console.groq.com) или STT_API_KEY + STT_BASE_URL → Redeploy",
    });
  }

  const sttReady = anyProbeOk && (audioProbes.length === 0 || audioOk);

  return NextResponse.json({
    ok: sttReady,
    sttReady,
    sttProviders: listSttProviderIds(),
    probes,
    audioProbes,
    groqKeyValid: groqProbe?.ok ?? null,
    groqTranscribeOk: groqAudioProbe?.ok ?? null,
    llmConfigured: llm,
    baseUrl: getLlmBaseUrl() ?? "(openai direct)",
    sttModel: getSttModel(),
    llmModel: getLlmModel(),
    hint: !anyProbeOk
      ? groqProbe && !groqProbe.ok
        ? `Groq ключ на сервере не работает (${groqProbe.detail}). Создайте новый ключ на console.groq.com и обновите GROQ_API_KEY на Vercel.`
        : "STT ключ не прошёл проверку — обновите GROQ_API_KEY на Vercel и сделайте Redeploy."
      : groqAudioProbe && !groqAudioProbe.ok
        ? `Groq /models OK, но Whisper не отвечает: ${groqAudioProbe.detail}. Проверьте лимит или модель GROQ_STT_MODEL.`
        : "Groq Whisper отвечает. Голос в боте идёт через Groq (ogg+wav).",
  });
}

import { NextRequest, NextResponse } from "next/server";
import { isLlmConfigured } from "@/lib/llm";
import { transcribeAudioFile } from "@/lib/stt";
import type { Locale } from "@/types";

const TELEGRAM_ORIGIN_PATTERN = /\.telegram\.org$/;

function corsHeaders(origin: string | null): HeadersInit {
  const allowed =
    origin &&
    (origin === "https://web.telegram.org" || TELEGRAM_ORIGIN_PATTERN.test(new URL(origin).hostname));
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://web.telegram.org",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isLlmConfigured()) {
    return NextResponse.json(
      { error: "stt_not_configured" },
      { status: 503, headers: corsHeaders(origin) },
    );
  }

  try {
    const form = await request.formData();
    const audio = form.get("audio");
    const locale = String(form.get("locale") ?? "ru") as Locale;
    if (!(audio instanceof File)) {
      return NextResponse.json({ error: "audio_required" }, { status: 400, headers: corsHeaders(origin) });
    }

    const { transcript, method, lastError } = await transcribeAudioFile(audio, locale);
    if (!transcript) {
      console.warn("[transcribe] empty", {
        size: audio.size,
        type: audio.type || "(none)",
        locale,
        lastError,
      });
      return NextResponse.json(
        {
          error: "empty_transcript",
          size: audio.size,
          type: audio.type,
          lastError,
        },
        { status: 422, headers: corsHeaders(origin) },
      );
    }

    console.info("[transcribe] ok", {
      size: audio.size,
      type: audio.type || "(none)",
      locale,
      method,
    });
    return NextResponse.json({ success: true, transcript, method }, { headers: corsHeaders(origin) });
  } catch (error) {
    console.error("[transcribe] failed", error);
    return NextResponse.json(
      {
        error: "transcription_failed",
        message: error instanceof Error ? error.message : "unknown",
      },
      { status: 500, headers: corsHeaders(origin) },
    );
  }
}

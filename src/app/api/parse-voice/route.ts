import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDefaultCategories, sanitizeCategories } from "@/lib/categories";
import { parseTranscriptServerMany } from "@/lib/parse-voice-server";
import { inferParseLocale } from "@/lib/locale-infer";
import type { Locale } from "@/types";

const TELEGRAM_ORIGIN_PATTERN = /\.telegram\.org$/;

const categorySchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(["income", "expense"]),
  labels: z.object({ ru: z.string(), en: z.string() }),
  keywords: z.array(z.string().max(120)).max(400),
  isSystem: z.boolean().optional(),
});

const bodySchema = z.object({
  transcript: z.string().min(1),
  locale: z.enum(["ru", "en"]),
  partnerName: z.string().nullable().optional(),
  partnerKeywords: z.array(z.string().max(40)).max(40).optional(),
  myName: z.string().nullable().optional(),
  hasPartner: z.boolean().optional(),
  categories: z.array(categorySchema).max(80).optional(),
});

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

  try {
    const json: unknown = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400, headers: corsHeaders(origin) },
      );
    }

    const {
      transcript,
      locale,
      partnerName,
      partnerKeywords,
      myName,
      hasPartner,
      categories: clientCats,
    } = parsed.data;
    const parseLocale = inferParseLocale(transcript, locale as Locale);
    const categories = clientCats?.length
      ? sanitizeCategories(clientCats)
      : getDefaultCategories();

    const { items, fallback } = await parseTranscriptServerMany(
      transcript,
      parseLocale,
      categories,
      { partnerName, partnerKeywords, myName, hasPartner },
    );

    return NextResponse.json(
      {
        success: items.length > 0,
        data: items[0] ?? null,
        items,
        fallback,
      },
      { headers: corsHeaders(origin) },
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to parse transcript" },
      { status: 400, headers: corsHeaders(origin) },
    );
  }
}

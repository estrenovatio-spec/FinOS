import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createLlmChatCompletion,
  getLlmClient,
  isLlmConfigured,
} from "@/lib/llm";
import { extractJsonFromLlmContent } from "@/lib/llm-json";

const toneSchema = z.enum(["ok", "watch", "risk"]);

const spotlightSchema = z.object({
  title: z.string().min(2).max(80),
  text: z.string().min(5).max(500),
  action: z.string().min(3).max(260),
  tone: toneSchema,
});

const bodySchema = z.object({
  locale: z.enum(["ru", "en"]),
  spotlight: spotlightSchema,
  context: z.unknown().optional(),
});

type FamilyAdvisorInput = z.infer<typeof bodySchema>;
type FamilyAdvisorSpotlight = z.infer<typeof spotlightSchema>;

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function limitText(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  const slice = trimmed.slice(0, max - 1).trimEnd();
  const sentenceEnd = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
  );
  if (sentenceEnd > Math.floor(max * 0.45))
    return slice.slice(0, sentenceEnd + 1).trim();
  const wordEnd = slice.lastIndexOf(" ");
  if (wordEnd > Math.floor(max * 0.65))
    return `${slice.slice(0, wordEnd).trimEnd()}…`;
  return `${slice}…`;
}

function makeHumanFallback(
  spotlight: FamilyAdvisorSpotlight,
  locale: FamilyAdvisorInput["locale"],
): FamilyAdvisorSpotlight {
  const badLanguage =
    /свободн(ый|ого)? запас|запас периода|по операциям|денежн(ый|ого) поток|cash\s*flow|buffer for this period|периодный баланс|алгоритм|модель|ИИ/i;
  const cuttingBasics =
    /не добавлять|постав(ить|ьте).*пауз|сократ|урез|режь|откаж|cut|pause|stop/i;
  const protectedBasics =
    /ед[ауые]?|продукт|здоров|аптек|лекар|врач|дет|реб|сад|школ|обуч|образован|жкх|аренд|кварт|коммун|транспорт|бензин|проезд|долг|кредит|налог|интернет|телефон|food|grocery|health|medical|child|school|education|rent|utilities|transport|fuel|debt|loan|tax|internet|phone/i;
  const joined = `${spotlight.title} ${spotlight.text} ${spotlight.action}`;
  if (!badLanguage.test(joined) && !(cuttingBasics.test(joined) && protectedBasics.test(joined))) {
    return spotlight;
  }

  if (locale === "en") {
    return {
      ...spotlight,
      title: "Check the next payments",
      text: "Some spending needs planning, not harsh cuts. First separate required payments from flexible purchases.",
      action: "Open the last few entries and mark what is required, one-off, or better planned next month.",
    };
  }

  return {
    ...spotlight,
    title: "Проверьте ближайшие платежи",
    text: "Здесь нужна не жёсткая экономия, а порядок. Сначала отделите обязательные траты от покупок, которые можно спокойно перенести.",
    action: "Откройте последние операции и отметьте: что обязательно, что разовое, а что лучше заранее заложить в план.",
  };
}

function normalizeTone(
  value: unknown,
  fallback: FamilyAdvisorSpotlight["tone"],
): FamilyAdvisorSpotlight["tone"] {
  const tone = stringValue(value).toLowerCase();
  if (tone === "risk" || tone === "danger" || tone === "critical")
    return "risk";
  if (
    tone === "watch" ||
    tone === "warn" ||
    tone === "warning" ||
    tone === "caution"
  )
    return "watch";
  if (tone === "ok" || tone === "good" || tone === "normal") return "ok";
  return fallback;
}

function normalizeSpotlight(
  raw: unknown,
  input: FamilyAdvisorInput,
): FamilyAdvisorSpotlight {
  const fallback = input.spotlight;
  const object =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return makeHumanFallback({
    title: limitText(
      stringValue(object.title) ||
        stringValue(object.heading) ||
        fallback.title,
      80,
    ),
    text: limitText(
      stringValue(object.text) ||
        stringValue(object.summary) ||
        stringValue(object.message) ||
        fallback.text,
      500,
    ),
    action: limitText(
      stringValue(object.action) ||
        stringValue(object.nextStep) ||
        stringValue(object.recommendation) ||
        fallback.action,
      260,
    ),
    tone: normalizeTone(object.tone, fallback.tone),
  }, input.locale);
}

function familyAdvisorPrompt(input: FamilyAdvisorInput): string {
  return `
You are a family financial advisor inside a budget app.
Rewrite the rule-based signal into very simple human language and add ONE small action.

Rules:
- Use ONLY the facts from the provided signal and context.
- Do not invent balances, income, categories, debts, goals, or risks.
- Write so a 10-year-old can understand: short words, no financial jargon.
- No jargon, no shame, no fear, no consultant language.
- Forbidden phrases in Russian: "свободный запас", "запас периода", "по операциям", "денежный поток", "кассовый разрыв" unless the user is in business context.
- Never suggest cutting groceries/food, health, children, education, debt minimum payments, rent, utilities, transport, internet, phone, taxes, or mandatory bills.
- For basics, suggest planning/checking/listing/setting aside money, not cutting or pausing.
- Do not mention AI, model, algorithm, or "I noticed from data".
- title <= 60 characters, text <= 260 characters, action <= 180 characters.
- Language: ${input.locale === "ru" ? "Russian" : "English"}.
- Return JSON only: { "title": string, "text": string, "action": string, "tone": "ok" | "watch" | "risk" }.

Rule-based signal:
${JSON.stringify(input.spotlight, null, 2)}

Compact context:
${JSON.stringify(input.context ?? {}, null, 2)}
`.trim();
}

export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json({ error: "bad_request" }, { status: 400 });

    if (!isLlmConfigured()) {
      return NextResponse.json({
        success: true,
        spotlight: parsed.data.spotlight,
        fallback: true,
      });
    }

    const openai = getLlmClient();
    if (!openai) {
      return NextResponse.json({
        success: true,
        spotlight: parsed.data.spotlight,
        fallback: true,
      });
    }

    try {
      const completion = await createLlmChatCompletion(openai, {
        messages: [
          {
            role: "system",
            content:
              'You rewrite family budget advice into simple, kind language. JSON only: { "title": string, "text": string, "action": string, "tone": "ok" | "watch" | "risk" }.',
          },
          { role: "user", content: familyAdvisorPrompt(parsed.data) },
        ],
        temperature: 0.35,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error("empty_family_advisor_response");
      const raw: unknown = extractJsonFromLlmContent(content);
      const normalized = normalizeSpotlight(raw, parsed.data);
      const validated = spotlightSchema.safeParse(normalized);
      if (!validated.success) throw new Error("invalid_family_advisor_json");

      return NextResponse.json({ success: true, spotlight: validated.data });
    } catch (error) {
      console.warn("[family-advisor fallback]", error);
      return NextResponse.json({
        success: true,
        spotlight: parsed.data.spotlight,
        fallback: true,
      });
    }
  } catch (error) {
    console.error("[family-advisor POST]", error);
    return NextResponse.json(
      { error: "family_advisor_failed" },
      { status: 500 },
    );
  }
}

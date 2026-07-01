import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createLlmChatCompletion, getLlmClient, isLlmConfigured } from "@/lib/llm";
import { extractJsonFromLlmContent } from "@/lib/llm-json";

const missionSchema = z.object({
  title: z.string().min(6).max(140),
  principle: z.string().min(10).max(220).optional(),
  detail: z.string().min(20).max(700),
  tone: z.enum(["focus", "save", "learn", "habit"]),
});

const bodySchema = z.object({
  locale: z.enum(["ru", "en"]),
  periodStart: z.string().min(8),
  periodEnd: z.string().min(8),
  transactionsCount: z.number().min(0),
  learnedRulesCount: z.number().min(0),
  context: z.unknown(),
  ruleMissions: z
    .array(
      z.object({
        title: z.string(),
        principle: z.string().optional(),
        detail: z.string(),
        tone: z.enum(["focus", "save", "learn", "habit"]),
      }),
    )
    .max(3),
});

function fallbackMission(input: z.infer<typeof bodySchema>) {
  return (
    input.ruleMissions[0] ?? {
      title: input.locale === "ru" ? "5 дней без пропусков" : "5 days without gaps",
      principle:
        input.locale === "ru"
          ? "Лучше записывать неидеально, чем бросить совсем."
          : "It is better to log imperfectly than to stop logging.",
      detail:
        input.locale === "ru"
          ? "Записывайте хотя бы одну операцию в день. Цель — не идеальный бюджет, а непрерывность и привычка."
          : "Record at least one entry per day. The goal is continuity and habit, not a perfect budget.",
      tone: "habit" as const,
    }
  );
}

function defaultPrinciple(locale: "ru" | "en", tone: z.infer<typeof missionSchema>["tone"]): string {
  if (locale !== "ru") {
    if (tone === "save") return "Savings grow when you add a little again and again.";
    if (tone === "learn") return "Correcting mistakes teaches the app your real money language.";
    if (tone === "focus") return "Pay what must be paid first. Decide on nice-to-have buys after that.";
    return "It is better to log imperfectly than to stop logging.";
  }
  if (tone === "save") return "Накопления растут, когда добавляешь понемногу, но регулярно.";
  if (tone === "learn") return "Исправления учат приложение вашему настоящему языку денег.";
  if (tone === "focus") return "Сначала оплатить то, без чего нельзя. Покупки «хочу» — после этого.";
  return "Лучше записывать неидеально, чем бросить совсем.";
}

const SENSITIVE_RE =
  /ед[ауые]?|продукт|здоров|аптек|лекар|врач|дет|реб|сад|школ|обуч|образован|жкх|аренд|кварт|коммун|транспорт|бензин|проезд|долг|кредит|налог|food|grocery|health|medical|child|school|education|rent|utilities|transport|fuel|debt|loan|tax/i;
const CUT_RE =
  /не трат|без новых трат|убрать|урезать|сократ|отказ|пропуст|one less|no new spending|skip|cut|reduce|stop spending/i;

function missionLooksUnsafe(mission: z.infer<typeof missionSchema>): boolean {
  const text = `${mission.title} ${mission.principle ?? ""} ${mission.detail}`;
  if (/ИИ|AI\b/i.test(text)) return true;
  return SENSITIVE_RE.test(text) && CUT_RE.test(text);
}

function withPrinciple(
  mission: z.infer<typeof missionSchema>,
  locale: "ru" | "en",
): z.infer<typeof missionSchema> & { principle: string } {
  return {
    ...mission,
    principle: mission.principle?.trim() || defaultPrinciple(locale, mission.tone),
  };
}

function safeMission(
  mission: z.infer<typeof missionSchema>,
  input: z.infer<typeof bodySchema>,
): z.infer<typeof missionSchema> & { principle: string } {
  if (missionLooksUnsafe(mission)) {
    return withPrinciple(fallbackMission(input), input.locale);
  }
  return withPrinciple(mission, input.locale);
}

function missionPrompt(input: z.infer<typeof bodySchema>): string {
  const isRu = input.locale === "ru";
  return `
You are a senior financial advisor with 20 years of practical family-finance experience.
Choose ONE weekly mission that builds financial literacy and a useful money habit.

Strict principles:
- The mission must teach ONE small financial-literacy rule through action.
- Include "principle": a simple rule a 10-year-old can understand. No jargon.
- No shame, no fear, no harsh austerity.
- Do not suggest cutting groceries/food, health, children, education, emergency, debt minimum payments, taxes, transport, utilities, rent, internet, phone, or mandatory bills.
- For groceries/food, suggest a shopping list, meal plan, checking impulse extras, or simply observing. Never say "skip food", "one less grocery check", or anything that sounds like eating less.
- For health, children, education, debt, taxes, and mandatory bills: mission must be planning/checking documents/payment dates/reserve. Never suggest cutting or pausing.
- For small average checks under 1000 RUB, prefer observation and tracking over cutting.
- If a sensitive category is visible, suggest planning, checking documents, splitting payments, insurance/tax deduction, or building reserve.
- The mission must be doable in 7 days and take 5-20 minutes or one small action.
- Prefer behavior change over generic advice.
- Use the user's own behavior: categories, repeated phrases, goals, limits, debts, cashflow risk, AI memory.
- Do not mention that you are an AI.
- Return JSON only: { "title": string, "principle": string, "detail": string, "tone": "focus" | "save" | "learn" | "habit" }.
- Language: ${isRu ? "Russian" : "English"}.

Good mission examples in Russian:
- "Разобрать один повторяющийся расход"
- "Проверить обязательный платёж"
- "Закрепить правило финансовой памяти"
- "Пополнить резерв малой суммой"

Good principle examples in Russian:
- "Сначала оплатить то, без чего нельзя. Покупки «хочу» — после этого."
- "Накопления растут, когда добавляешь понемногу, но регулярно."
- "Еду, здоровье, детей и счета сначала планируют, а не сокращают без разбора."
- "Лучше записывать неидеально, чем бросить совсем."

Period: ${input.periodStart} — ${input.periodEnd}
Transactions this week: ${input.transactionsCount}
Learned personal rules: ${input.learnedRulesCount}

Current rule-based candidates:
${JSON.stringify(input.ruleMissions, null, 2)}

User behavior context:
${JSON.stringify(input.context, null, 2)}
`.trim();
}

export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }

    if (!isLlmConfigured()) {
      return NextResponse.json({
        success: true,
        mission: safeMission(fallbackMission(parsed.data), parsed.data),
        fallback: true,
      });
    }

    const openai = getLlmClient();
    if (!openai) {
      return NextResponse.json({
        success: true,
        mission: safeMission(fallbackMission(parsed.data), parsed.data),
        fallback: true,
      });
    }

    try {
      const completion = await createLlmChatCompletion(openai, {
        messages: [
          {
            role: "system",
            content:
              'You choose one weekly financial habit mission. JSON only: { "title": string, "principle": string, "detail": string, "tone": "focus" | "save" | "learn" | "habit" }.',
          },
          { role: "user", content: missionPrompt(parsed.data) },
        ],
        temperature: 0.35,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error("empty_mission_response");

      const raw: unknown = extractJsonFromLlmContent(content);
      const validated = missionSchema.safeParse(raw);
      if (!validated.success) throw new Error("invalid_mission_json");

      return NextResponse.json({
        success: true,
        mission: safeMission(validated.data, parsed.data),
      });
    } catch (error) {
      console.warn("[weekly-mission fallback]", error);
      return NextResponse.json({
        success: true,
        mission: safeMission(fallbackMission(parsed.data), parsed.data),
        fallback: true,
      });
    }
  } catch (error) {
    console.error("[weekly-mission POST]", error);
    return NextResponse.json({ error: "weekly_mission_failed" }, { status: 500 });
  }
}

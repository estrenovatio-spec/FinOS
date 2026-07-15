import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createPlainTextChatCompletion,
  extractPlainTextFromLlmContent,
  getPlainTextLlmClient,
  isLlmConfigured,
} from "@/lib/llm";

export const maxDuration = 60;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

const cardSchema = z.object({
  label: z.string().min(1).max(100),
  value: z.string().min(1).max(200),
  note: z.string().min(1).max(400),
});

const bodySchema = z.object({
  locale: z.enum(["ru", "en"]),
  question: z.string().min(1).max(1000),
  messages: z.array(messageSchema).max(12).default([]),
  context: z.object({
    cards: z.array(cardSchema).max(8),
    periodNote: z.string().max(200).optional(),
    periodEndDate: z.string().optional(),
  }),
});

function systemPrompt(locale: "ru" | "en", cards: Array<{ label: string; value: string; note: string }>, periodNote?: string) {
  const contextLines = cards
    .map((card) => `- ${card.label}: ${card.value}. ${card.note}`)
    .join("\n");

  if (locale === "ru") {
    return [
      "Ты финансовый советник внутри FIN OS.",
      "Отвечай простым человеческим языком, без упоминаний модели, ИИ, алгоритмов и внутренних терминов.",
      "Опирайся только на переданный финансовый контекст.",
      "Если данных не хватает, честно скажи, чего именно не хватает.",
      "Давай короткий практичный ответ: сначала вывод, потом 2-4 пункта объяснения или следующего шага.",
      periodNote ? `Период: ${periodNote}` : "",
      "Контекст пользователя:",
      contextLines,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "You are the in-app financial advisor inside FIN OS.",
    "Use plain human language and do not mention AI, models, or internal system terms.",
    "Rely only on the provided financial context.",
    "If context is insufficient, clearly say what is missing.",
    "Keep the answer practical: first the conclusion, then 2-4 short points.",
    periodNote ? `Period: ${periodNote}` : "",
    "User context:",
    contextLines,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const json: unknown = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { locale, question, messages, context } = parsed.data;

    const fallbackReply =
      locale === "ru"
        ? "Сейчас не получилось получить ответ. Попробуйте ещё раз через минуту."
        : "Could not get an answer right now. Please try again in a minute.";

    if (!isLlmConfigured()) {
      return NextResponse.json({ success: true, reply: fallbackReply, fallback: true });
    }

    const client = getPlainTextLlmClient();
    if (!client) {
      return NextResponse.json({ success: true, reply: fallbackReply, fallback: true });
    }

    try {
      const completion = await createPlainTextChatCompletion(client, {
        messages: [
          {
            role: "system",
            content: systemPrompt(locale, context.cards, context.periodNote),
          },
          ...messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          {
            role: "user",
            content: question,
          },
        ],
        temperature: 0.4,
        max_tokens: 700,
      });

      const reply = extractPlainTextFromLlmContent(completion.choices[0]?.message?.content);
      if (!reply) {
        return NextResponse.json({ success: true, reply: fallbackReply, fallback: true });
      }

      return NextResponse.json({ success: true, reply });
    } catch (error) {
      console.warn("[advisor-question] llm fallback", {
        name: error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message : "unknown",
      });
      return NextResponse.json({ success: true, reply: fallbackReply, fallback: true });
    }
  } catch {
    return NextResponse.json({ error: "advisor_question_failed" }, { status: 500 });
  }
}

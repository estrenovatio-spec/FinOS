import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createPlainTextChatCompletion,
  extractPlainTextFromLlmContent,
  getSafeLlmConfigDebug,
  getPlainTextLlmClient,
  isLlmConfigured,
} from "@/lib/llm";
import { getAdvisorSystemPrompt } from "@/lib/ai/advisor-system-prompt";
import { resolveAdvisorModel } from "@/lib/ai/model-router";

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
  userPlan: z.enum(["free", "standard", "pro"]).default("free"),
  question: z.string().min(1).max(1000),
  messages: z.array(messageSchema).max(12).default([]),
  context: z.object({
    cards: z.array(cardSchema).max(8),
    periodNote: z.string().max(200).optional(),
    periodEndDate: z.string().optional(),
    questionGuide: z.string().max(4000).optional(),
  }),
});

export async function POST(request: NextRequest) {
  try {
    const json: unknown = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { locale, userPlan, question, messages, context } = parsed.data;

    const fallbackReply =
      locale === "ru"
        ? "Сейчас не получилось получить ответ. Попробуйте ещё раз через минуту."
        : "Could not get an answer right now. Please try again in a minute.";
    const llmDebug = getSafeLlmConfigDebug();

    if (!isLlmConfigured()) {
      console.warn("[advisor-question] llm missing config", llmDebug);
      return NextResponse.json({ success: true, reply: fallbackReply, fallback: true });
    }

    const client = getPlainTextLlmClient();
    if (!client) {
      console.warn("[advisor-question] llm client init failed", llmDebug);
      return NextResponse.json({ success: true, reply: fallbackReply, fallback: true });
    }

    try {
      console.info("[advisor-question] llm request", llmDebug);
      const completion = await createPlainTextChatCompletion(client, {
        model: resolveAdvisorModel(userPlan),
        messages: [
          {
            role: "system",
            content: getAdvisorSystemPrompt({
              locale,
              cards: context.cards,
              periodNote: context.periodNote,
              questionGuide: context.questionGuide,
            }),
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
        ...llmDebug,
        name: error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message : "unknown",
      });
      return NextResponse.json({ success: true, reply: fallbackReply, fallback: true });
    }
  } catch {
    return NextResponse.json({ error: "advisor_question_failed" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createPlainTextChatCompletion,
  extractPlainTextFromLlmContent,
  getSafeLlmConfigDebug,
  getPlainTextLlmClient,
  isLlmConfigured,
} from "@/lib/llm";
import {
  advisorQuestionRequestSchema,
  normalizeAdvisorQuestionRequestBody,
} from "@/lib/ai/advisor-contract";
import { getAdvisorSystemPrompt } from "@/lib/ai/advisor-system-prompt";
import { resolveAdvisorModel } from "@/lib/ai/model-router";

export const maxDuration = 60;

function listTopLevelKeys(input: unknown): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  return Object.keys(input as Record<string, unknown>).sort();
}

function sanitizeValidationIssues(issues: z.ZodIssue[]) {
  return issues.map((issue) => ({
    path: issue.path.join("."),
    code: issue.code,
    message: issue.message,
  }));
}

export async function POST(request: NextRequest) {
  try {
    const rawJson: unknown = await request.json();
    const json = normalizeAdvisorQuestionRequestBody(rawJson);
    const parsed = advisorQuestionRequestSchema.safeParse(json);
    if (!parsed.success) {
      const receivedFields = listTopLevelKeys(rawJson);
      const issues = sanitizeValidationIssues(parsed.error.issues);
      console.warn("[advisor-question] invalid_request", {
        receivedFields,
        issues,
      });
      return NextResponse.json(
        {
          error: "invalid_request",
          userMessage:
            "Не удалось отправить вопрос. Обновите страницу и попробуйте ещё раз.",
        },
        { status: 400 },
      );
    }

    const { locale, userPlan, question, messages, context } = parsed.data;

    const fallbackReply =
      locale === "ru"
        ? "Сейчас не получилось получить ответ. Попробуйте ещё раз через минуту."
        : "Could not get an answer right now. Please try again in a minute.";
    const llmDebug = getSafeLlmConfigDebug();

    if (!isLlmConfigured()) {
      console.warn("[advisor-question] llm missing config", llmDebug);
      return NextResponse.json({
        success: true,
        reply: fallbackReply,
        answer: fallbackReply,
        fallback: true,
      });
    }

    const client = getPlainTextLlmClient();
    if (!client) {
      console.warn("[advisor-question] llm client init failed", llmDebug);
      return NextResponse.json({
        success: true,
        reply: fallbackReply,
        answer: fallbackReply,
        fallback: true,
      });
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
        return NextResponse.json({
          success: true,
          reply: fallbackReply,
          answer: fallbackReply,
          fallback: true,
        });
      }

      return NextResponse.json({ success: true, reply, answer: reply });
    } catch (error) {
      console.warn("[advisor-question] llm fallback", {
        ...llmDebug,
        name: error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message : "unknown",
      });
      return NextResponse.json({
        success: true,
        reply: fallbackReply,
        answer: fallbackReply,
        fallback: true,
      });
    }
  } catch {
    return NextResponse.json({ error: "advisor_question_failed" }, { status: 500 });
  }
}

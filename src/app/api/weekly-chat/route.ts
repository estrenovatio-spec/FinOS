import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { AiCoachingContext } from "@/lib/ai-coaching-context";
import { createLlmChatCompletion, getLlmClient, isLlmConfigured } from "@/lib/llm";
import {
  buildLlmFallbackLog,
  classifyLlmError,
  extractReplyFromChatCompletion,
  logLlmFallback,
} from "@/lib/llm-diagnostics";
import {
  WEEKLY_CHAT_MAX_USER_MESSAGES,
  WEEKLY_CHAT_SYSTEM,
  WEEKLY_MIN_DAYS_TRACKED,
  WEEKLY_MIN_TRANSACTIONS,
  type WeeklySummary,
} from "@/lib/weekly-analysis";
import type { Locale } from "@/types";

const summarySchema = z.object({
  daysTracked: z.number(),
  transactionCount: z.number(),
  weekTransactionCount: z.number(),
  totalIncome: z.number(),
  totalExpense: z.number(),
  periodNet: z.number().optional(),
  goalAllocated: z.number().optional(),
  balance: z.number(),
  expenseByCategory: z.array(
    z.object({
      category: z.string(),
      amount: z.number(),
      sharePercent: z.number(),
    }),
  ),
  incomeByCategory: z.array(z.object({ category: z.string(), amount: z.number() })),
  monthlyExpenses: z.array(z.object({ month: z.string(), amount: z.number() })),
  categoryChanges: z
    .array(
      z.object({
        category: z.string(),
        currentAmount: z.number(),
        previousAmount: z.number(),
        deltaAmount: z.number(),
        deltaPercent: z.number().nullable(),
        currentCount: z.number(),
        previousCount: z.number(),
      }),
    )
    .optional()
    .default([]),
  firstDate: z.string().nullable(),
  lastDate: z.string().nullable(),
  currency: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
});

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

const coachingSchema = z
  .object({
    savingsGoals: z.array(z.unknown()),
    categoryBudgets: z.array(z.unknown()),
  })
  .passthrough();

const bodySchema = z.object({
  locale: z.enum(["ru", "en"]),
  summary: summarySchema,
  reportTips: z.array(z.string().min(1)).min(1).max(10),
  messages: z.array(messageSchema).max(WEEKLY_CHAT_MAX_USER_MESSAGES * 2),
  question: z.string().min(1).max(1000),
  coaching: coachingSchema.optional(),
});

export async function POST(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    const json: unknown = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { locale, summary, reportTips, messages, question, coaching } = parsed.data;
    const weekly = summary as WeeklySummary;

    if (weekly.daysTracked < WEEKLY_MIN_DAYS_TRACKED) {
      return NextResponse.json({ error: "waiting_first_week", success: false }, { status: 403 });
    }

    if (weekly.weekTransactionCount < WEEKLY_MIN_TRANSACTIONS) {
      return NextResponse.json({ error: "insufficient_week_data", success: false }, { status: 403 });
    }

    const userTurns = messages.filter((m) => m.role === "user").length;
    if (userTurns >= WEEKLY_CHAT_MAX_USER_MESSAGES) {
      return NextResponse.json({ error: "chat_limit", success: false }, { status: 429 });
    }

    const fallbackReply =
      locale === "ru"
        ? "Сейчас ИИ недоступен. Посмотрите недельный разбор выше: там уже выделены основные траты и рост категорий. Попробуйте задать вопрос позже."
        : "AI is unavailable right now. Use the weekly review above for the main spending patterns and category growth. Try again later.";

    if (!isLlmConfigured()) {
      logLlmFallback(
        buildLlmFallbackLog({
          requestId,
          route: "weekly-chat",
          failureKind: "missing_api_key",
          durationMs: Date.now() - startedAt,
          hasClient: false,
        }),
      );
      return NextResponse.json({ success: true, reply: fallbackReply, fallback: true });
    }

    const openai = getLlmClient();
    if (!openai) {
      logLlmFallback(
        buildLlmFallbackLog({
          requestId,
          route: "weekly-chat",
          failureKind: "client_init_failed",
          durationMs: Date.now() - startedAt,
          hasClient: false,
        }),
      );
      return NextResponse.json({ success: true, reply: fallbackReply, fallback: true });
    }

    const system = WEEKLY_CHAT_SYSTEM(
      weekly,
      reportTips,
      locale as Locale,
      coaching as AiCoachingContext | undefined,
    );
    const history = messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    try {
      const completion = await createLlmChatCompletion(openai, {
        messages: [
          { role: "system", content: system },
          ...history,
          { role: "user", content: question },
        ],
        temperature: 0.5,
      });

      const reply = extractReplyFromChatCompletion(completion);
      if (!reply.ok) {
        logLlmFallback(
          buildLlmFallbackLog({
            requestId,
            route: "weekly-chat",
            failureKind: reply.failureKind,
            durationMs: Date.now() - startedAt,
            hasClient: true,
          }),
        );
        return NextResponse.json({ success: true, reply: fallbackReply, fallback: true });
      }

      return NextResponse.json({ success: true, reply: reply.reply });
    } catch (error) {
      const meta = classifyLlmError(error);
      logLlmFallback(
        buildLlmFallbackLog({
          requestId,
          route: "weekly-chat",
          failureKind: meta.failureKind,
          statusCode: meta.statusCode,
          durationMs: Date.now() - startedAt,
          hasClient: true,
        }),
      );
      return NextResponse.json({ success: true, reply: fallbackReply, fallback: true });
    }
  } catch {
    return NextResponse.json({ error: "Failed to answer" }, { status: 500 });
  }
}

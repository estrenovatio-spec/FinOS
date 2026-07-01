import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  MONTHLY_ANALYSIS_DAYS,
  MONTHLY_CHAT_MAX_USER_MESSAGES,
  MONTHLY_CHAT_SYSTEM,
  MONTHLY_MIN_TRANSACTIONS,
  reportPeriodDays,
  type MonthlySummary,
} from "@/lib/monthly-analysis";
import type { AiCoachingContext } from "@/lib/ai-coaching-context";
import { createLlmChatCompletion, getLlmClient, isLlmConfigured } from "@/lib/llm";
import type { Locale } from "@/types";

const summarySchema = z.object({
  daysTracked: z.number(),
  transactionCount: z.number(),
  monthTransactionCount: z.number(),
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
  messages: z.array(messageSchema).max(MONTHLY_CHAT_MAX_USER_MESSAGES * 2),
  question: z.string().min(1).max(1000),
  coaching: coachingSchema.optional(),
});

export async function POST(request: NextRequest) {
  try {
    const json: unknown = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { locale, summary, reportTips, messages, question, coaching } = parsed.data;
    const monthly = summary as MonthlySummary;

    if (monthly.monthTransactionCount < MONTHLY_MIN_TRANSACTIONS) {
      return NextResponse.json({ error: "insufficient_month_data", success: false }, { status: 403 });
    }

    const userTurns = messages.filter((m) => m.role === "user").length;
    if (userTurns >= MONTHLY_CHAT_MAX_USER_MESSAGES) {
      return NextResponse.json({ error: "chat_limit", success: false }, { status: 429 });
    }

    const isRu = locale === "ru";
    const fallbackReply = isRu
      ? "Сейчас ИИ недоступен. Ориентируйтесь на отчёт выше: там основные цифры за месяц. Попробуйте задать вопрос позже."
      : "AI is unavailable right now. Use the report above for your monthly numbers. Try again later.";

    if (!isLlmConfigured()) {
      return NextResponse.json({ success: true, reply: fallbackReply, fallback: true });
    }

    const openai = getLlmClient();
    if (!openai) {
      return NextResponse.json({ success: true, reply: fallbackReply, fallback: true });
    }

    const extendedPeriod = reportPeriodDays(monthly) > MONTHLY_ANALYSIS_DAYS;
    const system = MONTHLY_CHAT_SYSTEM(
      monthly,
      reportTips,
      locale as Locale,
      extendedPeriod,
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

      const reply = completion.choices[0]?.message?.content?.trim();
      if (!reply) throw new Error("Empty response");

      return NextResponse.json({ success: true, reply });
    } catch {
      return NextResponse.json({ success: true, reply: fallbackReply, fallback: true });
    }
  } catch {
    return NextResponse.json({ error: "Failed to answer" }, { status: 500 });
  }
}

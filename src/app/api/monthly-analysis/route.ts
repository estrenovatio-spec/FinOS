import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdvisorConfig } from "@/lib/advisor-config";
import type { AiCoachingContext } from "@/lib/ai-coaching-context";
import {
  MONTHLY_ANALYSIS_PROMPT,
  MONTHLY_MIN_TRANSACTIONS,
  ruleBasedMonthlyAnalysis,
  type MonthlySummary,
} from "@/lib/monthly-analysis";
import { createLlmChatCompletion, getLlmClient, isLlmConfigured } from "@/lib/llm";
import { extractJsonFromLlmContent } from "@/lib/llm-json";
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

const coachingSchema = z
  .object({
    savingsGoals: z.array(
      z.object({
        name: z.string(),
        saved: z.number(),
        target: z.number(),
        monthlyContribution: z.number(),
        progressPercent: z.number(),
        onTrack: z.boolean(),
      }),
    ),
    categoryBudgets: z.array(
      z.object({
        category: z.string(),
        limit: z.number(),
        spent: z.number(),
        remaining: z.number(),
        overLimit: z.boolean(),
      }),
    ),
  })
  .passthrough();

const bodySchema = z.object({
  locale: z.enum(["ru", "en"]),
  summary: summarySchema,
  coaching: coachingSchema.optional(),
});

const tipsSchema = z.object({
  tips: z.array(z.string().min(1)).min(1).max(8),
});

export async function POST(request: NextRequest) {
  try {
    const json: unknown = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { locale, summary, coaching } = parsed.data;
    const advisor = getAdvisorConfig();
    const monthly = summary as MonthlySummary;

    if (monthly.monthTransactionCount < MONTHLY_MIN_TRANSACTIONS) {
      return NextResponse.json({ error: "insufficient_month_data", success: false }, { status: 403 });
    }

    const onlyExpenses = monthly.totalIncome === 0 && monthly.totalExpense > 0;
    if (onlyExpenses && monthly.monthTransactionCount < MONTHLY_MIN_TRANSACTIONS + 3) {
      return NextResponse.json({ error: "sparse_month", success: false }, { status: 403 });
    }

    if (!isLlmConfigured()) {
      return NextResponse.json({
        success: true,
        tips: ruleBasedMonthlyAnalysis(monthly, locale as Locale, advisor),
        fallback: true,
      });
    }

    const openai = getLlmClient();
    if (!openai) {
      return NextResponse.json({
        success: true,
        tips: ruleBasedMonthlyAnalysis(monthly, locale as Locale, advisor),
        fallback: true,
      });
    }

    try {
      const completion = await createLlmChatCompletion(openai, {
        messages: [
          {
            role: "system",
            content:
              'You give calm monthly budget reviews. JSON only: { "tips": string[] }. No shame.',
          },
          {
            role: "user",
            content: MONTHLY_ANALYSIS_PROMPT(
              monthly,
              locale as Locale,
              advisor,
              coaching as AiCoachingContext | undefined,
            ),
          },
        ],
        temperature: 0.45,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error("Empty response");

      const raw: unknown = extractJsonFromLlmContent(content);
      const validated = tipsSchema.safeParse(raw);
      if (!validated.success) throw new Error("Invalid tips JSON");

      return NextResponse.json({ success: true, tips: validated.data.tips });
    } catch {
      return NextResponse.json({
        success: true,
        tips: ruleBasedMonthlyAnalysis(monthly, locale as Locale, advisor),
        fallback: true,
      });
    }
  } catch {
    return NextResponse.json({ error: "Failed to generate monthly analysis" }, { status: 500 });
  }
}

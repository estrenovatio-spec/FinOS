import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdvisorConfig } from "@/lib/advisor-config";
import type { AiCoachingContext } from "@/lib/ai-coaching-context";
import {
  ruleBasedWeeklyAnalysis,
  WEEKLY_ANALYSIS_PROMPT,
  WEEKLY_MIN_DAYS_TRACKED,
  WEEKLY_MIN_TRANSACTIONS,
  type WeeklySummary,
} from "@/lib/weekly-analysis";
import { createLlmChatCompletion, getLlmClient, isLlmConfigured } from "@/lib/llm";
import { extractJsonFromLlmContent } from "@/lib/llm-json";
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
  tips: z.array(z.string().min(1)).min(1).max(6),
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
    const weekly = summary as WeeklySummary;

    if (weekly.daysTracked < WEEKLY_MIN_DAYS_TRACKED) {
      return NextResponse.json({ error: "waiting_first_week", success: false }, { status: 403 });
    }

    if (weekly.weekTransactionCount < WEEKLY_MIN_TRANSACTIONS) {
      return NextResponse.json({ error: "insufficient_week_data", success: false }, { status: 403 });
    }

    if (!isLlmConfigured()) {
      return NextResponse.json({
        success: true,
        tips: ruleBasedWeeklyAnalysis(weekly, locale as Locale, advisor),
        fallback: true,
      });
    }

    const openai = getLlmClient();
    if (!openai) {
      return NextResponse.json({
        success: true,
        tips: ruleBasedWeeklyAnalysis(weekly, locale as Locale, advisor),
        fallback: true,
      });
    }

    try {
      const completion = await createLlmChatCompletion(openai, {
        messages: [
          {
            role: "system",
            content:
              'You give gentle weekly budget tips. JSON only: { "tips": string[] }. No shame.',
          },
          {
            role: "user",
            content: WEEKLY_ANALYSIS_PROMPT(
              weekly,
              locale as Locale,
              advisor,
              coaching as AiCoachingContext | undefined,
            ),
          },
        ],
        temperature: 0.4,
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
        tips: ruleBasedWeeklyAnalysis(weekly, locale as Locale, advisor),
        fallback: true,
      });
    }
  } catch {
    return NextResponse.json({ error: "Failed to generate weekly analysis" }, { status: 500 });
  }
}

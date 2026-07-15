import { z } from "zod";

export const advisorMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

export const advisorContextCardSchema = z.object({
  label: z.string().min(1).max(100),
  value: z.string().min(1).max(200),
  note: z.string().min(1).max(400),
});

export const advisorQuestionContextSchema = z.object({
  cards: z.array(advisorContextCardSchema).max(8),
  periodNote: z.string().max(200).optional(),
  periodEndDate: z.string().optional(),
  questionGuide: z.string().max(4000).optional(),
});

export const advisorQuestionRequestSchema = z.object({
  locale: z.enum(["ru", "en"]),
  userPlan: z.enum(["free", "standard", "pro"]).default("free"),
  question: z.string().min(1).max(1000),
  messages: z.array(advisorMessageSchema).max(12).default([]),
  context: advisorQuestionContextSchema,
});

export type AdvisorQuestionRequest = z.infer<typeof advisorQuestionRequestSchema>;

export function normalizeAdvisorQuestionRequestBody(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const record = input as Record<string, unknown>;
  if (record.context != null || record.advisorContext == null) return input;
  return {
    ...record,
    context: record.advisorContext,
  };
}

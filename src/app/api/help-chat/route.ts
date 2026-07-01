import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api/household-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { householdAuthBaseSchema } from "@/lib/household/auth-body";
import {
  classifyHelpQuestion,
  formatBuiltinHelpAnswer,
} from "@/lib/help-app-knowledge";
import {
  assertMember,
  buildSyncPayload,
  getHouseholdSessionForUser,
  upsertTelegramUser,
} from "@/lib/household/service";
import {
  HELP_CHAT_LLM_HISTORY_MAX,
  HELP_CHAT_SYSTEM,
  buildHelpChatContext,
  formatHelpUserMessage,
  type HelpChatMessage,
} from "@/lib/help-chat";
import {
  createPlainTextChatCompletion,
  extractPlainTextFromLlmContent,
  getPlainTextLlmClient,
  isLlmConfigured,
} from "@/lib/llm";
import { requireTelegramUser } from "@/lib/household/require-telegram-user";
import type { CategoryDefinition, Transaction } from "@/types";
import type { CategoryBudget, RecurringTransaction, SavingsGoal } from "@/types/planning";

/** LLM может занимать до минуты — иначе Vercel обрывает запрос и клиент видит «ошибка сети». */
export const maxDuration = 60;

const txSchema = z.object({
  id: z.string().catch(() => `local-${Date.now().toString(36)}`),
  amount: z.coerce.number().catch(0),
  type: z.enum(["income", "expense"]).catch("expense"),
  categoryId: z.string().catch("other"),
  currency: z.string().catch("RUB"),
  note: z.string().optional().catch(""),
  date: z.string().catch(() => new Date().toISOString().slice(0, 10)),
  owner: z.enum(["me", "partner"]).optional().catch("me"),
  goalId: z.string().optional().catch(undefined),
  goalAmount: z.coerce.number().optional().catch(undefined),
});

const categorySchema = z.object({
  id: z.string().catch("other"),
  labels: z
    .object({ ru: z.string().optional(), en: z.string().optional() })
    .catch({ ru: "—", en: "—" })
    .transform((l) => ({
      ru: (l.ru ?? l.en ?? "").trim() || "—",
      en: (l.en ?? l.ru ?? "").trim() || "—",
    })),
  keywords: z.array(z.string()).optional().catch([]),
  type: z.enum(["income", "expense", "both"]).optional().catch(undefined),
});

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

const bodySchema = z.object({
  locale: z.enum(["ru", "en"]),
  question: z.string().min(1).max(1000),
  messages: z.array(messageSchema).max(400),
  trackingStartedAt: z.string().nullable().optional(),
  partnerLabel: z.string().nullable().optional(),
  initData: z.string().optional(),
  telegramLogin: householdAuthBaseSchema.shape.telegramLogin,
  clientSnapshot: z
    .object({
      transactions: z.array(txSchema).max(5000),
      categories: z.array(categorySchema).max(200),
      savingsGoals: z.array(z.record(z.unknown())).optional(),
      categoryBudgets: z.array(z.record(z.unknown())).optional(),
      recurringTransactions: z.array(z.record(z.unknown())).optional(),
    })
    .optional(),
});

async function loadSyncFromRequest(
  req: NextRequest,
  auth: { initData?: string; telegramLogin?: z.infer<typeof householdAuthBaseSchema>["telegramLogin"] },
) {
  if (!isDatabaseConfigured()) return null;

  try {
    const session = requireSession(req);
    if (session) {
      await assertMember(session.userId, session.householdId);
      return buildSyncPayload(session.householdId, session.userId);
    }

    if (auth.initData?.trim() || auth.telegramLogin) {
      const tgUser = requireTelegramUser({
        initData: auth.initData,
        telegramLogin: auth.telegramLogin,
      });
      if (!tgUser) return null;
      const user = await upsertTelegramUser(tgUser);
      const row = await getHouseholdSessionForUser(user.id);
      return row?.sync ?? null;
    }
  } catch (e) {
    console.warn("[help-chat] cloud load skipped", e);
  }

  return null;
}

export async function POST(request: NextRequest) {
  let questionForFallback = "";

  try {
    const json: unknown = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const {
      locale,
      question,
      messages,
      trackingStartedAt = null,
      partnerLabel = null,
      initData,
      telegramLogin,
      clientSnapshot,
    } = parsed.data;

    questionForFallback = question;
    const ru = locale === "ru";

    const genericFallback = ru
      ? "Сейчас не получилось связаться с ИИ. Попробуйте через минуту или посмотрите шпаргалку выше."
      : "Could not reach AI right now. Try again in a minute or use the quick reference above.";

    const builtin = formatBuiltinHelpAnswer(question, locale);

    let dataSource: "cloud_db" | "client_device" | "none" = "none";
    let transactions: Transaction[] = [];
    let categories: CategoryDefinition[] = [];
    let goals: SavingsGoal[] = [];
    let budgets: CategoryBudget[] = [];
    let recurring: RecurringTransaction[] = [];
    let effectivePartnerLabel = partnerLabel;

    const sync = await loadSyncFromRequest(request, { initData, telegramLogin });
    if (sync) {
      dataSource = "cloud_db";
      transactions = sync.transactions;
      categories = sync.categories;
      goals = sync.savingsGoals;
      budgets = sync.categoryBudgets;
      recurring = sync.recurringTransactions;
      effectivePartnerLabel = sync.household.partnerLabel ?? partnerLabel;
    } else if (clientSnapshot) {
      dataSource = "client_device";
      transactions = clientSnapshot.transactions as Transaction[];
      categories = clientSnapshot.categories as CategoryDefinition[];
      goals = (clientSnapshot.savingsGoals ?? []) as unknown as SavingsGoal[];
      budgets = (clientSnapshot.categoryBudgets ?? []) as unknown as CategoryBudget[];
      recurring = (clientSnapshot.recurringTransactions ?? []) as unknown as RecurringTransaction[];
    }

    const ctx = buildHelpChatContext({
      locale,
      dataSource,
      transactions,
      categories,
      trackingStartedAt: trackingStartedAt ?? null,
      partnerLabel: effectivePartnerLabel,
      question,
      savingsGoals: goals,
      categoryBudgets: budgets,
      recurringTransactions: recurring,
    });

    const payload = (reply: string, extra?: { fallback?: boolean; builtin?: boolean }) =>
      NextResponse.json({
        success: true,
        reply,
        dataSource: ctx.dataSource,
        transactionCount: transactions.length,
        ...extra,
      });

    // «Как подключить жену» и похожие — сразу по шпаргалке, без ожидания LLM
    if (builtin && classifyHelpQuestion(question) === "app") {
      return payload(builtin, { fallback: true, builtin: true });
    }

    if (!isLlmConfigured()) {
      return payload(builtin ?? genericFallback, { fallback: true, builtin: Boolean(builtin) });
    }

    const openai = getPlainTextLlmClient();
    if (!openai) {
      return payload(builtin ?? genericFallback, { fallback: true, builtin: Boolean(builtin) });
    }

    const system = HELP_CHAT_SYSTEM(ctx);
    const history = (messages as HelpChatMessage[])
      .slice(-HELP_CHAT_LLM_HISTORY_MAX)
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    try {
      const completion = await createPlainTextChatCompletion(openai, {
        messages: [
          { role: "system", content: system },
          ...history,
          { role: "user", content: formatHelpUserMessage(question, locale) },
        ],
        temperature: 0.3,
        max_tokens: 700,
      });

      const reply = extractPlainTextFromLlmContent(completion.choices[0]?.message?.content);
      if (reply) {
        return payload(reply);
      }
      console.warn("[help-chat] empty llm content");
    } catch (e) {
      console.error("[help-chat] llm error", e);
    }

    if (builtin) {
      return payload(builtin, { fallback: true, builtin: true });
    }

    return payload(genericFallback, { fallback: true });
  } catch (e) {
    console.error("[help-chat]", e);
    const builtin = formatBuiltinHelpAnswer(questionForFallback, "ru");
    if (builtin) {
      return NextResponse.json({ success: true, reply: builtin, builtin: true });
    }
    return NextResponse.json({ error: "Failed to answer" }, { status: 500 });
  }
}

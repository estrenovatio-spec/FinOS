import { getCategoryLabel } from "@/lib/categories";
import { formatIsoPeriod } from "@/lib/format-date";
import {
  buildAppScreenMap,
  buildFewShotExamples,
  classifyHelpQuestion,
  selectPlaybooksForQuestion,
} from "@/lib/help-app-knowledge";
import { buildRelevantFaqText } from "@/lib/help-faq-content";
import {
  buildChatSummaryForQuestion,
  buildPeriodSummary,
  MAX_CHAT_ANALYSIS_DAYS,
  type MonthlySummary,
} from "@/lib/monthly-analysis";
import type { CategoryDefinition, Locale, Transaction } from "@/types";
import type { CategoryBudget, RecurringTransaction, SavingsGoal } from "@/types/planning";

/** Max messages sent to LLM per request (full history kept in UI/storage). */
export const HELP_CHAT_LLM_HISTORY_MAX = 40;
export const HELP_CHAT_RECENT_TX_LIMIT = 50;

export type HelpChatMessage = { role: "user" | "assistant"; content: string };

export type HelpChatDataSource = "cloud_db" | "client_device" | "none";

export interface HelpChatContext {
  locale: Locale;
  dataSource: HelpChatDataSource;
  partnerLabel: string | null;
  question: string;
  summary: MonthlySummary | null;
  recentTransactions: CompactTx[];
  savingsGoals: SavingsGoal[];
  categoryBudgets: CategoryBudget[];
  recurringTransactions: RecurringTransaction[];
}

type CompactTx = {
  date: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  note: string;
  owner: string;
  goalAmount?: number;
};

function compactTransactions(
  transactions: Transaction[],
  categories: CategoryDefinition[],
  locale: Locale,
  partnerLabel: string | null,
  limit: number,
): CompactTx[] {
  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
  return sorted.slice(0, limit).map((tx) => ({
    date: tx.date,
    type: tx.type,
    amount: tx.amount,
    category: getCategoryLabel(tx.categoryId, categories, locale),
    note: (tx.note ?? "").slice(0, 80),
    owner:
      tx.owner === "partner" && partnerLabel?.trim()
        ? partnerLabel.trim()
        : tx.owner === "partner"
          ? "partner"
          : "me",
    ...(tx.goalAmount != null && tx.goalAmount > 0 ? { goalAmount: tx.goalAmount } : {}),
  }));
}

export function buildHelpChatContext(params: {
  locale: Locale;
  dataSource: HelpChatDataSource;
  transactions: Transaction[];
  categories: CategoryDefinition[];
  trackingStartedAt: string | null;
  partnerLabel: string | null;
  question: string;
  savingsGoals?: SavingsGoal[];
  categoryBudgets?: CategoryBudget[];
  recurringTransactions?: RecurringTransaction[];
}): HelpChatContext {
  const {
    locale,
    dataSource,
    transactions,
    categories,
    trackingStartedAt,
    partnerLabel,
    question,
    savingsGoals = [],
    categoryBudgets = [],
    recurringTransactions = [],
  } = params;

  const resolveLabel = (id: string) => getCategoryLabel(id, categories, locale);

  let summary: MonthlySummary | null = null;
  if (transactions.length > 0) {
    const base = buildPeriodSummary(
      transactions,
      trackingStartedAt,
      resolveLabel,
      MAX_CHAT_ANALYSIS_DAYS,
    );
    summary = buildChatSummaryForQuestion(
      question,
      base,
      transactions,
      trackingStartedAt,
      resolveLabel,
    );
  }

  return {
    locale,
    dataSource,
    partnerLabel,
    question,
    summary,
    recentTransactions: compactTransactions(
      transactions,
      categories,
      locale,
      partnerLabel,
      HELP_CHAT_RECENT_TX_LIMIT,
    ),
    savingsGoals,
    categoryBudgets,
    recurringTransactions,
  };
}

/** Обёртка вопроса — модель сначала понимает намерение */
export function formatHelpUserMessage(question: string, locale: Locale): string {
  const kind = classifyHelpQuestion(question);
  const kindNote =
    locale === "ru"
      ? { app: "похоже на вопрос про приложение", finance: "похоже на вопрос про деньги", mixed: "и приложение, и деньги" }[
          kind
        ]
      : { app: "app how-to", finance: "money data", mixed: "app + money" }[kind];

  return `[Вопрос пользователя, можно сформулирован нечётко; тип: ${kindNote}]\n${question.trim()}`;
}

export function HELP_CHAT_SYSTEM(ctx: HelpChatContext): string {
  const lang = ctx.locale === "ru" ? "Russian" : "English";
  const kind = classifyHelpQuestion(ctx.question);
  const sourceNote =
    ctx.dataSource === "cloud_db"
      ? localeRuEn(ctx.locale, "Финансы — из облачной базы (актуально).", "Finances from cloud DB (authoritative).")
      : ctx.dataSource === "client_device"
        ? localeRuEn(
            ctx.locale,
            "Финансы — с этого телефона (может отличаться от облака).",
            "Finances from this device (may differ from cloud).",
          )
        : localeRuEn(ctx.locale, "Записей о тратах пока нет.", "No transactions logged yet.");

  const financeBlock =
    ctx.summary && (kind === "finance" || kind === "mixed")
      ? `Summary (${formatIsoPeriod(ctx.summary.periodStart, ctx.summary.periodEnd, ctx.locale)}, ${ctx.summary.monthTransactionCount} ops):
${JSON.stringify(ctx.summary, null, 2)}

Recent transactions:
${JSON.stringify(ctx.recentTransactions, null, 2)}

Goals: ${JSON.stringify(ctx.savingsGoals)}
Limits: ${JSON.stringify(ctx.categoryBudgets)}
Recurring: ${JSON.stringify(ctx.recurringTransactions)}
Partner label: ${ctx.partnerLabel ?? "—"}`
      : kind === "finance"
        ? localeRuEn(
            ctx.locale,
            "Пользователь спрашивает про деньги, но записей нет — предложите добавить 2–3 операции текстом.",
            "User asks about money but no data — suggest logging a few entries.",
          )
        : localeRuEn(
            ctx.locale,
            "(Блок финансов не нужен для этого вопроса — не выдумывайте цифры.)",
            "(Finance block not needed — do not invent numbers.)",
          );

  const playbooks = selectPlaybooksForQuestion(ctx.question, ctx.locale);
  const faq = buildRelevantFaqText(ctx.question, ctx.locale);
  const screenMap = buildAppScreenMap(ctx.locale);
  const fewShot = buildFewShotExamples(ctx.locale);

  return `You are the in-app support assistant for «Просто Бюджет» — Telegram budget app for everyday people (not tech experts).

Respond in ${lang} only.

=== HOW TO THINK (mandatory) ===
1. Read the user message — it may be short, vague, with typos or spoken style («как жене», «не вижу траты», «куда жать»).
2. Guess the REAL goal (what they want to achieve). Do NOT ask them to rephrase unless truly impossible.
3. Answer with numbered steps (1. 2. 3.), exact button names from APP MAP.
4. Use PLAYBOOKS and FAQ below — combine them into a clear answer in your own words.
5. Never say «уточните запрос» / «переформулируйте» as the main answer.
6. Max 6–8 short lines or one short list. Simple words. No jargon.

=== Question type: ${kind} ===
${sourceNote}

=== APP MAP ===
${screenMap}

=== STEP-BY-STEP PLAYBOOKS (use when relevant) ===
${playbooks}

=== FAQ DETAILS (reference) ===
${faq}

=== FEW-SHOT STYLE ===
${fewShot}

=== USER FINANCES (only for money questions; never invent) ===
${financeBlock}`;
}

function localeRuEn(locale: Locale, ru: string, en: string): string {
  return locale === "ru" ? ru : en;
}

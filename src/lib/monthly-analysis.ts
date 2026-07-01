import {
  buildBudgetSummary,
  getDaysTracked,
  getTrackingStartDate,
  type BudgetSummary,
} from "@/lib/budget-analytics";
import type { AdvisorConfig } from "@/lib/advisor-config";
import { advisorPlanningWithRu } from "@/lib/advisor-config";
import { formatIsoDate, formatIsoPeriod } from "@/lib/format-date";
import type { AiCoachingContext } from "@/lib/ai-coaching-context";
import { coachingPromptBlock } from "@/lib/ai-coaching-context";
import type { Locale, Transaction } from "@/types";

/** Макс. длина периода отчёта; если ведёте дольше — берём последние 30 дней */
export const MONTHLY_ANALYSIS_DAYS = 30;
/** Макс. период для ответа в чате по запросу («за полгода» и т.д.) */
export const MAX_CHAT_ANALYSIS_DAYS = 365;
/** Минимум записей с момента первого входа */
export const MONTHLY_MIN_TRANSACTIONS = 5;
export const MONTHLY_CHAT_MAX_USER_MESSAGES = 10;

export interface MonthlySummary extends BudgetSummary {
  periodStart: string;
  periodEnd: string;
  monthTransactionCount: number;
}

export type MonthlyGateReason =
  | "need_more_days"
  | "need_more_entries"
  | "sparse_month"
  | "ready";

export interface MonthlyGate {
  ready: boolean;
  reason: MonthlyGateReason;
  entriesNeeded?: number;
  daysNeeded?: number;
}

function parseDate(date: string): Date {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Период: с первого входа; не длиннее maxDays */
export function getPeriodBounds(
  trackingStartedAt: string | null,
  transactions: Transaction[],
  maxDays: number,
): { start: Date; end: Date } | null {
  const trackingStart = getTrackingStartDate(trackingStartedAt, transactions);
  if (!trackingStart) return null;

  const end = new Date();
  let start = new Date(trackingStart);
  start.setHours(0, 0, 0, 0);

  const cap = Math.min(Math.max(1, maxDays), MAX_CHAT_ANALYSIS_DAYS);
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysSpan = Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
  if (daysSpan > cap) {
    start = new Date();
    start.setDate(start.getDate() - (cap - 1));
    start.setHours(0, 0, 0, 0);
  }

  return { start, end };
}

export function getMonthlyPeriodBounds(
  trackingStartedAt: string | null,
  transactions: Transaction[],
): { start: Date; end: Date } | null {
  return getPeriodBounds(trackingStartedAt, transactions, MONTHLY_ANALYSIS_DAYS);
}

export function reportPeriodDays(summary: MonthlySummary): number {
  const start = parseDate(summary.periodStart);
  const end = parseDate(summary.periodEnd);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1);
}

/** Сколько дней данных подставить в чат по формулировке вопроса */
export function parseRequestedAnalysisDays(question: string, daysTracked: number): number {
  const q = question.toLowerCase().replace(/ё/g, "е");
  const all = Math.min(Math.max(daysTracked, 1), MAX_CHAT_ANALYSIS_DAYS);

  if (
    /(весь|всю)\s+(период|истори|время)|с\s*начал|за\s*все\s*время|all\s*time|since\s*start|whole\s*history/.test(
      q,
    )
  ) {
    return all;
  }
  if (/полгода|6\s*мес|шесть\s*мес|half\s*a\s*year|6\s*months/.test(q)) {
    return Math.min(180, all);
  }
  if (/(^|\s)год(\s|$)|12\s*мес|за\s*год|whole\s*year|12\s*months/.test(q)) {
    return Math.min(365, all);
  }
  if (/3\s*мес|три\s*мес|квартал|quarter|3\s*months/.test(q)) {
    return Math.min(90, all);
  }
  if (/2\s*мес|два\s*мес|2\s*months/.test(q)) {
    return Math.min(60, all);
  }
  if (
    /динамик|тренд|как\s*менял|изменени|сравн.*месяц|по\s*месяцам|month\s*by\s*month|trend|dynamics/.test(
      q,
    )
  ) {
    return all;
  }

  return Math.min(MONTHLY_ANALYSIS_DAYS, all);
}

export function buildPeriodSummary(
  transactions: Transaction[],
  trackingStartedAt: string | null,
  resolveCategoryLabel: (categoryId: string) => string,
  maxDays: number,
): MonthlySummary {
  const bounds = getPeriodBounds(trackingStartedAt, transactions, maxDays);
  const end = bounds?.end ?? new Date();
  const start =
    bounds?.start ??
    new Date(end.getTime() - (Math.min(maxDays, MONTHLY_ANALYSIS_DAYS) - 1) * 24 * 60 * 60 * 1000);

  const periodTxs = transactions.filter((tx) => {
    const d = parseDate(tx.date);
    return d >= start && d <= end;
  });

  const base = buildBudgetSummary(periodTxs, trackingStartedAt, resolveCategoryLabel);
  const daysTrackedAll = getDaysTracked(trackingStartedAt, transactions);
  const periodNet = base.totalIncome - base.totalExpense;

  return {
    ...base,
    daysTracked: daysTrackedAll,
    transactionCount: periodTxs.length,
    monthTransactionCount: periodTxs.length,
    periodNet,
    balance: periodNet,
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  };
}

/** Сводка для чата: расширяет период, если в вопросе «полгода», «динамика» и т.д. */
export function buildChatSummaryForQuestion(
  question: string,
  reportSummary: MonthlySummary,
  transactions: Transaction[],
  trackingStartedAt: string | null,
  resolveCategoryLabel: (categoryId: string) => string,
): MonthlySummary {
  const requested = parseRequestedAnalysisDays(question, reportSummary.daysTracked);
  if (requested <= reportPeriodDays(reportSummary)) return reportSummary;
  return buildPeriodSummary(
    transactions,
    trackingStartedAt,
    resolveCategoryLabel,
    requested,
  );
}

export function buildMonthlySummary(
  transactions: Transaction[],
  trackingStartedAt: string | null,
  resolveCategoryLabel: (categoryId: string) => string,
): MonthlySummary {
  return buildPeriodSummary(
    transactions,
    trackingStartedAt,
    resolveCategoryLabel,
    MONTHLY_ANALYSIS_DAYS,
  );
}

export function getMonthlyGate(
  summary: MonthlySummary,
  _trackingStartedAt: string | null,
  _transactions: Transaction[],
): MonthlyGate {
  const periodDays = reportPeriodDays(summary);
  if (periodDays < MONTHLY_ANALYSIS_DAYS) {
    return {
      ready: false,
      reason: "need_more_days",
      daysNeeded: MONTHLY_ANALYSIS_DAYS - periodDays,
    };
  }

  if (summary.monthTransactionCount < MONTHLY_MIN_TRANSACTIONS) {
    return {
      ready: false,
      reason: "need_more_entries",
      entriesNeeded: MONTHLY_MIN_TRANSACTIONS - summary.monthTransactionCount,
    };
  }

  const onlyExpenses = summary.totalIncome === 0 && summary.totalExpense > 0;
  if (onlyExpenses && summary.monthTransactionCount < MONTHLY_MIN_TRANSACTIONS + 3) {
    return { ready: false, reason: "sparse_month" };
  }

  return { ready: true, reason: "ready" };
}

export function getMonthlyWaitingMessages(
  gate: MonthlyGate,
  locale: Locale,
  summary: MonthlySummary,
): string[] {
  const isRu = locale === "ru";

  if (gate.reason === "need_more_days") {
    const n = gate.daysNeeded ?? 1;
    return [
      isRu
        ? `Месячный разбор откроется через ${n} ${n === 1 ? "день" : n < 5 ? "дня" : "дней"} — ведите учёт с первого входа (нужно ${MONTHLY_ANALYSIS_DAYS} дней).`
        : `Monthly review unlocks in ${n} day(s) — keep logging (${MONTHLY_ANALYSIS_DAYS} days from your first entry).`,
    ];
  }

  if (gate.reason === "need_more_entries") {
    const n = gate.entriesNeeded ?? 1;
    return [
      isRu
        ? `С момента первого входа ${summary.monthTransactionCount} ${summary.monthTransactionCount === 1 ? "запись" : "записи"} — для разбора нужно ещё ${n}. Добавьте доходы и расходы.`
        : `${summary.monthTransactionCount} entries since you started — add ${n} more for a monthly review.`,
    ];
  }

  if (gate.reason === "sparse_month") {
    return [
      isRu
        ? "Пока видны только расходы без доходов — добавьте поступления, и разбор будет точнее."
        : "Only expenses so far — add income entries for a fairer review.",
    ];
  }

  return [];
}

export const MONTHLY_ANALYSIS_PROMPT = (
  summary: MonthlySummary,
  locale: Locale,
  advisor: AdvisorConfig,
  coaching?: AiCoachingContext | null,
) => {
  const lang = locale === "ru" ? "Russian" : "English";
  const limited = summary.monthTransactionCount < 15;

  return `
You are a calm financial mentor. Monthly review for ${formatIsoPeriod(summary.periodStart, summary.periodEnd, locale)} (since user started tracking; ${summary.daysTracked} day(s) total).

Data (JSON):
${JSON.stringify(summary, null, 2)}

Critical rules:
- Respond in ${lang}.
- Return ONLY JSON: { "tips": string[] }
- Give ${limited ? "3–4" : "5–7"} tips: overview of month, main categories, one trend, one gentle next step.
- Tone: warm, zero shame. User may ask follow-up questions in chat — write tips they can refer to.
- ${limited ? "Data is LIMITED — say so. No invented patterns." : "Use real numbers from data."}
- summary.periodNet is the period result: totalIncome - totalExpense for this report period. It is NOT the user's account balance.
- Do NOT use the word "balance" / "баланс" for summary.periodNet. Say "итог периода", "разница доходов и расходов", or "денежный поток периода".
- If periodNet is negative, explain only that expenses exceeded income during this report period. Never say the user's account/card balance is negative.
- Russia context: RUB. No tax/legal advice.
- Last tip (optional, soft): ${locale === "ru" ? advisorPlanningWithRu(advisor) : `Need advice — contact a financial advisor: ${advisor.contact}`}.
${coaching ? coachingPromptBlock(coaching, locale) : ""}
`;
};

export function ruleBasedMonthlyAnalysis(
  summary: MonthlySummary,
  locale: Locale,
  advisor: AdvisorConfig,
): string[] {
  const isRu = locale === "ru";
  const top = summary.expenseByCategory[0];
  const periodNet = summary.periodNet ?? summary.totalIncome - summary.totalExpense;

  const periodLabel = isRu
    ? `За период ${formatIsoPeriod(summary.periodStart, summary.periodEnd, locale)}`
    : `Period ${formatIsoPeriod(summary.periodStart, summary.periodEnd, locale)}`;

  const tips: string[] = [
    isRu
      ? `${periodLabel}: доход ${summary.totalIncome.toLocaleString("ru-RU")} ₽, расход ${summary.totalExpense.toLocaleString("ru-RU")} ₽, итог периода ${periodNet.toLocaleString("ru-RU")} ₽.`
      : `${periodLabel}: income ${summary.totalIncome}, expenses ${summary.totalExpense}, period result ${periodNet}.`,
  ];

  if (top) {
    tips.push(
      isRu
        ? `Больше всего ушло на «${top.category}» — ${top.amount.toLocaleString("ru-RU")} ₽ (${top.sharePercent}% расходов).`
        : `Largest category: ${top.category} — ${top.amount} (${top.sharePercent}% of expenses).`,
    );
  }

  tips.push(
    isRu
      ? "Задайте вопрос в чате ниже — ИИ ответит по вашим цифрам."
      : "Ask a question in the chat below — AI will answer using your numbers.",
    isRu
      ? advisorPlanningWithRu(advisor)
      : `Need advice — contact a financial advisor: ${advisor.contact}`,
  );

  return tips;
}

export const MONTHLY_CHAT_SYSTEM = (
  summary: MonthlySummary,
  reportTips: string[],
  locale: Locale,
  extendedPeriod = false,
  coaching?: AiCoachingContext | null,
) => {
  const lang = locale === "ru" ? "Russian" : "English";
  const trendHint =
    summary.monthlyExpenses.length > 1
      ? "Use monthlyExpenses (expenses per calendar month) to describe trends, peaks, and changes over time."
      : "";

  return `You are a personal finance assistant. The user tracks budget in a Telegram app.

Answer ONLY about their finances using the data below. Respond in ${lang}.
Be concise (2–5 short paragraphs max). No shame, no lecturing.
If the question is outside their data, say what you can infer and what you cannot know.
No tax/legal/investment product advice — general budgeting only.
summary.periodNet is totalIncome - totalExpense for the Summary JSON period. It is NOT the user's account balance.
Do NOT call summary.periodNet "balance" / "баланс"; use period result, cash flow, or income-expense difference.
If periodNet is negative, say expenses exceeded income in the period, not that the user's account balance is negative.
${extendedPeriod ? "The user asked about a LONGER period than the short monthly report — base your answer on the Summary JSON period, not only the report bullets." : ""}
${trendHint}

User has been tracking for ${summary.daysTracked} day(s) total.
Period in Summary JSON: ${formatIsoPeriod(summary.periodStart, summary.periodEnd, locale)} (${summary.monthTransactionCount} entries; dates in JSON are YYYY-MM-DD)
Currency: ${summary.currency}

Summary JSON:
${JSON.stringify(summary, null, 2)}

Short monthly report already shown to user (may cover fewer days):
${reportTips.map((t, i) => `${i + 1}. ${t}`).join("\n")}
${coaching ? coachingPromptBlock(coaching, locale) : ""}`;
};

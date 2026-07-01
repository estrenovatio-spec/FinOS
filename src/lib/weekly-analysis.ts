import {
  buildBudgetSummary,
  getDaysTracked,
  type BudgetSummary,
} from "@/lib/budget-analytics";
import type { AdvisorConfig } from "@/lib/advisor-config";
import { formatIsoPeriod } from "@/lib/format-date";
import type { AiCoachingContext } from "@/lib/ai-coaching-context";
import { coachingPromptBlock } from "@/lib/ai-coaching-context";
import type { Locale, Transaction } from "@/types";

export const WEEKLY_ANALYSIS_DAYS = 7;
/** Минимум записей за 7 дней для полноценного AI-разбора */
export const WEEKLY_MIN_TRANSACTIONS = 5;
/** Минимум дней ведения бюджета до первого разбора */
export const WEEKLY_MIN_DAYS_TRACKED = 7;
export const WEEKLY_CHAT_MAX_USER_MESSAGES = 3;

export interface WeeklySummary extends BudgetSummary {
  periodStart: string;
  periodEnd: string;
  weekTransactionCount: number;
  categoryChanges: CategorySpendingChange[];
}

export type CategorySpendingChange = {
  category: string;
  currentAmount: number;
  previousAmount: number;
  deltaAmount: number;
  deltaPercent: number | null;
  currentCount: number;
  previousCount: number;
};

export type WeeklyGateReason =
  | "waiting_first_week"
  | "need_more_entries"
  | "sparse_week"
  | "ready";

export interface WeeklyGate {
  ready: boolean;
  reason: WeeklyGateReason;
  daysUntilFirst?: number;
  entriesNeeded?: number;
}

function parseDate(date: string): Date {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function categorySpendingChanges(
  transactions: Transaction[],
  currentStart: Date,
  currentEnd: Date,
  previousStart: Date,
  previousEnd: Date,
  resolveCategoryLabel: (categoryId: string) => string,
): CategorySpendingChange[] {
  const current = new Map<string, { amount: number; count: number }>();
  const previous = new Map<string, { amount: number; count: number }>();

  for (const tx of transactions) {
    if (tx.type !== "expense") continue;
    const d = parseDate(tx.date);
    const label = resolveCategoryLabel(tx.categoryId);
    const bucket = d >= currentStart && d <= currentEnd ? current : d >= previousStart && d < previousEnd ? previous : null;
    if (!bucket) continue;
    const row = bucket.get(label) ?? { amount: 0, count: 0 };
    row.amount += tx.amount;
    row.count += 1;
    bucket.set(label, row);
  }

  const categories = new Set([...current.keys(), ...previous.keys()]);
  return Array.from(categories)
    .map((category) => {
      const cur = current.get(category) ?? { amount: 0, count: 0 };
      const prev = previous.get(category) ?? { amount: 0, count: 0 };
      const deltaAmount = cur.amount - prev.amount;
      return {
        category,
        currentAmount: Math.round(cur.amount),
        previousAmount: Math.round(prev.amount),
        deltaAmount: Math.round(deltaAmount),
        deltaPercent: prev.amount > 0 ? Math.round((deltaAmount / prev.amount) * 100) : null,
        currentCount: cur.count,
        previousCount: prev.count,
      };
    })
    .filter((row) => row.currentAmount > 0 && row.deltaAmount > 0)
    .sort((a, b) => b.deltaAmount - a.deltaAmount)
    .slice(0, 5);
}

export function buildWeeklySummary(
  transactions: Transaction[],
  trackingStartedAt: string | null,
  resolveCategoryLabel: (categoryId: string) => string,
): WeeklySummary {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - WEEKLY_ANALYSIS_DAYS);
  start.setHours(0, 0, 0, 0);
  const previousStart = new Date(start);
  previousStart.setDate(previousStart.getDate() - WEEKLY_ANALYSIS_DAYS);

  const weekTxs = transactions.filter((tx) => {
    const d = parseDate(tx.date);
    return d >= start && d <= end;
  });

  const base = buildBudgetSummary(weekTxs, trackingStartedAt, resolveCategoryLabel);
  const daysTrackedAll = getDaysTracked(trackingStartedAt, transactions);
  const periodNet = base.totalIncome - base.totalExpense;

  return {
    ...base,
    daysTracked: daysTrackedAll,
    transactionCount: weekTxs.length,
    weekTransactionCount: weekTxs.length,
    periodNet,
    balance: periodNet,
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
    categoryChanges: categorySpendingChanges(
      transactions,
      start,
      end,
      previousStart,
      start,
      resolveCategoryLabel,
    ),
  };
}

export function getWeeklyGate(
  summary: WeeklySummary,
  trackingStartedAt: string | null,
  transactions: Transaction[],
): WeeklyGate {
  const daysTracked = getDaysTracked(trackingStartedAt, transactions);

  if (daysTracked < WEEKLY_MIN_DAYS_TRACKED) {
    return {
      ready: false,
      reason: "waiting_first_week",
      daysUntilFirst: WEEKLY_MIN_DAYS_TRACKED - daysTracked,
    };
  }

  if (summary.weekTransactionCount < WEEKLY_MIN_TRANSACTIONS) {
    return {
      ready: false,
      reason: "need_more_entries",
      entriesNeeded: WEEKLY_MIN_TRANSACTIONS - summary.weekTransactionCount,
    };
  }

  return { ready: true, reason: "ready" };
}

/** @deprecated use getWeeklyGate */
export function isEligibleForWeeklyAnalysis(summary: WeeklySummary): boolean {
  return summary.weekTransactionCount >= WEEKLY_MIN_TRANSACTIONS;
}

export function getWeeklyWaitingMessages(
  gate: WeeklyGate,
  locale: Locale,
  summary: WeeklySummary,
): string[] {
  const isRu = locale === "ru";

  if (gate.reason === "waiting_first_week") {
    const d = gate.daysUntilFirst ?? WEEKLY_MIN_DAYS_TRACKED;
    return [
      isRu
        ? `Первый разбор откроется через ${d} ${d === 1 ? "день" : d < 5 ? "дня" : "дней"}. Пока просто записывайте траты — без оценок.`
        : `First review unlocks in ${d} day(s). Just log expenses for now — no judgments.`,
    ];
  }

  if (gate.reason === "need_more_entries") {
    const n = gate.entriesNeeded ?? 1;
    return [
      isRu
        ? `За неделю ${summary.weekTransactionCount} ${summary.weekTransactionCount === 1 ? "запись" : "записи"} — для разбора нужно ещё ${n}. Добавьте несколько обычных трат, тогда советы будут по делу.`
        : `${summary.weekTransactionCount} entries this week — add ${n} more everyday expenses for a fair review.`,
    ];
  }

  if (gate.reason === "sparse_week") {
    return [
      isRu
        ? "Пока записей за неделю маловато — рано делать выводы. Добавьте несколько обычных трат, и разбор будет мягче и точнее."
        : "Too few weekly entries yet — add a few everyday expenses before we draw conclusions.",
    ];
  }

  return [];
}

export const WEEKLY_ANALYSIS_PROMPT = (
  summary: WeeklySummary,
  locale: Locale,
  advisor: AdvisorConfig,
  coaching?: AiCoachingContext | null,
) => {
  const lang = locale === "ru" ? "Russian" : "English";
  const limited = summary.weekTransactionCount < 8;

  return `
You are a calm financial mentor. Weekly review for ${formatIsoPeriod(summary.periodStart, summary.periodEnd, locale)}.

Data (JSON):
${JSON.stringify(
  {
    daysTracked: summary.daysTracked,
    transactionCount: summary.transactionCount,
    weekTransactionCount: summary.weekTransactionCount,
    totalExpense: summary.totalExpense,
    expenseByCategory: summary.expenseByCategory,
    categoryChanges: summary.categoryChanges,
    monthlyExpenses: summary.monthlyExpenses,
    firstDate: summary.firstDate,
    lastDate: summary.lastDate,
    currency: summary.currency,
    periodStart: summary.periodStart,
    periodEnd: summary.periodEnd,
  },
  null,
  2,
)}

Critical rules:
- Respond in ${lang}.
- Return ONLY JSON: { "tips": string[] }
- Give ${limited ? "2–3" : "4–5"} tips only.
- Tone: warm, zero shame, zero lecturing. User is learning to track money, not failing a test.
- ${limited ? "Data is LIMITED — say that explicitly. Do NOT invent patterns. No dramatic warnings." : "Use real numbers from data."}
- Weekly review must focus on expenses only: totalExpense, expenseByCategory, transactionCount, habits, and one small action for next week.
- categoryChanges compares the latest 7 days with the previous 7 days. If a category rose meaningfully, explain the likely reason as a question/check, not a verdict.
- Do NOT calculate or comment on income minus expenses in the weekly review. Do NOT mention "balance", "баланс", "итог периода", or negative cash flow.
- Mention income only if it is directly useful as context, never as a verdict.
- Never scold for one big expense — suggest one small next step.
- Do NOT tell user to cut everything; max one gentle limit idea.
- Russia context: RUB, optional mention of subscriptions/inflation — no tax/legal advice.
- Do not add advisor contacts, Telegram handles, sales phrases, or consultation invitations in the weekly report.
${coaching ? coachingPromptBlock(coaching, locale) : ""}
`;
};

export const WEEKLY_CHAT_SYSTEM = (
  summary: WeeklySummary,
  reportTips: string[],
  locale: Locale,
  coaching?: AiCoachingContext | null,
) => {
  const lang = locale === "ru" ? "Russian" : "English";

  return `
You are the in-app financial advisor for a weekly budget review.

Respond in ${lang}.
Use only the user's weekly data below. If data is not enough, say that clearly and give a small next step.
Keep answers short: 3-6 sentences or up to 4 bullets.
Tone: calm, practical, no shame, no pressure.
Focus on expenses, category growth, repeated habits, and one realistic action for the next 7 days.
Do not give legal, tax, investment, medical, or debt-collection advice.
Do not ask the user to contact anyone outside the app.

Weekly data:
${JSON.stringify(
  {
    daysTracked: summary.daysTracked,
    weekTransactionCount: summary.weekTransactionCount,
    totalExpense: summary.totalExpense,
    expenseByCategory: summary.expenseByCategory,
    categoryChanges: summary.categoryChanges,
    currency: summary.currency,
    periodStart: summary.periodStart,
    periodEnd: summary.periodEnd,
    reportTips,
  },
  null,
  2,
)}

${coaching ? coachingPromptBlock(coaching, locale) : ""}
`;
};

export function ruleBasedWeeklyAnalysis(
  summary: WeeklySummary,
  locale: Locale,
  advisor: AdvisorConfig,
): string[] {
  const isRu = locale === "ru";
  const topGrowth = summary.categoryChanges.find((row) => row.deltaAmount >= 500);

  const tips = [
    isRu
      ? `За 7 дней записано расходов на ${summary.totalExpense.toLocaleString("ru-RU")} ₽. Это снимок привычек, не оценка — продолжайте вести учёт.`
      : `7 days: ${summary.totalExpense} in expenses logged. A snapshot of habits, not a verdict — keep logging.`,
  ];

  if (topGrowth) {
    tips.push(
      isRu
        ? `«${topGrowth.category}» выросла на ${topGrowth.deltaAmount.toLocaleString("ru-RU")} ₽ к прошлой неделе. Проверьте: это разовая покупка, рост цен или категория начала повторяться чаще?`
        : `${topGrowth.category} rose by ${topGrowth.deltaAmount} RUB versus last week. Check whether it was one-off, price growth, or repeated spending.`,
    );
  }

  tips.push(
    isRu
      ? "На следующей неделе картина станет яснее — главное не бросать записи."
      : "Next week the picture will be clearer — keep logging.",
  );

  return tips;
}

export function weeklyAdvisorQuestions(summary: WeeklySummary, locale: Locale): string[] {
  const top = summary.expenseByCategory[0]?.category;
  const growth = summary.categoryChanges[0];

  if (locale === "ru") {
    return [
      top
        ? `Почему у меня больше всего трат в категории «${top}» и что можно сделать без жёсткой экономии?`
        : "Какая трата за неделю сильнее всего влияет на мой бюджет?",
      growth
        ? `Почему выросли траты в категории «${growth.category}» по сравнению с прошлой неделей?`
        : "Какая категория начинает расти и за чем стоит понаблюдать?",
      "Какой один небольшой шаг на следующую неделю даст самый заметный эффект?",
    ];
  }

  return [
    top
      ? `Why is ${top} my largest spending category, and what can I do without harsh cuts?`
      : "Which weekly expense affects my budget the most?",
    growth
      ? `Why did ${growth.category} grow compared with last week?`
      : "Which category is starting to grow and should I watch?",
    "What one small step next week would have the biggest effect?",
  ];
}

import type { AdvisorConfig } from "@/lib/advisor-config";
import { advisorBookConsultRu, advisorPlanningWithRu } from "@/lib/advisor-config";
import type { BudgetSummary } from "@/lib/budget-analytics";
import type { Locale } from "@/types";

export const RECOMMENDATIONS_PROMPT = (
  summary: BudgetSummary,
  locale: Locale,
  advisor: AdvisorConfig,
) => {
  const lang = locale === "ru" ? "Russian" : "English";
  const rfBlock =
    locale === "ru"
      ? `
Контекст РФ (обязательно учитывай в советах):
- доходы и расходы в рублях, инфляция и рост цен на продукты/ЖКХ;
- подписки (связь, стриминги), маркетплейсы, такси/каршеринг;
- подушка безопасности 3–6 месяцев расходов, вклады/накопительные счета в российских банках;
- не давай юридических/налоговых инструкций — только общие финансовые практики.
`
      : `
Russia context (factor into advice):
- RUB income/expenses, inflation, utilities and food price pressure;
- local subscriptions, marketplaces, taxi/carsharing;
- 3–6 month emergency fund, savings in Russian banks;
- no legal/tax instructions — general financial practices only.
`;

  return `
You are a senior personal financial advisor with 20+ years of experience.
You analyze household budgets for clients in Russia and give practical, calm, expert guidance.

Client budget (${summary.daysTracked} days of tracking):
${JSON.stringify(summary, null, 2)}

${rfBlock}

Output rules:
- Respond in ${lang}.
- Return ONLY valid JSON: { "tips": string[] }
- Provide 5–7 tips as complete sentences.
- Use real category names and amounts from the data.
- Prioritize: cash-flow balance, cutting the top expense categories, monthly limits, savings rate, emergency fund.
- If expenses > 70% of income — flag clearly and suggest concrete % cuts by category.
- The LAST tip MUST invite the user to book a personal consultation (Russian: «${advisorBookConsultRu(advisor)}»; English: contact ${advisor.name} via ${advisor.contact}).
  Phrase it warmly: automated analysis is a start, deeper plan needs a 1:1 call.
- Tone: experienced mentor, supportive, no shame.
`;
};

export function ruleBasedRecommendations(
  summary: BudgetSummary,
  locale: Locale,
  advisor: AdvisorConfig,
): string[] {
  const tips: string[] = [];
  const isRu = locale === "ru";

  if (summary.transactionCount === 0) {
    return [
      isRu
        ? "Добавляйте каждую трату — через месяц появится персональный AI-анализ."
        : "Log every expense — after a month you'll get personalized AI insights.",
    ];
  }

  if (summary.totalIncome > 0 && summary.totalExpense / summary.totalIncome > 0.7) {
    tips.push(
      isRu
        ? "Расходы превышают 70% дохода — в условиях РФ это высокий риск. Сократите импульсные траты и подписки на 10–15% уже в этом месяце."
        : "Expenses exceed 70% of income — high risk. Trim impulse spending and subscriptions by 10–15% this month.",
    );
  }

  const top = summary.expenseByCategory[0];
  if (top && top.sharePercent >= 35) {
    tips.push(
      isRu
        ? `«${top.category}» — ${top.sharePercent}% бюджета (${top.amount} ${summary.currency}). Задайте жёсткий месячный лимит и отслеживайте еженедельно.`
        : `"${top.category}" is ${top.sharePercent}% of spending (${top.amount} ${summary.currency}). Set a strict monthly cap.`,
    );
  }

  if (summary.balance < 0) {
    tips.push(
      isRu
        ? "Отрицательный баланс за период — сформируйте подушку хотя бы на 1 месяц расходов, отложив фиксированную сумму в день зарплаты."
        : "Negative balance — build a 1-month emergency buffer with a fixed transfer on payday.",
    );
  }

  if (summary.monthlyExpenses.length >= 2) {
    const last = summary.monthlyExpenses[summary.monthlyExpenses.length - 1];
    const prev = summary.monthlyExpenses[summary.monthlyExpenses.length - 2];
    if (last.amount > prev.amount * 1.1) {
      tips.push(
        isRu
          ? `Расходы выросли (${prev.month} → ${last.month}). Проверьте автоплатежи, маркетплейсы и мелкие ежедневные покупки.`
          : `Spending rose (${prev.month} → ${last.month}). Review autopayments and daily small purchases.`,
      );
    }
  }

  if (tips.length < 3) {
    tips.push(
      isRu
        ? "Правило 50/30/20 адаптируйте под РФ: обязательные расходы / желания / накопления. Начните с 10% на накопления, если сейчас 0%."
        : "Adapt 50/30/20: needs / wants / savings. Start with 10% to savings if currently zero.",
    );
  }

  tips.push(
    isRu
      ? `Это автоматический обзор. Для персонального плана (цели, долги, инвестиции) ${advisorBookConsultRu(advisor)}.`
      : `This is an automated overview. For a personal plan, book a consultation with ${advisor.name}: ${advisor.contact}.`,
  );

  return tips;
}

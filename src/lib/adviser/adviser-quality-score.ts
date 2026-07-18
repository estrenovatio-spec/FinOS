import type { AdvisorFinancialContext } from "@/lib/advisor-context";
import type { AdvisorQuestionType } from "@/lib/ai/question-classifier";

export type AdviserQualityDimension = "accuracy" | "causality" | "actionability" | "safety";

export type AdviserQualityScorecard = {
  accuracy: number;
  causality: number;
  actionability: number;
  safety: number;
  total: number;
};

export type AdviserQualityScoreInput = {
  questionType: AdvisorQuestionType;
  answer: string;
  financialContext: AdvisorFinancialContext;
  purchaseAmountRub?: number | null;
  issues: string[];
};

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е");
}

function uniqueRoundedAmounts(values: Array<number | null | undefined>): number[] {
  return [...new Set(values.filter((value): value is number => Number.isFinite(value)).map((value) => Math.round(value)))];
}

function formatAmountVariants(amount: number): string[] {
  const rounded = Math.round(amount);
  const base = new Intl.NumberFormat("ru-RU").format(rounded);
  const nbsp = base.replace(/\s/g, "\u00a0");
  return [String(rounded), base, nbsp];
}

function answerMentionsAmount(answer: string, amount: number): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  return formatAmountVariants(amount).some((variant) => answer.includes(variant));
}

function buildKnownFinancialAmounts(input: AdviserQualityScoreInput): number[] {
  const recurringIncomeTotal = input.financialContext.incomes.recurring.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const oneOffIncomeTotal = input.financialContext.incomes.oneOff.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const largestRecurringExpense = [...input.financialContext.expenses.recurring]
    .sort((left, right) => right.amount - left.amount)[0]?.amount;
  const derivedPurchaseGap =
    input.purchaseAmountRub != null
      ? Math.max(
          Math.round(input.purchaseAmountRub - input.financialContext.balances.plannedFreeMoney),
          0,
        )
      : null;

  return uniqueRoundedAmounts([
    input.financialContext.balances.currentBalance,
    input.financialContext.balances.plannedFreeMoney,
    input.financialContext.incomes.currentPeriodTotal,
    input.financialContext.incomes.expectedTotal,
    input.financialContext.incomes.confirmedTotal,
    recurringIncomeTotal,
    oneOffIncomeTotal,
    input.financialContext.expenses.recurringTotal,
    input.financialContext.expenses.plannedBudgetsTotal,
    input.financialContext.expenses.debtPaymentsTotal,
    input.financialContext.expenses.otherMandatoryPaymentsTotal,
    input.financialContext.monthly.income,
    input.financialContext.monthly.expenses,
    input.purchaseAmountRub ?? null,
    derivedPurchaseGap,
    largestRecurringExpense ?? null,
  ]);
}

function issuePenalty(issue: string): Partial<Record<AdviserQualityDimension, number>> {
  switch (issue) {
    case "answer_claims_no_income_despite_expected_income":
      return { accuracy: 40, causality: 10 };
    case "answer_skips_expected_income":
      return { accuracy: 18 };
    case "answer_skips_confirmed_income_state":
      return { accuracy: 14 };
    case "answer_has_no_ruble_amounts":
      return { accuracy: 18, actionability: 10 };
    case "answer_uses_forbidden_phrase":
      return { accuracy: 10, causality: 8, safety: 12 };
    case "purchase_answer_uses_generic_credit_advice":
      return { safety: 40, actionability: 10 };
    case "purchase_answer_lacks_plan_impact":
      return { causality: 22, actionability: 20 };
    case "goal_answer_does_not_request_missing_inputs":
      return { actionability: 18, safety: 12 };
    case "cash_gap_answer_skips_risk_date":
      return { accuracy: 14, causality: 12 };
    case "cash_gap_answer_skips_forecast_reasoning":
      return { causality: 24, actionability: 8 };
    case "investing_answer_skips_time_horizon":
      return { safety: 16, actionability: 8 };
    case "investing_answer_skips_goal":
      return { safety: 16, actionability: 8 };
    case "investing_answer_skips_risk":
      return { safety: 18, actionability: 8 };
    case "debt_answer_skips_priority_logic":
      return { causality: 20, actionability: 16 };
    case "answer_uses_generic_advice_without_financial_cause":
      return { accuracy: 12, causality: 38, actionability: 24 };
    case "answer_actions_are_not_tied_to_user_context":
      return { actionability: 26 };
    case "answer_offers_unsafe_borrowing_without_budget_case":
      return { safety: 45 };
    case "answer_gives_investment_recommendation_without_user_inputs":
      return { safety: 35, actionability: 10 };
    case "answer_confuses_expected_and_confirmed_money":
      return { accuracy: 28, safety: 8 };
    default:
      return {};
  }
}

export function scoreAdvisorQuality(input: AdviserQualityScoreInput): AdviserQualityScorecard {
  const normalizedAnswer = normalizeText(input.answer);
  const scores: AdviserQualityScorecard = {
    accuracy: 100,
    causality: 100,
    actionability: 100,
    safety: 100,
    total: 100,
  };

  for (const issue of input.issues) {
    const penalties = issuePenalty(issue);
    if (penalties.accuracy) scores.accuracy -= penalties.accuracy;
    if (penalties.causality) scores.causality -= penalties.causality;
    if (penalties.actionability) scores.actionability -= penalties.actionability;
    if (penalties.safety) scores.safety -= penalties.safety;
  }

  const knownAmounts = buildKnownFinancialAmounts(input);
  const mentionsKnownAmount = knownAmounts.some((amount) => answerMentionsAmount(input.answer, amount));
  if (!mentionsKnownAmount && /\d[\d\s\u00a0.,]*\s*₽/.test(input.answer)) {
    scores.accuracy -= 8;
  }

  const hasFinancialCause =
    /потому|из-за|основн(ая|ая причина|ой)|главн(ая|ый фактор)|влияет|из них|сильнее всего/.test(
      normalizedAnswer,
    ) &&
    /доход|платеж|аренд|долг|лимит|расход|дефицит|прогноз|цель|баланс/.test(normalizedAnswer);
  if (!hasFinancialCause) {
    scores.causality -= 18;
  }

  const hasConcreteAction =
    /(1\.|2\.|3\.)/.test(input.answer) ||
    /сначала|первым делом|до \d{4}-\d{2}-\d{2}|проверьте|сдвиньте|подтвердите|перенесите|сократите .*на|отложите .*на/.test(
      normalizedAnswer,
    );
  if (!hasConcreteAction) {
    scores.actionability -= 14;
  }

  const genericAdviceWithoutContext =
    /(больше зарабатывайте|меньше тратьте|ведите бюджет|просто экономьте|сократите расходы)/.test(
      normalizedAnswer,
    ) && !mentionsKnownAmount;
  if (genericAdviceWithoutContext) {
    scores.causality -= 24;
    scores.actionability -= 22;
  }

  const unsafeBorrowing =
    /(кредит|займ|одолжите|ипотек)/.test(normalizedAnswer) &&
    !/разрыв|не хватает|кассов|дефицит|бюджет|платеж/.test(normalizedAnswer);
  if (unsafeBorrowing) {
    scores.safety -= 34;
  }

  const directInvestmentRecommendation =
    /(вложите|инвестируйте|купите акции|купите облигац|etf|индексный фонд|вклад)/.test(
      normalizedAnswer,
    ) &&
    !/срок|цель|риск/.test(normalizedAnswer);
  if (directInvestmentRecommendation) {
    scores.safety -= 28;
  }

  const confusesExpectedAndConfirmed =
    input.financialContext.incomes.expectedTotal > 0 &&
    input.financialContext.incomes.confirmedTotal === 0 &&
    /деньги уже есть|доход уже пришел|доход подтвержден/.test(normalizedAnswer);
  if (confusesExpectedAndConfirmed) {
    scores.accuracy -= 24;
  }

  scores.accuracy = Math.max(0, Math.min(100, scores.accuracy));
  scores.causality = Math.max(0, Math.min(100, scores.causality));
  scores.actionability = Math.max(0, Math.min(100, scores.actionability));
  scores.safety = Math.max(0, Math.min(100, scores.safety));
  scores.total = Math.round(
    scores.accuracy * 0.35 +
      scores.causality * 0.25 +
      scores.actionability * 0.2 +
      scores.safety * 0.2,
  );

  return scores;
}

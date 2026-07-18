import type { AdvisorFinancialContext } from "@/lib/advisor-context";
import type { AdvisorQuestionType } from "@/lib/ai/question-classifier";

export type AdvisorEvaluationInput = {
  question: string;
  questionType: AdvisorQuestionType;
  answer: string;
  financialContext: AdvisorFinancialContext;
  purchaseAmountRub?: number | null;
};

export type AdvisorEvaluationResult = {
  ok: boolean;
  issues: string[];
  usedFacts: {
    hasAnyAmount: boolean;
    mentionsIncome: boolean;
    mentionsRecurringPayments: boolean;
    mentionsGoals: boolean;
    mentionsForecastOrRisk: boolean;
    mentionsExpectedIncome: boolean;
  };
};

const FORBIDDEN_PHRASES = [/у вас нет доходов/i, /вам точно хватит/i, /гарантированно/i];

const GENERIC_CREDIT_PHRASES = [
  /возьмите кредит/i,
  /рассмотрите ипотеку/i,
  /одолжите/i,
  /займ/i,
];

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е");
}

function hasRubAmount(text: string): boolean {
  return /\d[\d\s\u00a0.,]*\s*₽/.test(text);
}

function formatRubVariants(amount: number): string[] {
  const rounded = Math.round(amount);
  const base = new Intl.NumberFormat("ru-RU").format(rounded);
  const nbsp = base.replace(/\s/g, "\u00a0");
  return [base, nbsp, String(rounded)];
}

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function evaluateIncomeQuestion(input: AdvisorEvaluationInput, issues: string[]) {
  const normalizedAnswer = normalizeText(input.answer);
  if (input.financialContext.incomes.currentPeriodTotal > 0 && /нет доходов/i.test(normalizedAnswer)) {
    issues.push("answer_claims_no_income_despite_expected_income");
  }
  if (input.financialContext.incomes.expectedTotal > 0 && !/ожида/.test(normalizedAnswer)) {
    issues.push("answer_skips_expected_income");
  }
  if (
    input.financialContext.incomes.confirmedTotal > 0
    && !/подтверж|получен|пришел/.test(normalizedAnswer)
  ) {
    issues.push("answer_skips_confirmed_income_state");
  }
}

function evaluatePurchaseQuestion(input: AdvisorEvaluationInput, issues: string[]) {
  const normalizedAnswer = normalizeText(input.answer);
  if (includesAny(normalizedAnswer, GENERIC_CREDIT_PHRASES)) {
    issues.push("purchase_answer_uses_generic_credit_advice");
  }
  if (!/не хватает|разрыв|свободн|платеж|цель|стоимост/.test(normalizedAnswer)) {
    issues.push("purchase_answer_lacks_plan_impact");
  }
}

function evaluateGoalQuestion(input: AdvisorEvaluationInput, issues: string[]) {
  const normalizedAnswer = normalizeText(input.answer);
  if (!/\?/.test(input.answer) && !/срок|когда|за сколько/.test(normalizedAnswer)) {
    issues.push("goal_answer_does_not_request_missing_inputs");
  }
}

function evaluateCashGapQuestion(input: AdvisorEvaluationInput, issues: string[]) {
  const normalizedAnswer = normalizeText(input.answer);
  if (
    input.financialContext.forecast.firstDeficitDate
    && !normalizedAnswer.includes(input.financialContext.forecast.firstDeficitDate)
  ) {
    issues.push("cash_gap_answer_skips_risk_date");
  }
  if (!/платеж|риск|прогноз|дефицит|задерж/.test(normalizedAnswer)) {
    issues.push("cash_gap_answer_skips_forecast_reasoning");
  }
}

function evaluateInvestingQuestion(input: AdvisorEvaluationInput, issues: string[]) {
  const normalizedAnswer = normalizeText(input.answer);
  if (!/срок/.test(normalizedAnswer)) issues.push("investing_answer_skips_time_horizon");
  if (!/цель/.test(normalizedAnswer)) issues.push("investing_answer_skips_goal");
  if (!/риск/.test(normalizedAnswer)) issues.push("investing_answer_skips_risk");
}

export function evaluateAdvisorAnswer(input: AdvisorEvaluationInput): AdvisorEvaluationResult {
  const normalizedAnswer = normalizeText(input.answer);
  const issues: string[] = [];

  if (includesAny(normalizedAnswer, FORBIDDEN_PHRASES)) {
    issues.push("answer_uses_forbidden_phrase");
  }
  if (!hasRubAmount(input.answer)) {
    issues.push("answer_has_no_ruble_amounts");
  }

  switch (input.questionType) {
    case "income_review":
    case "expense_control":
      evaluateIncomeQuestion(input, issues);
      break;
    case "purchase_decision":
      evaluatePurchaseQuestion(input, issues);
      break;
    case "goal_planning":
    case "saving_plan":
      evaluateGoalQuestion(input, issues);
      break;
    case "forecast_check":
    case "cashflow_delay":
      evaluateCashGapQuestion(input, issues);
      break;
    case "investment":
      evaluateInvestingQuestion(input, issues);
      break;
    case "debt_strategy":
      if (!/долг|платеж|приоритет|закрыва/.test(normalizedAnswer)) {
        issues.push("debt_answer_skips_priority_logic");
      }
      break;
    default:
      break;
  }

  return {
    ok: issues.length === 0,
    issues,
    usedFacts: {
      hasAnyAmount: hasRubAmount(input.answer),
      mentionsIncome: /доход|зарплат|поступл|пришел|получен/.test(normalizedAnswer),
      mentionsRecurringPayments: /регуляр|аренд|платеж/.test(normalizedAnswer),
      mentionsGoals: /цель|накоп|дом|машин/.test(normalizedAnswer),
      mentionsForecastOrRisk: /прогноз|риск|дефицит|не хватает/.test(normalizedAnswer),
      mentionsExpectedIncome: /ожида/.test(normalizedAnswer),
    },
  };
}

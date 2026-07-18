import type { AdvisorFinancialContext } from "@/lib/advisor-context";
import { buildFinancialAdviserBrief, type FinancialAdviserBrief } from "@/lib/adviser/financial-analysis-engine";
import type { DecisionCoreState } from "@/lib/decision-core";

export type AdvisorQuestionType =
  | "cashflow_delay"
  | "purchase_decision"
  | "debt_strategy"
  | "saving_plan"
  | "investment"
  | "expense_control"
  | "income_review"
  | "goal_planning"
  | "forecast_check"
  | "other";

export type PurchaseKind =
  | "car"
  | "home"
  | "apartment"
  | "land"
  | "boat"
  | "large_purchase"
  | null;

export type AdvisorQuestionClassification = {
  type: AdvisorQuestionType;
  purchaseKind: PurchaseKind;
  amountRub: number | null;
  delayDays: number | null;
  needsClarification: boolean;
  clarificationQuestions: string[];
  emotionalTone: boolean;
};

export type AdvisorQuestionBrief = {
  classification: AdvisorQuestionClassification;
  promptGuide: string | null;
  financialBrief: FinancialAdviserBrief | null;
};

function normalizeQuestion(question: string): string {
  return question.toLowerCase().replace(/ё/g, "е");
}

function detectEmotionalTone(question: string): boolean {
  return /(провалил|ужас|паник|страш|стыд|не справляюсь|опять все плохо|я опять все провалил)/i.test(
    normalizeQuestion(question),
  );
}

function parseNumericAmount(fragment: string): number | null {
  const normalized = fragment.replace(/\u00a0/g, " ").replace(/\s+/g, "").replace(/,/g, ".");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function extractQuestionAmountRub(question: string): number | null {
  const lower = normalizeQuestion(question);

  const millionMatch = lower.match(/(\d[\d\s.,]*)\s*(млн|миллион)/i);
  if (millionMatch) {
    const value = parseNumericAmount(millionMatch[1] ?? "");
    return value == null ? null : Math.round(value * 1_000_000);
  }

  const thousandMatch = lower.match(/(\d[\d\s.,]*)\s*(тыс|тысяч)/i);
  if (thousandMatch) {
    const value = parseNumericAmount(thousandMatch[1] ?? "");
    return value == null ? null : Math.round(value * 1_000);
  }

  const rubMatch = lower.match(/(\d[\d\s]{2,}\d|\d+)(?:\s*₽|\s*руб|\s*rub)?/i);
  if (rubMatch) {
    return Math.round(parseNumericAmount(rubMatch[1] ?? "") ?? 0) || null;
  }

  return null;
}

function extractDelayDays(question: string): number | null {
  const lower = normalizeQuestion(question);
  if (/(на неделю|недел[юи])/.test(lower)) return 7;
  const daysMatch = lower.match(/на\s+(\d+)\s*(дн|день|дня|дней)/);
  if (daysMatch) {
    const value = Number(daysMatch[1]);
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  return null;
}

function detectPurchaseKind(question: string): PurchaseKind {
  const lower = normalizeQuestion(question);
  if (/(машин|авто|автомобил)/i.test(lower)) return "car";
  if (/(дом|коттедж|таунхаус)/i.test(lower)) return "home";
  if (/(квартир|апартамент)/i.test(lower)) return "apartment";
  if (/(участок|земл)/i.test(lower)) return "land";
  if (/(лодк|катер|яхт)/i.test(lower)) return "boat";
  if (/(купить|покупк|взять)/i.test(lower)) return "large_purchase";
  return null;
}

function buildClarificationQuestions(kind: PurchaseKind, locale: "ru" | "en"): string[] {
  if (locale !== "ru") {
    return [
      "By when do you want to make this purchase?",
      "Would you buy with cash or financing?",
      "Do you already have money set aside for it?",
    ];
  }

  switch (kind) {
    case "home":
    case "apartment":
      return [
        "За сколько лет хотите купить?",
        "Будете использовать ипотеку или только свои деньги?",
        "Есть ли уже первоначальный взнос?",
      ];
    case "car":
      return [
        "Когда хотите купить машину?",
        "Рассматриваете покупку за наличные или в кредит?",
        "Есть ли уже отдельные накопления на машину?",
      ];
    default:
      return [
        "Когда хотите сделать эту покупку?",
        "Планируете оплатить своими деньгами или частями?",
        "Есть ли уже отдельные накопления на эту цель?",
      ];
  }
}

export function classifyAdvisorQuestion(
  question: string,
  locale: "ru" | "en" = "ru",
): AdvisorQuestionClassification {
  const lower = normalizeQuestion(question);
  const purchaseKind = detectPurchaseKind(lower);
  const amountRub = extractQuestionAmountRub(question);
  const delayDays = extractDelayDays(question);
  const emotionalTone = detectEmotionalTone(question);

  if (/(если|что будет если|задерж|не придет|не придёт|потеряю работу)/i.test(lower) && delayDays != null) {
    return {
      type: "cashflow_delay",
      purchaseKind: null,
      amountRub,
      delayDays,
      needsClarification: false,
      clarificationQuestions: [],
      emotionalTone,
    };
  }

  if (purchaseKind != null && /(можно|потяну|купить|покупк|взять)/i.test(lower)) {
    return {
      type: "purchase_decision",
      purchaseKind,
      amountRub,
      delayDays: null,
      needsClarification: true,
      clarificationQuestions: buildClarificationQuestions(purchaseKind, locale),
      emotionalTone,
    };
  }

  if (/(долг|долги|кредит|ипотек|жкх|закрыть долги)/i.test(lower)) {
    return {
      type: "debt_strategy",
      purchaseKind: null,
      amountRub,
      delayDays: null,
      needsClarification: false,
      clarificationQuestions: [],
      emotionalTone,
    };
  }

  if (/(накоп|отлож|сбер|копить|миллион|капитал)/i.test(lower)) {
    return {
      type: "saving_plan",
      purchaseKind: null,
      amountRub,
      delayDays: null,
      needsClarification: false,
      clarificationQuestions: [],
      emotionalTone,
    };
  }

  if (/(инвест|облигац|акци|вклад|вложить)/i.test(lower)) {
    return {
      type: "investment",
      purchaseKind: null,
      amountRub,
      delayDays: null,
      needsClarification: false,
      clarificationQuestions: [],
      emotionalTone,
    };
  }

  if (/(трат|расход|дорог|эконом|ужат|нет денег|не хватает денег|почему денег не хватает)/i.test(lower)) {
    return {
      type: "expense_control",
      purchaseKind: null,
      amountRub,
      delayDays: null,
      needsClarification: false,
      clarificationQuestions: [],
      emotionalTone,
    };
  }

  if (/(доход|зарплат|поступл|пришл|пришло)/i.test(lower)) {
    return {
      type: "income_review",
      purchaseKind: null,
      amountRub,
      delayDays,
      needsClarification: false,
      clarificationQuestions: [],
      emotionalTone,
    };
  }

  if (/(цел|мечт|когда куплю|когда смогу купить)/i.test(lower)) {
    return {
      type: "goal_planning",
      purchaseKind,
      amountRub,
      delayDays: null,
      needsClarification: false,
      clarificationQuestions: [],
      emotionalTone,
    };
  }

  if (/(прогноз|хватит|дефицит|риск|что будет)/i.test(lower)) {
    return {
      type: "forecast_check",
      purchaseKind,
      amountRub,
      delayDays,
      needsClarification: false,
      clarificationQuestions: [],
      emotionalTone,
    };
  }

  return {
    type: "other",
    purchaseKind: null,
    amountRub,
    delayDays,
    needsClarification: false,
    clarificationQuestions: [],
    emotionalTone,
  };
}

function buildPromptGuideFromBrief(brief: FinancialAdviserBrief, locale: "ru" | "en"): string {
  if (locale !== "ru") {
    return [
      "Use the prepared FIN OS adviser brief instead of generic advice.",
      `Headline: ${brief.summary.headline}`,
      ...brief.evidence.map((line) => `- ${line}`),
    ].join("\n");
  }

  const missingInputs =
    brief.missingInputs.length > 0
      ? ["Сначала уточни недостающие данные:", ...brief.missingInputs.map((line, index) => `${index + 1}. ${line}`)]
      : [];

  const actions =
    brief.recommendedActions.length > 0
      ? [
          "Приоритет действий:",
          ...brief.recommendedActions.map(
            (action) => `${action.priority}. ${action.reason}`,
          ),
        ]
      : [];

  return [
    "Ниже уже подготовлен финансовый разбор FIN OS. Используй его как источник истины.",
    `Итог анализа: ${brief.summary.headline}`,
    "Факты:",
    ...brief.evidence.map((line) => `- ${line}`),
    ...missingInputs,
    ...actions,
    "Не давай совет про заёмные деньги, если в анализе нет явного отрицательного баланса и не исчерпаны более безопасные шаги.",
  ].join("\n");
}

function clampPromptGuide(value: string | null): string | null {
  if (!value) return value;
  return value.length <= 3900 ? value : `${value.slice(0, 3897)}...`;
}

export function buildAdvisorQuestionBrief(args: {
  locale: "ru" | "en";
  question: string;
  state: DecisionCoreState;
  plannedFreeMoneyAmount: number;
  financialContext?: AdvisorFinancialContext;
}): AdvisorQuestionBrief {
  const classification = classifyAdvisorQuestion(args.question, args.locale);

  if (!args.financialContext) {
    return {
      classification,
      promptGuide:
        args.locale === "ru"
          ? "Отвечай только по данным FIN OS, опирайся на суммы и даты, не давай общих советов."
          : "Answer only from FIN OS data using real amounts and dates.",
      financialBrief: null,
    };
  }

  const financialBrief = buildFinancialAdviserBrief({
    question: args.question,
    classification,
    state: args.state,
    financialContext: args.financialContext,
  });

  return {
    classification,
    promptGuide: clampPromptGuide(buildPromptGuideFromBrief(financialBrief, args.locale)),
    financialBrief,
  };
}

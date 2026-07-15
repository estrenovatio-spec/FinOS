import type { DecisionCoreState } from "@/lib/decision-core";
import { evaluateFinancialScenario } from "@/lib/scenarios";

export type AdvisorQuestionType =
  | "purchase"
  | "saving"
  | "investing"
  | "expenses"
  | "income"
  | "goals"
  | "forecast"
  | "scenarios"
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
  needsClarification: boolean;
  clarificationQuestions: string[];
};

export type AdvisorQuestionBrief = {
  classification: AdvisorQuestionClassification;
  promptGuide: string | null;
};

function normalizeQuestion(question: string): string {
  return question.toLowerCase().replace(/ё/g, "е");
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

  if (purchaseKind != null) {
    return {
      type: "purchase",
      purchaseKind,
      amountRub,
      needsClarification: true,
      clarificationQuestions: buildClarificationQuestions(purchaseKind, locale),
    };
  }

  if (/(накоп|отлож|сбер|копить)/i.test(lower)) {
    return {
      type: "saving",
      purchaseKind: null,
      amountRub,
      needsClarification: false,
      clarificationQuestions: [],
    };
  }

  if (/(инвест|облигац|акци|вклад)/i.test(lower)) {
    return {
      type: "investing",
      purchaseKind: null,
      amountRub,
      needsClarification: false,
      clarificationQuestions: [],
    };
  }

  if (/(трат|расход|дорог|эконом|ужат)/i.test(lower)) {
    return {
      type: "expenses",
      purchaseKind: null,
      amountRub,
      needsClarification: false,
      clarificationQuestions: [],
    };
  }

  if (/(доход|зарплат|поступл)/i.test(lower)) {
    return {
      type: "income",
      purchaseKind: null,
      amountRub,
      needsClarification: false,
      clarificationQuestions: [],
    };
  }

  if (/(цел|мечт|дом|машин)/i.test(lower)) {
    return {
      type: "goals",
      purchaseKind,
      amountRub,
      needsClarification: false,
      clarificationQuestions: [],
    };
  }

  if (/(прогноз|что будет|хватит|дефицит|риск)/i.test(lower)) {
    return {
      type: "forecast",
      purchaseKind: null,
      amountRub,
      needsClarification: false,
      clarificationQuestions: [],
    };
  }

  if (/(сценар|смодел|если купл|если доход задерж)/i.test(lower)) {
    return {
      type: "scenarios",
      purchaseKind,
      amountRub,
      needsClarification: false,
      clarificationQuestions: [],
    };
  }

  return {
    type: "other",
    purchaseKind: null,
    amountRub,
    needsClarification: false,
    clarificationQuestions: [],
  };
}

function formatRub(amount: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(Math.round(amount))} ₽`;
}

function buildPurchaseGuide(args: {
  locale: "ru" | "en";
  question: string;
  state: DecisionCoreState;
  plannedFreeMoneyAmount: number;
}) {
  const classification = classifyAdvisorQuestion(args.question, args.locale);
  const amount = classification.amountRub;
  if (classification.type !== "purchase" || amount == null) {
    return { classification, promptGuide: null };
  }

  const scenario = evaluateFinancialScenario(args.state, {
    type: "one_off_expense",
    amount,
    date: args.state.today,
    title: "Сценарий крупной покупки",
  });
  const freeMoney = Math.max(0, Math.round(args.plannedFreeMoneyAmount));
  const gap = Math.max(0, amount - freeMoney);
  const clarificationBlock = classification.clarificationQuestions.map((q, index) => `${index + 1}. ${q}`);

  if (args.locale === "ru") {
    return {
      classification,
      promptGuide: [
        "Вопрос относится к крупной покупке. Отвечай как личный финансовый консультант, а не как общий чат-бот.",
        "Нельзя советовать кредит, ипотеку, вторую работу или просто увеличить доход, если это не подтверждено расчётом FIN OS.",
        "Опирайся на эти готовые расчёты FIN OS и не пересчитывай их заново:",
        `- Стоимость цели: ${formatRub(amount)}`,
        `- Сейчас можно направить без поломки плана: ${formatRub(freeMoney)}`,
        `- Финансовый разрыв: ${formatRub(gap)}`,
        `- Если купить сейчас, свободные деньги станут: ${formatRub(Math.max(0, scenario.scenario.plannedFreeMoney))}`,
        scenario.scenario.firstDeficitDate
          ? `- После такой покупки дефицит появится ${scenario.scenario.firstDeficitDate}`
          : "- После такой покупки на текущем горизонте дефицит не появляется",
        "Если пользователь не назвал срок, формат оплаты или первый взнос, сначала задай 2–3 уточняющих вопроса.",
        "Используй именно эти вопросы:",
        ...clarificationBlock,
        "После анализа обязательно предложи построить план покупки и смоделировать её в сценарии FIN OS.",
      ].join("\n"),
    };
  }

  return {
    classification,
    promptGuide: [
      "This question is about a major purchase. Act like a personal financial consultant, not a generic chatbot.",
      "Do not suggest loans, a second job, or simply increasing income unless the FIN OS calculations support it.",
      "Use these ready FIN OS calculations and do not recalculate them:",
      `- Target cost: ${formatRub(amount)}`,
      `- Available without breaking the plan: ${formatRub(freeMoney)}`,
      `- Financial gap: ${formatRub(gap)}`,
      `- If bought now, free money becomes: ${formatRub(Math.max(0, scenario.scenario.plannedFreeMoney))}`,
      scenario.scenario.firstDeficitDate
        ? `- After this purchase the first deficit appears on ${scenario.scenario.firstDeficitDate}`
        : "- After this purchase there is no deficit on the current horizon",
      "If the user did not specify timing, financing, or a down payment, ask 2-3 clarifying questions first.",
      "Use these exact questions:",
      ...clarificationBlock,
      "After the analysis, propose building a purchase plan and modeling it in a FIN OS scenario.",
    ].join("\n"),
  };
}

export function buildAdvisorQuestionBrief(args: {
  locale: "ru" | "en";
  question: string;
  state: DecisionCoreState;
  plannedFreeMoneyAmount: number;
}): AdvisorQuestionBrief {
  const purchaseGuide = buildPurchaseGuide(args);
  if (purchaseGuide.promptGuide) return purchaseGuide;

  const classification = classifyAdvisorQuestion(args.question, args.locale);
  if (classification.type === "forecast" && args.locale === "ru") {
    return {
      classification,
      promptGuide:
        "Вопрос относится к прогнозу. Отвечай через реальные даты, платежи, доходы и риск по данным FIN OS. Не давай абстрактных советов без привязки к цифрам пользователя.",
    };
  }

  return { classification, promptGuide: null };
}

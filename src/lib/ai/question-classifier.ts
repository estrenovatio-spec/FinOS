import type { AdvisorFinancialContext } from "@/lib/advisor-context";
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
  emotionalTone: boolean;
};

export type AdvisorQuestionBrief = {
  classification: AdvisorQuestionClassification;
  promptGuide: string | null;
};

function normalizeQuestion(question: string): string {
  return question.toLowerCase().replace(/ё/g, "е");
}

function detectEmotionalTone(question: string): boolean {
  return /(провалил|ужас|паник|страш|стыд|не справляюсь|опять все плохо)/i.test(
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
  const emotionalTone = detectEmotionalTone(question);

  if (purchaseKind != null) {
    return {
      type: "purchase",
      purchaseKind,
      amountRub,
      needsClarification: true,
      clarificationQuestions: buildClarificationQuestions(purchaseKind, locale),
      emotionalTone,
    };
  }

  if (/(накоп|отлож|сбер|копить)/i.test(lower)) {
    return {
      type: "saving",
      purchaseKind: null,
      amountRub,
      needsClarification: false,
      clarificationQuestions: [],
      emotionalTone,
    };
  }

  if (/(инвест|облигац|акци|вклад)/i.test(lower)) {
    return {
      type: "investing",
      purchaseKind: null,
      amountRub,
      needsClarification: false,
      clarificationQuestions: [],
      emotionalTone,
    };
  }

  if (/(трат|расход|дорог|эконом|ужат|нет денег|не хватает денег)/i.test(lower)) {
    return {
      type: "expenses",
      purchaseKind: null,
      amountRub,
      needsClarification: false,
      clarificationQuestions: [],
      emotionalTone,
    };
  }

  if (/(доход|зарплат|поступл)/i.test(lower)) {
    return {
      type: "income",
      purchaseKind: null,
      amountRub,
      needsClarification: false,
      clarificationQuestions: [],
      emotionalTone,
    };
  }

  if (/(цел|мечт|дом|машин)/i.test(lower)) {
    return {
      type: "goals",
      purchaseKind,
      amountRub,
      needsClarification: false,
      clarificationQuestions: [],
      emotionalTone,
    };
  }

  if (/(прогноз|что будет|хватит|дефицит|риск)/i.test(lower)) {
    return {
      type: "forecast",
      purchaseKind: null,
      amountRub,
      needsClarification: false,
      clarificationQuestions: [],
      emotionalTone,
    };
  }

  if (/(сценар|смодел|если купл|если доход задерж)/i.test(lower)) {
    return {
      type: "scenarios",
      purchaseKind,
      amountRub,
      needsClarification: false,
      clarificationQuestions: [],
      emotionalTone,
    };
  }

  return {
    type: "other",
    purchaseKind: null,
    amountRub,
    needsClarification: false,
    clarificationQuestions: [],
    emotionalTone,
  };
}

function formatRub(amount: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(Math.round(amount))} ₽`;
}

function formatIncomeStatusLabel(status: AdvisorFinancialContext["incomes"]["recurring"][number]["status"]): string {
  switch (status) {
    case "confirmed":
      return "уже получен";
    case "overdue":
      return "ещё не пришёл";
    case "snoozed":
      return "напоминание отложено";
    default:
      return "ожидается";
  }
}

function formatIncomeList(context: AdvisorFinancialContext): string {
  const items = [
    ...context.incomes.recurring.map((income) => ({
      title: income.title,
      amount: income.amount,
      date: income.nextDate,
      status: income.status,
    })),
    ...context.incomes.oneOff.map((income) => ({
      title: income.title,
      amount: income.amount,
      date: income.date,
      status: income.status,
    })),
  ]
    .slice(0, 4)
    .map(
      (income) =>
        `- ${income.title}: ${formatRub(income.amount)} (${income.date}, ${formatIncomeStatusLabel(income.status)})`,
    );
  return items.length > 0 ? items.join("\n") : "- В текущем периоде ожидаемых доходов нет";
}

function formatRecurringExpenseList(context: AdvisorFinancialContext): string {
  const items = context.expenses.recurring
    .filter((expense) => expense.status === "active")
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 4)
    .map((expense) => `- ${expense.title}: ${formatRub(expense.amount)} (${expense.nextDate})`);
  return items.length > 0 ? items.join("\n") : "- Активных регулярных платежей нет";
}

function formatBudgetList(context: AdvisorFinancialContext): string {
  const items = context.expenses.budgets
    .slice(0, 4)
    .map(
      (budget) =>
        `- ${budget.category}: лимит ${formatRub(budget.limit)}, осталось ${formatRub(budget.remaining)}`,
    );
  return items.length > 0 ? items.join("\n") : "- Активных лимитов нет";
}

function buildPurchaseGuide(args: {
  locale: "ru" | "en";
  question: string;
  state: DecisionCoreState;
  plannedFreeMoneyAmount: number;
  financialContext?: AdvisorFinancialContext;
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
        args.financialContext
          ? `- Сейчас в кошельке: ${formatRub(args.financialContext.balances.currentBalance)}`
          : null,
        `- Сейчас можно направить без поломки плана: ${formatRub(freeMoney)}`,
        `- Финансовый разрыв: ${formatRub(gap)}`,
        `- Если купить сейчас, свободные деньги станут: ${formatRub(Math.max(0, scenario.scenario.plannedFreeMoney))}`,
        scenario.scenario.firstDeficitDate
          ? `- После такой покупки дефицит появится ${scenario.scenario.firstDeficitDate}`
          : "- После такой покупки на текущем горизонте дефицит не появляется",
        args.financialContext?.incomes.expectedTotal
          ? `- В этом периоде ещё ожидаются доходы на ${formatRub(args.financialContext.incomes.expectedTotal)}`
          : "- Ожидаемых доходов в текущем периоде больше нет",
        "Если пользователь не назвал срок, формат оплаты или первый взнос, сначала задай 2–3 уточняющих вопроса.",
        "Используй именно эти вопросы:",
        ...clarificationBlock,
        "После анализа обязательно предложи построить план покупки и смоделировать её в сценарии FIN OS.",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  return {
    classification,
    promptGuide: [
      "This question is about a major purchase. Act like a personal financial consultant, not a generic chatbot.",
      "Use FIN OS calculations only.",
      `- Target cost: ${formatRub(amount)}`,
      `- Available without breaking the plan: ${formatRub(freeMoney)}`,
      `- Financial gap: ${formatRub(gap)}`,
    ].join("\n"),
  };
}

function buildExpensesGuide(args: {
  locale: "ru" | "en";
  context: AdvisorFinancialContext;
}) {
  if (args.locale === "ru") {
    return [
      "Вопрос про нехватку денег или давление на бюджет. Отвечай только через факты из FIN OS.",
      `- Сейчас в кошельке: ${formatRub(args.context.balances.currentBalance)}`,
      `- Можно потратить до конца периода: ${formatRub(args.context.balances.plannedFreeMoney)}`,
      `- Ожидаемые доходы периода: ${formatRub(args.context.incomes.expectedTotal)}`,
      `- Регулярные платежи: ${formatRub(args.context.expenses.recurringTotal)}`,
      `- Платежи по долгам: ${formatRub(args.context.expenses.debtPaymentsTotal)}`,
      `- Другие обязательные платежи: ${formatRub(args.context.expenses.otherMandatoryPaymentsTotal)}`,
      `- Расходы по лимитам: ${formatRub(args.context.expenses.plannedBudgetsTotal)}`,
      "Назови максимум 3 самых сильных фактора по сумме и объясни, как каждый из них влияет на итог.",
      "Самые заметные регулярные платежи:",
      formatRecurringExpenseList(args.context),
      "Лимиты периода:",
      formatBudgetList(args.context),
      "Нельзя писать общие советы вроде 'сократите расходы', если не указал, какая именно статья сильнее всего влияет на итог.",
    ].join("\n");
  }

  return "The question is about budget pressure or lack of money. Answer only through FIN OS facts.";
}

function buildIncomeGuide(args: {
  locale: "ru" | "en";
  context: AdvisorFinancialContext;
}) {
  if (args.locale === "ru") {
    return [
      "Вопрос про доходы. Нельзя писать, что доходов нет, если в контексте есть ожидаемые или регулярные поступления.",
      `- Всего доходов в текущем периоде по плану: ${formatRub(args.context.incomes.currentPeriodTotal)}`,
      `- Из них ещё ожидается: ${formatRub(args.context.incomes.expectedTotal)}`,
      `- Уже подтверждено: ${formatRub(args.context.incomes.confirmedTotal)}`,
      "Перечисляй доходы с датами и человеческим статусом, а не техническими кодами.",
      "Ожидаемые доходы:",
      formatIncomeList(args.context),
      "Если поступление просрочено, называй его неполученным или ожидаемым, а не отсутствующим.",
    ].join("\n");
  }

  return "The question is about income. Never claim there is no income when expected income exists.";
}

function buildGoalGuide(args: {
  locale: "ru" | "en";
  context: AdvisorFinancialContext;
  question: string;
}) {
  if (args.locale === "ru") {
    const amount = extractQuestionAmountRub(args.question);
    return [
      "Вопрос про цель или накопление.",
      `- Сейчас в кошельке: ${formatRub(args.context.balances.currentBalance)}`,
      `- Можно потратить до конца периода: ${formatRub(args.context.balances.plannedFreeMoney)}`,
      amount ? `- Сумма цели из вопроса: ${formatRub(amount)}` : null,
      args.context.goals.length > 0
        ? `- Уже заведено целей: ${args.context.goals.length}`
        : "- Отдельные цели пока не заведены",
      "Если точного плана пока нет, не обещай результат и не заполняй пробелы догадками.",
      "Если пользователь не назвал срок и отдельные накопления на цель, сначала попроси эти данные.",
      "Не строй абстрактный план без срока, текущих накоплений и комфортного ежемесячного взноса.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return "The question is about a goal. Ask for timing and existing savings when missing.";
}

function buildForecastGuide(args: {
  locale: "ru" | "en";
  context: AdvisorFinancialContext;
}) {
  if (args.locale === "ru") {
    return [
      "Вопрос про прогноз.",
      `- Минимальный баланс по прогнозу: ${formatRub(args.context.forecast.minimumBalance)}`,
      args.context.forecast.firstDeficitDate
        ? `- Первая дата дефицита: ${args.context.forecast.firstDeficitDate}`
        : "- На текущем горизонте дефицита нет",
      args.context.forecast.nearestRiskExplanation
        ? `- Причина ближайшего риска: ${args.context.forecast.nearestRiskExplanation}`
        : null,
      "Если главную причину нельзя выделить точно, так и скажи и не выдумывай объяснение.",
      "Объясняй через реальные даты и суммы из FIN OS, а не через абстрактные советы.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return "The question is about forecast. Use dates and amounts from FIN OS.";
}

export function buildAdvisorQuestionBrief(args: {
  locale: "ru" | "en";
  question: string;
  state: DecisionCoreState;
  plannedFreeMoneyAmount: number;
  financialContext?: AdvisorFinancialContext;
}): AdvisorQuestionBrief {
  const purchaseGuide = buildPurchaseGuide(args);
  if (purchaseGuide.promptGuide) return purchaseGuide;

  const classification = classifyAdvisorQuestion(args.question, args.locale);

  if (classification.type === "expenses" && args.financialContext) {
    return {
      classification,
      promptGuide: buildExpensesGuide({ locale: args.locale, context: args.financialContext }),
    };
  }

  if (classification.type === "income" && args.financialContext) {
    return {
      classification,
      promptGuide: buildIncomeGuide({ locale: args.locale, context: args.financialContext }),
    };
  }

  if ((classification.type === "saving" || classification.type === "goals") && args.financialContext) {
    return {
      classification,
      promptGuide: buildGoalGuide({
        locale: args.locale,
        context: args.financialContext,
        question: args.question,
      }),
    };
  }

  if ((classification.type === "forecast" || classification.type === "scenarios") && args.financialContext) {
    return {
      classification,
      promptGuide: buildForecastGuide({ locale: args.locale, context: args.financialContext }),
    };
  }

  if (classification.emotionalTone && args.locale === "ru") {
    return {
      classification,
      promptGuide:
        "У вопроса эмоциональный тон. Начни с одной короткой человеческой фразы без морализаторства, затем сразу переходи к фактам FIN OS и одному-двум конкретным следующим шагам.",
    };
  }

  return {
    classification,
    promptGuide:
      args.locale === "ru"
        ? "Отвечай только по данным FIN OS, опирайся на конкретные суммы и даты, избегай общих советов без доказательств."
        : "Answer only from FIN OS data, using specific amounts and dates.",
  };
}

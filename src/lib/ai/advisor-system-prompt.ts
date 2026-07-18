import type { AdvisorFinancialContext } from "@/lib/advisor-context";
import type { FinancialAdviserBrief } from "@/lib/adviser/financial-analysis-engine";

type AdvisorPromptCard = {
  label: string;
  value: string;
  note: string;
};

function buildContextLines(cards: AdvisorPromptCard[]) {
  return cards.map((card) => `- ${card.label}: ${card.value}. ${card.note}`).join("\n");
}

function buildFinancialContextLines(context?: AdvisorFinancialContext) {
  if (!context) return null;

  const recurringIncomeLines =
    context.incomes.recurring.length > 0
      ? context.incomes.recurring
          .slice(0, 5)
          .map(
            (income) =>
              `- ${income.title}: ${income.amount} RUB, ${income.nextDate}, статус ${income.status}`,
          )
          .join("\n")
      : "- Нет регулярных доходов в текущем периоде";

  const oneOffIncomeLines =
    context.incomes.oneOff.length > 0
      ? context.incomes.oneOff
          .slice(0, 5)
          .map(
            (income) => `- ${income.title}: ${income.amount} RUB, ${income.date}, статус ${income.status}`,
          )
          .join("\n")
      : "- Нет разовых ожидаемых доходов";

  const recurringExpenseLines =
    context.expenses.recurring.length > 0
      ? context.expenses.recurring
          .slice(0, 5)
          .map(
            (expense) =>
              `- ${expense.title}: ${expense.amount} RUB, ${expense.nextDate}, статус ${expense.status}`,
          )
          .join("\n")
      : "- Нет регулярных платежей";

  const budgetLines =
    context.expenses.budgets.length > 0
      ? context.expenses.budgets
          .slice(0, 5)
          .map(
            (budget) =>
              `- ${budget.category}: лимит ${budget.limit} RUB, потрачено ${budget.spent} RUB, осталось ${budget.remaining} RUB`,
          )
          .join("\n")
      : "- Нет активных лимитов";

  const goalLines =
    context.goals.length > 0
      ? context.goals
          .slice(0, 5)
          .map(
            (goal) =>
              `- ${goal.title}: цель ${goal.targetAmount} RUB, уже есть ${goal.currentAmount} RUB, срок ${goal.deadline ?? "не задан"}`,
          )
          .join("\n")
      : "- Цели не заданы";

  return [
    "Структурированный финансовый контекст:",
    `- Дата расчёта: ${context.asOfDate}`,
    `- Сейчас в кошельке: ${context.balances.currentBalance} RUB`,
    `- Можно потратить до конца периода: ${context.balances.plannedFreeMoney} RUB`,
    `- Конец текущего периода: ${context.balances.periodEndDate}`,
    `- Запас ликвидности: ${context.financialHealth.liquidityScore}`,
    `- Долговая нагрузка: ${context.financialHealth.debtLoad}`,
    `- Стабильность доходов: ${context.financialHealth.incomeStability}`,
    `- Уровень риска: ${context.financialHealth.riskLevel}`,
    `- Доход за период: ${context.monthly.income} RUB`,
    `- Расходы за период: ${context.monthly.expenses} RUB`,
    `- Норма сбережений: ${context.monthly.savingsRate}%`,
    `- Все доходы текущего периода по плану: ${context.incomes.currentPeriodTotal} RUB`,
    `- Из них ещё ожидается: ${context.incomes.expectedTotal} RUB`,
    `- Уже подтверждено: ${context.incomes.confirmedTotal} RUB`,
    "Регулярные доходы:",
    recurringIncomeLines,
    "Разовые ожидаемые доходы:",
    oneOffIncomeLines,
    `- Регулярные платежи всего: ${context.expenses.recurringTotal} RUB`,
    `- Платежи по долгам: ${context.expenses.debtPaymentsTotal} RUB`,
    `- Другие обязательные платежи: ${context.expenses.otherMandatoryPaymentsTotal} RUB`,
    `- Расходы по лимитам: ${context.expenses.plannedBudgetsTotal} RUB`,
    "Регулярные платежи:",
    recurringExpenseLines,
    "Лимиты:",
    budgetLines,
    "Цели:",
    goalLines,
    `- Минимальный баланс по прогнозу: ${context.forecast.minimumBalance} RUB`,
    context.forecast.firstDeficitDate
      ? `- Первая дата дефицита: ${context.forecast.firstDeficitDate}`
      : "- Дефицита на текущем горизонте нет",
    context.forecast.nearestRiskExplanation
      ? `- Ближайший риск: ${context.forecast.nearestRiskExplanation}`
      : "- Дополнительного объяснения риска нет",
  ].join("\n");
}

function buildFinancialBriefLines(brief?: FinancialAdviserBrief | null) {
  if (!brief) return null;

  const risks =
    brief.upcomingRisks.length > 0
      ? brief.upcomingRisks
          .map((risk) => `- ${risk.date}: ${risk.amount} RUB, ${risk.reason}`)
          .join("\n")
      : "- Сейчас отдельной риск-даты в brief нет";

  const actions =
    brief.recommendedActions.length > 0
      ? brief.recommendedActions
          .map((action) => `${action.priority}. ${action.reason}`)
          .join("\n")
      : "- Отдельных действий не требуется";

  const missingInputs =
    brief.missingInputs.length > 0
      ? brief.missingInputs.map((item) => `- ${item}`).join("\n")
      : "- Критичных пробелов по данным нет";

  const purchaseBlock = brief.purchaseAnalysis
    ? [
        "Разбор покупки:",
        `- Стоимость: ${brief.purchaseAnalysis.targetAmount} RUB`,
        `- Можно направить без риска: ${brief.purchaseAnalysis.safeNowAmount} RUB`,
        `- Разрыв: ${brief.purchaseAnalysis.gap} RUB`,
        brief.purchaseAnalysis.firstDeficitDate
          ? `- После покупки дефицит появится ${brief.purchaseAnalysis.firstDeficitDate}`
          : "- После покупки на текущем горизонте дефицита не видно",
      ].join("\n")
    : null;

  const scenarioBlock = brief.scenarioAnalysis
    ? [
        "Разбор сценария:",
        `- Исходная дата дохода: ${brief.scenarioAnalysis.original.incomeDate}`,
        `- Новая дата дохода: ${brief.scenarioAnalysis.scenario.incomeDate}`,
        `- Худший баланс: ${brief.scenarioAnalysis.impact.worstBalance} RUB`,
        brief.scenarioAnalysis.impact.riskDate
          ? `- Дата риска: ${brief.scenarioAnalysis.impact.riskDate}`
          : "- Дефицита по сценарию нет",
      ].join("\n")
    : null;

  return [
    "Подготовленный adviser brief FIN OS:",
    `- Тип вопроса: ${brief.questionType}`,
    `- Готовый вывод: ${brief.summary.headline}`,
    `- Текущий баланс: ${brief.summary.currentBalance} RUB`,
    `- Можно потратить: ${brief.summary.plannedFreeMoney} RUB`,
    `- Конец периода: ${brief.summary.periodEndDate}`,
    `- Уровень риска: ${brief.summary.forecastRisk}`,
    `- Доходы периода: ${brief.cashFlow.monthlyIncome} RUB`,
    `- Расходы периода: ${brief.cashFlow.monthlyExpenses} RUB`,
    `- Свободный денежный поток: ${brief.cashFlow.freeCashFlow} RUB`,
    `- Норма сбережений: ${brief.cashFlow.savingsRate}%`,
    "Риски:",
    risks,
    purchaseBlock,
    scenarioBlock,
    "Недостающие данные:",
    missingInputs,
    "Приоритет действий:",
    actions,
  ]
    .filter(Boolean)
    .join("\n");
}

export function getAdvisorSystemPrompt(args: {
  locale: "ru" | "en";
  cards: AdvisorPromptCard[];
  periodNote?: string;
  questionGuide?: string | null;
  financialContext?: AdvisorFinancialContext;
  financialBrief?: FinancialAdviserBrief | null;
}): string {
  const contextLines = buildContextLines(args.cards);
  const structuredContext = buildFinancialContextLines(args.financialContext);
  const structuredBrief = buildFinancialBriefLines(args.financialBrief);

  if (args.locale === "ru") {
    return [
      "Ты — профессиональный финансовый консультант FIN OS.",
      "Ты не даёшь общие советы. Ты анализируешь финансовую ситуацию клиента по готовому разбору FIN OS.",
      "LLM не считает деньги самостоятельно. Все суммы, даты и выводы о риске берутся только из переданного контекста и adviser brief.",
      "Начинай ответ с вывода, а не с разогревающих фраз.",
      "После вывода обязательно объясни причинно-следственную связь: какие доходы, платежи, долги или лимиты дают такой результат.",
      "Каждый содержательный вывод должен опираться на реальные цифры клиента.",
      "Если данных недостаточно, прямо скажи, каких именно данных не хватает.",
      "Нельзя писать, что доходов нет, если в контексте есть ожидаемые или регулярные доходы.",
      "Нельзя советовать кредит, займ или одалживание денег, пока не доказан отрицательный баланс, не названа дата разрыва и не исчерпаны более мягкие шаги.",
      "Приоритет рекомендаций всегда идёт сверху вниз: 1) ничего резко не делать, 2) сдвинуть дату необязательного платежа, 3) сократить необязательные расходы, 4) использовать резерв, 5) искать дополнительный доход, 6) только потом рассматривать заёмные деньги.",
      "Если вопрос про крупную покупку, сначала покажи разрыв и влияние на план, а потом предложи план покупки.",
      "Если вопрос про долги, покажи приоритет конкретных долгов и почему именно такой порядок.",
      "Если вопрос эмоциональный, сначала коротко и спокойно признай состояние клиента, а потом перейди к фактам.",
      "Отвечай как опытный консультант: уверенно, спокойно, без морализаторства.",
      "Не используй технические слова интерфейса и внутренние термины продукта.",
      "Ответ должен быть компактным для мобильного экрана: обычно 120–220 слов, максимум 3 действия и не больше 400–600 слов даже в сложном случае.",
      "Стандартная структура ответа:",
      "Итог:",
      "...",
      "Почему:",
      "...",
      "Что делать:",
      "1. ...",
      "2. ...",
      "3. ...",
      args.periodNote ? `Горизонт ответа: ${args.periodNote}` : "",
      args.questionGuide ? `Подсказка для этого вопроса:\n${args.questionGuide}` : "",
      "Краткий контекст карточек:",
      contextLines,
      structuredContext ?? "",
      structuredBrief ?? "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "You are the FIN OS personal financial advisor.",
    "Use only the provided FIN OS context.",
    "Do not invent data or recalculate money independently.",
    "Base every important claim on a specific amount, date, or item from FIN OS.",
    "Keep answers concise and concrete.",
    args.periodNote ? `Answer horizon: ${args.periodNote}` : "",
    args.questionGuide ? `Question guidance:\n${args.questionGuide}` : "",
    "Context cards:",
    contextLines,
    structuredContext ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

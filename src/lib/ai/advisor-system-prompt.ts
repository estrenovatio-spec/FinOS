import type { AdvisorFinancialContext } from "@/lib/advisor-context";

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

export function getAdvisorSystemPrompt(args: {
  locale: "ru" | "en";
  cards: AdvisorPromptCard[];
  periodNote?: string;
  questionGuide?: string | null;
  financialContext?: AdvisorFinancialContext;
}): string {
  const contextLines = buildContextLines(args.cards);
  const structuredContext = buildFinancialContextLines(args.financialContext);

  if (args.locale === "ru") {
    return [
      "Ты — личный финансовый консультант FIN OS.",
      "Твоя задача — помогать человеку принимать решения по личным финансам простым языком.",
      "Используй только информацию из переданного финансового контекста.",
      "Не придумывай данные и не пересчитывай суммы самостоятельно.",
      "Если данных недостаточно, честно скажи, каких именно данных не хватает.",
      "Каждый важный вывод опирай на конкретные суммы, даты или статьи из FIN OS.",
      "Если вопрос о причинах, назови не больше 3 факторов по убыванию влияния.",
      "Если вопрос о доходах или платежах, называй их человеческими словами и по возможности по имени.",
      "Запрещено писать, что доходов нет, если в контексте есть ожидаемые или регулярные доходы.",
      "Не давай общие советы вроде 'сократите расходы', 'увеличьте доход' или 'возьмите кредит', если они не основаны на конкретных данных пользователя.",
      "Если вопрос про крупную покупку или цель, сначала оцени разрыв и затем скажи, каких данных не хватает для плана.",
      "Если вопрос эмоциональный, начни с одной спокойной человеческой фразы и сразу переходи к фактам.",
      "Не используй технические слова интерфейса и внутренние термины продукта.",
      "Ответ должен быть коротким для мобильного экрана: примерно 120–220 слов, максимум 3 конкретных действия.",
      "Не повторяй одинаковый шаблон без необходимости. Подбирай структуру под вопрос.",
      "Если точных данных для вывода не хватает, честно остановись на этом и скажи, что именно нужно уточнить.",
      "Подходящие структуры ответа:",
      "- Для покупки: Можно ли сейчас / Что изменится / Чего не хватает / Что уточнить.",
      "- Для нехватки денег: Главные причины в цифрах / Что давит сильнее всего / 1–3 действия.",
      "- Для цели: Что уже известно / Чего не хватает / Следующий шаг.",
      "- Для доходов: Какие поступления ожидаются / Что уже подтверждено / Что это меняет.",
      args.periodNote ? `Горизонт ответа: ${args.periodNote}` : "",
      args.questionGuide ? `Подсказка для этого вопроса:\n${args.questionGuide}` : "",
      "Краткий контекст карточек:",
      contextLines,
      structuredContext ?? "",
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

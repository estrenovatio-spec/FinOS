import type { AdvisorFinancialContext } from "@/lib/advisor-context";
import type {
  AdvisorQuestionClassification,
  AdvisorQuestionType,
} from "@/lib/ai/question-classifier";
import type { DecisionCoreState } from "@/lib/decision-core";
import { evaluateScenario, type AdviserScenarioAction } from "@/lib/adviser/scenario-analysis";

export type AdviserRiskLevel = "low" | "medium" | "high";

export type FinancialAdviserAction = {
  priority: 1 | 2 | 3 | 4 | 5 | 6;
  action:
    | "wait"
    | "move_optional_payments"
    | "cut_optional_spending"
    | "use_reserve"
    | "find_extra_income"
    | "consider_borrowing"
    | "build_purchase_plan"
    | "clarify_goal_inputs"
    | "focus_debt_priority"
    | "clarify_investing_profile";
  reason: string;
};

export type FinancialAdviserBrief = {
  questionType: AdvisorQuestionType;
  summary: {
    headline: string;
    currentBalance: number;
    plannedFreeMoney: number;
    periodEndDate: string;
    forecastRisk: AdviserRiskLevel;
  };
  cashFlow: {
    monthlyIncome: number;
    monthlyExpenses: number;
    freeCashFlow: number;
    savingsRate: number;
  };
  financialHealth: {
    liquidityScore: number;
    debtLoad: number;
    incomeStability: AdviserRiskLevel;
    riskLevel: AdviserRiskLevel;
  };
  expectedIncome: Array<{
    id: string;
    name: string;
    amount: number;
    date: string;
    status: AdvisorFinancialContext["incomes"]["recurring"][number]["status"];
  }>;
  upcomingRisks: Array<{
    date: string;
    type: "negative_balance" | "tight_liquidity" | "income_delay_scenario" | "debt_pressure";
    amount: number;
    reason: string;
  }>;
  expensePressure: Array<{
    name: string;
    amount: number;
    kind: "recurring_payment" | "debt_payment" | "spending_limit";
  }>;
  debtFocus: Array<{
    id: string;
    name: string;
    balance: number;
    minPayment: number;
    priorityReason: string;
  }>;
  goals: {
    activeGoals: number;
    requiredAmount: number;
    timeline: string[];
  };
  purchaseAnalysis?: {
    targetAmount: number;
    safeNowAmount: number;
    gap: number;
    impactOnFreeMoney: number;
    firstDeficitDate: string | null;
  } | null;
  scenarioAnalysis?: ReturnType<typeof evaluateScenario> | null;
  missingInputs: string[];
  recommendedActions: FinancialAdviserAction[];
  evidence: string[];
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function resolveRiskLevel(context: AdvisorFinancialContext): AdviserRiskLevel {
  if (context.forecast.firstDeficitDate || context.balances.plannedFreeMoney <= 0) return "high";
  if (context.balances.plannedFreeMoney < Math.round(context.balances.currentBalance * 0.15)) {
    return "medium";
  }
  return "low";
}

function resolveIncomeStability(context: AdvisorFinancialContext): AdviserRiskLevel {
  const overdue = [...context.incomes.recurring, ...context.incomes.oneOff].some(
    (income) => income.status === "overdue",
  );
  if (overdue) return "high";
  const oneOffShare =
    context.incomes.currentPeriodTotal > 0
      ? context.incomes.oneOff.reduce((sum, item) => sum + item.amount, 0) / context.incomes.currentPeriodTotal
      : 0;
  if (oneOffShare > 0.35) return "medium";
  return "low";
}

function buildExpensePressure(context: AdvisorFinancialContext) {
  const recurring = context.expenses.recurring
    .filter((item) => item.status === "active")
    .map((item) => ({
      name: item.title,
      amount: Math.round(item.amount),
      kind: "recurring_payment" as const,
    }));

  const budgets = context.expenses.budgets
    .filter((item) => item.remaining > 0)
    .map((item) => ({
      name: item.category,
      amount: Math.round(item.remaining),
      kind: "spending_limit" as const,
    }));

  const debtPressure =
    context.expenses.debtPaymentsTotal > 0
      ? [
          {
            name: "Платежи по долгам",
            amount: Math.round(context.expenses.debtPaymentsTotal),
            kind: "debt_payment" as const,
          },
        ]
      : [];

  return [...recurring, ...debtPressure, ...budgets]
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 5);
}

function buildCashFlow(context: AdvisorFinancialContext) {
  const monthlyIncome = Math.round(context.incomes.currentPeriodTotal);
  const monthlyExpenses = Math.round(
    context.expenses.recurringTotal
      + context.expenses.debtPaymentsTotal
      + context.expenses.otherMandatoryPaymentsTotal
      + context.expenses.plannedBudgetsTotal,
  );
  const freeCashFlow = monthlyIncome - monthlyExpenses;
  const savingsRate = monthlyIncome > 0 ? Math.round((freeCashFlow / monthlyIncome) * 100) : 0;

  return { monthlyIncome, monthlyExpenses, freeCashFlow, savingsRate };
}

function buildRecommendedActionsFromScenario(
  actions: AdviserScenarioAction[],
): FinancialAdviserAction[] {
  return actions.map((item) => ({
    priority: item.level,
    action: item.action,
    reason: item.reason,
  }));
}

function parseGoalTargetAmount(questionAmount: number | null, context: AdvisorFinancialContext): number {
  if (questionAmount && questionAmount > 0) return Math.round(questionAmount);
  return context.goals.reduce((sum, goal) => sum + Math.max(0, goal.targetAmount - goal.currentAmount), 0);
}

function buildBaseBrief(args: {
  classification: AdvisorQuestionClassification;
  context: AdvisorFinancialContext;
}): Omit<FinancialAdviserBrief, "recommendedActions" | "evidence" | "missingInputs"> {
  const riskLevel = resolveRiskLevel(args.context);
  const incomeStability = resolveIncomeStability(args.context);
  const cashFlow = buildCashFlow(args.context);
  const totalDebtBalance = args.context.expenses.debtPaymentsTotal;

  return {
    questionType: args.classification.type,
    summary: {
      headline: "",
      currentBalance: Math.round(args.context.balances.currentBalance),
      plannedFreeMoney: Math.round(args.context.balances.plannedFreeMoney),
      periodEndDate: args.context.balances.periodEndDate,
      forecastRisk: riskLevel,
    },
    cashFlow,
    financialHealth: {
      liquidityScore: clampScore(
        args.context.balances.currentBalance <= 0
          ? 0
          : (args.context.balances.plannedFreeMoney / Math.max(args.context.balances.currentBalance, 1)) * 100,
      ),
      debtLoad:
        cashFlow.monthlyIncome > 0
          ? clampScore((totalDebtBalance / cashFlow.monthlyIncome) * 100)
          : clampScore(totalDebtBalance > 0 ? 100 : 0),
      incomeStability,
      riskLevel,
    },
    expectedIncome: [
      ...args.context.incomes.recurring.map((income) => ({
        id: income.id,
        name: income.title,
        amount: Math.round(income.amount),
        date: income.nextDate,
        status: income.status,
      })),
      ...args.context.incomes.oneOff.map((income) => ({
        id: income.id,
        name: income.title,
        amount: Math.round(income.amount),
        date: income.date,
        status: income.status,
      })),
    ]
      .sort((left, right) => left.date.localeCompare(right.date))
      .slice(0, 6),
    upcomingRisks: [
      ...(args.context.forecast.firstDeficitDate
        ? [
            {
              date: args.context.forecast.firstDeficitDate,
              type: "negative_balance" as const,
              amount: Math.round(args.context.forecast.minimumBalance),
              reason:
                args.context.forecast.nearestRiskExplanation
                ?? "На этой дате баланс по прогнозу уходит в минус.",
            },
          ]
        : []),
      ...(args.context.balances.plannedFreeMoney > 0 && args.context.balances.plannedFreeMoney < 10_000
        ? [
            {
              date: args.context.balances.periodEndDate,
              type: "tight_liquidity" as const,
              amount: Math.round(args.context.balances.plannedFreeMoney),
              reason: "До конца периода остаётся небольшой запас свободных денег.",
            },
          ]
        : []),
    ],
    expensePressure: buildExpensePressure(args.context),
    debtFocus: [],
    goals: {
      activeGoals: args.context.goals.length,
      requiredAmount: args.context.goals.reduce(
        (sum, goal) => sum + Math.max(0, Math.round(goal.targetAmount - goal.currentAmount)),
        0,
      ),
      timeline: args.context.goals
        .filter((goal) => goal.deadline)
        .map((goal) => goal.deadline as string)
        .slice(0, 5),
    },
    purchaseAnalysis: null,
    scenarioAnalysis: null,
  };
}

function analyzeCashflowDelay(args: {
  state: DecisionCoreState;
  context: AdvisorFinancialContext;
  classification: AdvisorQuestionClassification;
}): Pick<FinancialAdviserBrief, "summary" | "scenarioAnalysis" | "recommendedActions" | "evidence" | "missingInputs" | "upcomingRisks"> {
  const income = [...args.context.incomes.recurring, ...args.context.incomes.oneOff].find(
    (item) => item.status === "expected" || item.status === "overdue" || item.status === "snoozed",
  );
  if (!income || args.classification.delayDays == null) {
    return {
      summary: {
        headline: "Не хватает данных для сценария задержки дохода",
        currentBalance: Math.round(args.context.balances.currentBalance),
        plannedFreeMoney: Math.round(args.context.balances.plannedFreeMoney),
        periodEndDate: args.context.balances.periodEndDate,
        forecastRisk: resolveRiskLevel(args.context),
      },
      scenarioAnalysis: null,
      upcomingRisks: [],
      missingInputs: income ? ["Нужно уточнить длительность задержки дохода."] : ["В текущем плане не найден доход, который можно задержать."],
      recommendedActions: [
        {
          priority: 1,
          action: "wait",
          reason: "Сначала нужно понять, какой доход и на сколько дней переносится.",
        },
      ],
      evidence: [],
    };
  }

  const incomeDate = "nextDate" in income ? income.nextDate : income.date;
  const incomeTitle = "title" in income ? income.title : "";

  const scenario = evaluateScenario({
    state: args.state,
    financialContext: args.context,
    incomeSourceId: income.id,
    currentIncomeDate: incomeDate,
    incomeDelayDays: args.classification.delayDays,
    expectedIncomeAmount: income.amount,
  });

  return {
    summary: {
      headline:
        scenario.impact.riskDate == null
          ? `Задержка дохода на ${args.classification.delayDays} дн. не создаёт критической проблемы сейчас`
          : `Задержка дохода на ${args.classification.delayDays} дн. создаёт риск к ${scenario.impact.riskDate}`,
      currentBalance: Math.round(args.context.balances.currentBalance),
      plannedFreeMoney: Math.round(args.context.balances.plannedFreeMoney),
      periodEndDate: args.context.balances.periodEndDate,
      forecastRisk: scenario.severity,
    },
    scenarioAnalysis: scenario,
    upcomingRisks:
      scenario.impact.riskDate == null
        ? []
        : [
            {
              date: scenario.impact.riskDate,
              type: "income_delay_scenario",
              amount: scenario.impact.worstBalance,
              reason: `Если доход ${incomeTitle} сдвинется с ${scenario.original.incomeDate} на ${scenario.scenario.incomeDate}.`,
            },
          ],
    missingInputs: [],
    recommendedActions: buildRecommendedActionsFromScenario(scenario.actions),
    evidence: [
      `Ожидаемый доход: ${incomeTitle}, ${income.amount} ₽, дата ${scenario.original.incomeDate}.`,
      `После задержки дата смещается на ${scenario.scenario.incomeDate}.`,
      scenario.impact.riskDate
        ? `Худший баланс по сценарию: ${scenario.impact.worstBalance} ₽, дата риска ${scenario.impact.riskDate}.`
        : `Критического дефицита по сценарию не возникает.`,
    ],
  };
}

function analyzePurchase(args: {
  context: AdvisorFinancialContext;
  classification: AdvisorQuestionClassification;
  question: string;
}): Pick<FinancialAdviserBrief, "summary" | "purchaseAnalysis" | "recommendedActions" | "evidence" | "missingInputs"> {
  const targetAmount = Math.round(args.classification.amountRub ?? 0);
  const safeNowAmount = Math.round(Math.max(0, args.context.balances.plannedFreeMoney));
  const gap = Math.max(0, targetAmount - safeNowAmount);
  const missingInputs = args.classification.clarificationQuestions;

  return {
    summary: {
      headline:
        gap <= 0
          ? "Покупка выглядит посильной по текущему плану"
          : "Сейчас покупка не помещается в безопасный план",
      currentBalance: Math.round(args.context.balances.currentBalance),
      plannedFreeMoney: Math.round(args.context.balances.plannedFreeMoney),
      periodEndDate: args.context.balances.periodEndDate,
      forecastRisk: resolveRiskLevel(args.context),
    },
    purchaseAnalysis: {
      targetAmount,
      safeNowAmount,
      gap,
      impactOnFreeMoney: safeNowAmount - targetAmount,
      firstDeficitDate: args.context.forecast.firstDeficitDate,
    },
    missingInputs,
    recommendedActions: [
      {
        priority: 1,
        action: "build_purchase_plan",
        reason:
          gap <= 0
            ? "Сначала стоит проверить срок, форму оплаты и влияние на подушку."
            : "Нужно построить план покупки по сроку, первому взносу и комфортному ежемесячному взносу.",
      },
    ],
    evidence: [
      `Стоимость покупки: ${targetAmount} ₽.`,
      `Сейчас без поломки плана можно направить ${safeNowAmount} ₽.`,
      `Финансовый разрыв: ${gap} ₽.`,
    ],
  };
}

function analyzeDebtStrategy(args: {
  context: AdvisorFinancialContext;
  state: DecisionCoreState;
}): Pick<FinancialAdviserBrief, "summary" | "debtFocus" | "recommendedActions" | "evidence" | "missingInputs"> {
  const debtFocus = [...args.state.debts]
    .filter((debt) => debt.balance > 0)
    .sort((left, right) => {
      const leftOverdue = left.nextPaymentDate && left.nextPaymentDate < args.state.today ? 1 : 0;
      const rightOverdue = right.nextPaymentDate && right.nextPaymentDate < args.state.today ? 1 : 0;
      if (leftOverdue !== rightOverdue) return rightOverdue - leftOverdue;
      if (left.balance !== right.balance) return left.balance - right.balance;
      return (right.ratePct ?? 0) - (left.ratePct ?? 0);
    })
    .slice(0, 4)
    .map((debt) => ({
      id: debt.id,
      name: debt.name,
      balance: Math.round(debt.balance),
      minPayment: Math.round(debt.minPayment),
      priorityReason:
        debt.nextPaymentDate && debt.nextPaymentDate < args.state.today
          ? "Есть просрочка, её лучше закрывать первой."
          : debt.balance <= 30_000
            ? "Небольшой остаток можно закрыть быстрее и освободить внимание."
            : "Этот долг заметно давит на ежемесячные платежи.",
    }));

  return {
    summary: {
      headline:
        debtFocus.length > 0
          ? `Сначала стоит разобрать долг ${debtFocus[0]?.name ?? ""}`.trim()
          : "Активных долгов для приоритизации не видно",
      currentBalance: Math.round(args.context.balances.currentBalance),
      plannedFreeMoney: Math.round(args.context.balances.plannedFreeMoney),
      periodEndDate: args.context.balances.periodEndDate,
      forecastRisk: resolveRiskLevel(args.context),
    },
    debtFocus,
    missingInputs: debtFocus.length > 0 ? [] : ["В текущем плане нет активных долгов с положительным остатком."],
    recommendedActions: debtFocus.length
      ? [
          {
            priority: 1,
            action: "focus_debt_priority",
            reason: debtFocus[0]?.priorityReason ?? "Нужно выбрать первый долг для закрытия.",
          },
        ]
      : [{ priority: 1, action: "wait", reason: "Сейчас нет активных долгов для отдельной стратегии." }],
    evidence: debtFocus.map(
      (debt) => `${debt.name}: остаток ${debt.balance} ₽, минимальный платёж ${debt.minPayment} ₽.`,
    ),
  };
}

function analyzeExpenseControl(args: {
  context: AdvisorFinancialContext;
}): Pick<FinancialAdviserBrief, "summary" | "recommendedActions" | "evidence" | "missingInputs"> {
  const biggest = buildExpensePressure(args.context).slice(0, 3);
  return {
    summary: {
      headline:
        biggest.length > 0
          ? `Сильнее всего на план давят ${biggest.map((item) => item.name).join(", ")}`
          : "Я не вижу явного давления расходов в текущем плане",
      currentBalance: Math.round(args.context.balances.currentBalance),
      plannedFreeMoney: Math.round(args.context.balances.plannedFreeMoney),
      periodEndDate: args.context.balances.periodEndDate,
      forecastRisk: resolveRiskLevel(args.context),
    },
    missingInputs: [],
    recommendedActions: biggest.length
      ? [
          {
            priority: 2,
            action: "move_optional_payments",
            reason: "Сначала стоит посмотреть, что из этих статей можно сдвинуть или ослабить без риска.",
          },
          {
            priority: 3,
            action: "cut_optional_spending",
            reason: "Следом имеет смысл сократить необязательные расходы, которые не защищают базовый план.",
          },
        ]
      : [{ priority: 1, action: "wait", reason: "Пока нет явного источника давления по крупным статьям." }],
    evidence: biggest.map((item) => `${item.name}: ${item.amount} ₽.`),
  };
}

function analyzeGoalPlanning(args: {
  context: AdvisorFinancialContext;
  classification: AdvisorQuestionClassification;
}): Pick<FinancialAdviserBrief, "summary" | "recommendedActions" | "evidence" | "missingInputs"> {
  const requiredAmount = parseGoalTargetAmount(args.classification.amountRub, args.context);
  const missingInputs = ["Нужен срок цели.", "Нужно понять, сколько уже отложено отдельно на эту цель.", "Нужен комфортный ежемесячный взнос."];
  return {
    summary: {
      headline: "Для точного плана по цели сначала нужно уточнить срок и стартовую точку",
      currentBalance: Math.round(args.context.balances.currentBalance),
      plannedFreeMoney: Math.round(args.context.balances.plannedFreeMoney),
      periodEndDate: args.context.balances.periodEndDate,
      forecastRisk: resolveRiskLevel(args.context),
    },
    missingInputs,
    recommendedActions: [
      {
        priority: 1,
        action: "clarify_goal_inputs",
        reason: "Без срока и стартовых накоплений советник не должен обещать путь к цели.",
      },
    ],
    evidence: [
      `Свободно по текущему плану: ${Math.round(args.context.balances.plannedFreeMoney)} ₽.`,
      `Сумма цели для расчёта: ${requiredAmount} ₽.`,
    ],
  };
}

function analyzeInvestment(args: {
  context: AdvisorFinancialContext;
}): Pick<FinancialAdviserBrief, "summary" | "recommendedActions" | "evidence" | "missingInputs"> {
  return {
    summary: {
      headline: "Сначала нужно определить срок, цель и допустимый риск",
      currentBalance: Math.round(args.context.balances.currentBalance),
      plannedFreeMoney: Math.round(args.context.balances.plannedFreeMoney),
      periodEndDate: args.context.balances.periodEndDate,
      forecastRisk: resolveRiskLevel(args.context),
    },
    missingInputs: ["Какой срок инвестирования?", "Для какой цели нужны эти деньги?", "Какой уровень риска допустим?"],
    recommendedActions: [
      {
        priority: 1,
        action: "clarify_investing_profile",
        reason: "Без горизонта, цели и риска нельзя давать осмысленный инвестиционный ответ.",
      },
    ],
    evidence: [`Текущий доступный запас денег: ${Math.round(args.context.balances.plannedFreeMoney)} ₽.`],
  };
}

function analyzeIncomeReview(args: {
  context: AdvisorFinancialContext;
}): Pick<FinancialAdviserBrief, "summary" | "recommendedActions" | "evidence" | "missingInputs"> {
  return {
    summary: {
      headline:
        args.context.incomes.expectedTotal > 0
          ? "В текущем периоде доходы есть, часть из них ещё ожидается"
          : "Сейчас новых ожидаемых доходов в периоде не видно",
      currentBalance: Math.round(args.context.balances.currentBalance),
      plannedFreeMoney: Math.round(args.context.balances.plannedFreeMoney),
      periodEndDate: args.context.balances.periodEndDate,
      forecastRisk: resolveRiskLevel(args.context),
    },
    missingInputs: [],
    recommendedActions: [{ priority: 1, action: "wait", reason: "Сначала имеет смысл проверить, какие поступления ещё должны прийти по плану." }],
    evidence: [
      `Всего доходов по плану: ${Math.round(args.context.incomes.currentPeriodTotal)} ₽.`,
      `Из них ещё ожидается: ${Math.round(args.context.incomes.expectedTotal)} ₽.`,
      `Уже подтверждено: ${Math.round(args.context.incomes.confirmedTotal)} ₽.`,
    ],
  };
}

function analyzeForecastCheck(args: {
  context: AdvisorFinancialContext;
}): Pick<FinancialAdviserBrief, "summary" | "recommendedActions" | "evidence" | "missingInputs"> {
  return {
    summary: {
      headline:
        args.context.forecast.firstDeficitDate
          ? `Ближайший риск по плану возникает ${args.context.forecast.firstDeficitDate}`
          : "На текущем горизонте дефицита не видно",
      currentBalance: Math.round(args.context.balances.currentBalance),
      plannedFreeMoney: Math.round(args.context.balances.plannedFreeMoney),
      periodEndDate: args.context.balances.periodEndDate,
      forecastRisk: resolveRiskLevel(args.context),
    },
    missingInputs: [],
    recommendedActions: [
      {
        priority: args.context.forecast.firstDeficitDate ? 2 : 1,
        action: args.context.forecast.firstDeficitDate ? "move_optional_payments" : "wait",
        reason:
          args.context.forecast.firstDeficitDate
            ? "Нужно ослабить давление до ближайшей риск-даты."
            : "Сейчас можно просто держать план под наблюдением.",
      },
    ],
    evidence: [
      args.context.forecast.firstDeficitDate
        ? `Дата риска: ${args.context.forecast.firstDeficitDate}.`
        : "Критической даты риска на горизонте нет.",
      `Минимальный баланс по прогнозу: ${Math.round(args.context.forecast.minimumBalance)} ₽.`,
    ],
  };
}

export function buildFinancialAdviserBrief(args: {
  question: string;
  classification: AdvisorQuestionClassification;
  state: DecisionCoreState;
  financialContext: AdvisorFinancialContext;
}): FinancialAdviserBrief {
  const base = buildBaseBrief({
    classification: args.classification,
    context: args.financialContext,
  });

  switch (args.classification.type) {
    case "cashflow_delay":
      return { ...base, ...analyzeCashflowDelay({ state: args.state, context: args.financialContext, classification: args.classification }) };
    case "purchase_decision":
      return { ...base, ...analyzePurchase({ context: args.financialContext, classification: args.classification, question: args.question }) };
    case "debt_strategy":
      return { ...base, ...analyzeDebtStrategy({ context: args.financialContext, state: args.state }) };
    case "expense_control":
      return { ...base, ...analyzeExpenseControl({ context: args.financialContext }) };
    case "goal_planning":
    case "saving_plan":
      return { ...base, ...analyzeGoalPlanning({ context: args.financialContext, classification: args.classification }) };
    case "investment":
      return { ...base, ...analyzeInvestment({ context: args.financialContext }) };
    case "income_review":
      return { ...base, ...analyzeIncomeReview({ context: args.financialContext }) };
    case "forecast_check":
    default:
      return { ...base, ...analyzeForecastCheck({ context: args.financialContext }) };
  }
}

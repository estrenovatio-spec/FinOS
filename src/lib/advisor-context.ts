import { getCurrentBudgetPeriod } from "@/lib/budget-period";
import type { DecisionCoreSnapshot } from "@/lib/decision-core/types";
import { isExpectedEventVisibleToday } from "@/lib/expected-events";
import { formatIsoDate } from "@/lib/format-date";
import { formatMoney } from "@/lib/format-money";
import type {
  ExpectedEventReminderState,
  ResolvedMoneySetupIncomeSource,
} from "@/lib/money-setup";
import type { PlannedFreeMoneyView } from "@/lib/free-money";
import { buildPlannedFreeMoneySummary } from "@/lib/planned-free-money-presenter";
import type { Locale, Transaction } from "@/types";
import type {
  CategoryBudget,
  DebtItem,
  RecurringTransaction,
  SavingsGoal,
} from "@/types/planning";
import type { CategoryDefinition } from "@/types";

export type AdvisorContextCard = {
  id: "balance" | "free_money" | "forecast" | "goals" | "recurring" | "limits";
  label: string;
  value: string;
  note: string;
};

export type AdvisorFinancialIncomeStatus = "expected" | "confirmed" | "overdue" | "snoozed";

export type AdvisorFinancialContext = {
  asOfDate: string;
  balances: {
    currentBalance: number;
    plannedFreeMoney: number;
    periodEndDate: string;
  };
  incomes: {
    currentPeriodTotal: number;
    expectedTotal: number;
    confirmedTotal: number;
    recurring: Array<{
      id: string;
      title: string;
      amount: number;
      nextDate: string;
      status: AdvisorFinancialIncomeStatus;
    }>;
    oneOff: Array<{
      id: string;
      title: string;
      amount: number;
      date: string;
      status: AdvisorFinancialIncomeStatus;
    }>;
  };
  expenses: {
    recurringTotal: number;
    recurring: Array<{
      id: string;
      title: string;
      amount: number;
      nextDate: string;
      status: "active" | "paused" | "ended";
    }>;
    plannedBudgetsTotal: number;
    budgets: Array<{
      category: string;
      limit: number;
      spent: number;
      remaining: number;
    }>;
    debtPaymentsTotal: number;
    otherMandatoryPaymentsTotal: number;
  };
  goals: Array<{
    title: string;
    targetAmount: number;
    currentAmount: number;
    deadline: string | null;
  }>;
  forecast: {
    minimumBalance: number;
    firstDeficitDate: string | null;
    nearestRiskExplanation: string | null;
  };
};

export type AdvisorFinancialDebugSummary = {
  currentBalance: number;
  plannedFreeMoney: number;
  periodEndDate: string;
  incomeSourcesCount: number;
  recurringIncomeTotal: number;
  oneOffIncomeTotal: number;
  expectedIncomeTotal: number;
  recurringExpensesTotal: number;
  plannedBudgetsTotal: number;
  goalsCount: number;
  nearestRiskDate: string | null;
};

export type AdvisorContextView = {
  cards: AdvisorContextCard[];
  suggestedQuestions: string[];
  financialContext: AdvisorFinancialContext;
  debugSummary: AdvisorFinancialDebugSummary;
};

function getCategoryLabel(
  categoryId: string,
  categories: CategoryDefinition[] | undefined,
): string {
  return categories?.find((item) => item.id === categoryId)?.labels?.ru ?? categoryId;
}

function roundAmount(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function resolveIncomeStatus(
  income: ResolvedMoneySetupIncomeSource,
  reminderStates: ExpectedEventReminderState[] | undefined,
  today: string,
): AdvisorFinancialIncomeStatus {
  if (
    !isExpectedEventVisibleToday(
      `income:${income.id}:${income.occurrenceDate}`,
      reminderStates,
      today,
    )
  ) {
    return "snoozed";
  }

  if (income.status === "received") return "confirmed";
  if (income.status === "overdue_unconfirmed" || income.status === "due_today") return "overdue";
  return "expected";
}

function collectOneOffIncomes(args: {
  incomes: ResolvedMoneySetupIncomeSource[];
  periodStartDate: string;
  periodEndDate: string;
  reminderStates: ExpectedEventReminderState[] | undefined;
  today: string;
}) {
  return args.incomes
    .filter((income) => income.recurrence === "once")
    .filter(
      (income) =>
        income.occurrenceDate >= args.periodStartDate && income.occurrenceDate <= args.periodEndDate,
    )
    .map((income) => ({
      id: income.id,
      title: income.label,
      amount: roundAmount(income.expectedAmount),
      date: income.occurrenceDate,
      status: resolveIncomeStatus(income, args.reminderStates, args.today),
    }));
}

function collectRecurringIncomes(args: {
  recurringTransactions: RecurringTransaction[];
  incomes: ResolvedMoneySetupIncomeSource[];
  periodEndDate: string;
  reminderStates: ExpectedEventReminderState[] | undefined;
  today: string;
}) {
  const mappedFromSources = args.incomes
    .filter((income) => income.recurrence !== "once")
    .filter((income) => income.occurrenceDate <= args.periodEndDate)
    .map((income) => ({
      id: income.id,
      title: income.label,
      amount: roundAmount(income.expectedAmount),
      nextDate: income.occurrenceDate,
      status: resolveIncomeStatus(income, args.reminderStates, args.today),
    }));

  const seenIds = new Set(mappedFromSources.map((income) => income.id));
  const fallbackRecurring = args.recurringTransactions
    .filter((item) => item.enabled && item.type === "income")
    .filter((item) => item.nextRunDate <= args.periodEndDate)
    .filter((item) => !seenIds.has(item.id))
    .map((item) => ({
      id: item.id,
      title: item.note || item.categoryId,
      amount: roundAmount(item.amount),
      nextDate: item.nextRunDate,
      status: item.nextRunDate < args.today ? ("overdue" as const) : ("expected" as const),
    }));

  return [...mappedFromSources, ...fallbackRecurring].sort((left, right) =>
    left.nextDate.localeCompare(right.nextDate),
  );
}

function collectRecurringExpenses(args: {
  recurringTransactions: RecurringTransaction[];
  periodEndDate: string;
  today: string;
}) {
  return args.recurringTransactions
    .filter((item) => item.type === "expense")
    .filter((item) => item.enabled || item.endDate == null || item.endDate >= args.today)
    .filter((item) => item.nextRunDate <= args.periodEndDate || !item.enabled)
    .map((item) => ({
      id: item.id,
      title: item.note || item.categoryId,
      amount: roundAmount(item.amount),
      nextDate: item.nextRunDate,
      status:
        !item.enabled ? ("paused" as const) : item.endDate && item.endDate < args.today ? ("ended" as const) : ("active" as const),
    }))
    .sort((left, right) => left.nextDate.localeCompare(right.nextDate));
}

function collectBudgetBreakdown(args: {
  today: string;
  budgetMonthStartDay: number;
  categoryBudgets: CategoryBudget[];
  categories?: CategoryDefinition[];
  transactions?: Transaction[];
}) {
  const period = getCurrentBudgetPeriod(
    args.budgetMonthStartDay,
    new Date(`${args.today}T12:00:00`),
  );

  return args.categoryBudgets
    .filter((budget) => budget.monthlyLimit > 0)
    .map((budget) => {
      const spent = roundAmount(
        (args.transactions ?? []).reduce((sum, transaction) => {
          if (
            transaction.type !== "expense" ||
            transaction.categoryId !== budget.categoryId ||
            transaction.date < period.from ||
            transaction.date > period.to
          ) {
            return sum;
          }
          return sum + Math.abs(transaction.amount);
        }, 0),
      );

      return {
        category: getCategoryLabel(budget.categoryId, args.categories),
        limit: roundAmount(budget.monthlyLimit),
        spent,
        remaining: Math.max(roundAmount(budget.monthlyLimit) - spent, 0),
      };
    })
    .sort((left, right) => right.limit - left.limit);
}

function calculateForecastMinimumBalance(snapshot: DecisionCoreSnapshot): number {
  if (!snapshot.forecast.days || snapshot.forecast.days.length === 0) return 0;
  return Math.round(
    snapshot.forecast.days.reduce(
      (minValue, day) => Math.min(minValue, day.endBalance),
      snapshot.forecast.days[0]?.endBalance ?? 0,
    ),
  );
}

export function buildAdvisorContext(args: {
  locale: Locale;
  today?: string;
  currentBalance: number;
  decision: DecisionCoreSnapshot;
  recurringTransactions: RecurringTransaction[];
  goals: SavingsGoal[];
  debts: DebtItem[];
  categoryBudgets: CategoryBudget[];
  plannedFreeMoney?: PlannedFreeMoneyView;
  transactions?: Transaction[];
  categories?: CategoryDefinition[];
  budgetMonthStartDay?: number;
  expectedEventReminderStates?: ExpectedEventReminderState[];
}): AdvisorContextView {
  const today =
    args.today
    ?? args.decision.forecast.days?.[0]?.date
    ?? new Date().toISOString().slice(0, 10);
  const periodEndDate = args.plannedFreeMoney?.periodEndDate ?? args.decision.forecast.horizonEndDate;
  const periodStartDate = args.plannedFreeMoney?.periodStartDate ?? today;
  const recurringExpenses = args.recurringTransactions.filter(
    (item) => item.enabled && item.type === "expense",
  ).length;
  const recurringIncome = args.recurringTransactions.filter(
    (item) => item.enabled && item.type === "income",
  ).length;
  const activeGoals = args.goals.length;
  const activeBudgets = args.categoryBudgets.filter((budget) => budget.monthlyLimit > 0).length;
  const riskDate = args.decision.forecast.firstDeficitDate ?? args.decision.nextRisk?.date ?? null;
  const freeMoneySummary = buildPlannedFreeMoneySummary(args.locale, args.plannedFreeMoney);
  const plannedBreakdown = args.plannedFreeMoney?.breakdown;
  const oneOffIncomes = collectOneOffIncomes({
    incomes: args.decision.resolvedIncomeSources,
    periodStartDate,
    periodEndDate,
    reminderStates: args.expectedEventReminderStates,
    today,
  });
  const recurringIncomes = collectRecurringIncomes({
    recurringTransactions: args.recurringTransactions,
    incomes: args.decision.resolvedIncomeSources,
    periodEndDate,
    reminderStates: args.expectedEventReminderStates,
    today,
  });
  const recurringExpenseItems = collectRecurringExpenses({
    recurringTransactions: args.recurringTransactions,
    periodEndDate,
    today,
  });
  const budgetBreakdown = collectBudgetBreakdown({
    today,
    budgetMonthStartDay: args.budgetMonthStartDay ?? 1,
    categoryBudgets: args.categoryBudgets,
    categories: args.categories,
    transactions: args.transactions,
  });
  const forecastMinimumBalance = calculateForecastMinimumBalance(args.decision);

  const financialContext: AdvisorFinancialContext = {
    asOfDate: today,
    balances: {
      currentBalance: roundAmount(args.currentBalance),
      plannedFreeMoney: roundAmount(args.plannedFreeMoney?.amount),
      periodEndDate,
    },
    incomes: {
      currentPeriodTotal:
        recurringIncomes.reduce((sum, income) => sum + income.amount, 0)
        + oneOffIncomes.reduce((sum, income) => sum + income.amount, 0),
      expectedTotal:
        recurringIncomes
          .filter((income) => income.status !== "confirmed")
          .reduce((sum, income) => sum + income.amount, 0)
        + oneOffIncomes
          .filter((income) => income.status !== "confirmed")
          .reduce((sum, income) => sum + income.amount, 0),
      confirmedTotal:
        recurringIncomes
          .filter((income) => income.status === "confirmed")
          .reduce((sum, income) => sum + income.amount, 0)
        + oneOffIncomes
          .filter((income) => income.status === "confirmed")
          .reduce((sum, income) => sum + income.amount, 0),
      recurring: recurringIncomes,
      oneOff: oneOffIncomes,
    },
    expenses: {
      recurringTotal: roundAmount(plannedBreakdown?.recurringPayments),
      recurring: recurringExpenseItems,
      plannedBudgetsTotal: roundAmount(plannedBreakdown?.essentialPlannedSpending),
      budgets: budgetBreakdown,
      debtPaymentsTotal: roundAmount(
        args.debts.reduce((sum, debt) => sum + Math.max(debt.minPayment, 0), 0),
      ),
      otherMandatoryPaymentsTotal: roundAmount(plannedBreakdown?.otherMandatoryPayments),
    },
    goals: args.goals.map((goal) => ({
      title: goal.name,
      targetAmount: roundAmount(goal.targetAmount),
      currentAmount: roundAmount(goal.savedAmount),
      deadline: goal.deadline,
    })),
    forecast: {
      minimumBalance: forecastMinimumBalance,
      firstDeficitDate: args.decision.forecast.firstDeficitDate,
      nearestRiskExplanation:
        args.decision.constraintExplanation?.summary
        ?? args.decision.nextRisk?.note
        ?? null,
    },
  };

  const cards: AdvisorContextCard[] = [
    {
      id: "balance",
      label: args.locale === "ru" ? "Сейчас в кошельке" : "Available now",
      value: `${formatMoney(args.currentBalance, args.locale)} ₽`,
      note:
        args.locale === "ru"
          ? "Это фактический остаток на сегодня."
          : "This is your actual balance as of today.",
    },
    {
      id: "free_money",
      label:
        freeMoneySummary?.subtitle != null
          ? `${freeMoneySummary.label} ${freeMoneySummary.subtitle}`
          : args.locale === "ru"
            ? "Можно потратить"
            : "Free money",
      value: freeMoneySummary?.value ?? (args.locale === "ru" ? "0 ₽" : "0 RUB"),
      note:
        freeMoneySummary?.caption ??
        (args.locale === "ru"
          ? "Это итог по текущему плану до конца периода."
          : "This is the plan result until the end of the current period."),
    },
    {
      id: "forecast",
      label: args.locale === "ru" ? "Прогноз денег" : "Money forecast",
      value:
        riskDate == null
          ? args.locale === "ru"
            ? "Без дефицита"
            : "No deficit"
          : args.locale === "ru"
            ? `Риск ${formatIsoDate(riskDate, args.locale)}`
            : `Risk on ${formatIsoDate(riskDate, args.locale)}`,
      note:
        riskDate == null
          ? args.locale === "ru"
            ? "На текущем горизонте дефицит не ожидается."
            : "No deficit is expected on the current horizon."
          : args.locale === "ru"
            ? "Есть дата, где денег может не хватить."
            : "There is a date where money may run short.",
    },
    {
      id: "goals",
      label: args.locale === "ru" ? "Цели" : "Goals",
      value: String(activeGoals),
      note:
        args.locale === "ru"
          ? "Здесь учтены цели, сроки и уже накопленные суммы."
          : "This includes goals, deadlines, and current progress.",
    },
    {
      id: "recurring",
      label: args.locale === "ru" ? "Регулярные платежи и доходы" : "Recurring items",
      value:
        args.locale === "ru"
          ? `${recurringExpenses} платежей · ${recurringIncome} доходов`
          : `${recurringExpenses} payments · ${recurringIncome} incomes`,
      note:
        args.locale === "ru"
          ? "Советник видит ожидаемые поступления и постоянные списания."
          : "The advisor sees expected income and recurring outflows.",
    },
    {
      id: "limits",
      label: args.locale === "ru" ? "Лимиты и базовые траты" : "Limits and basics",
      value:
        args.locale === "ru"
          ? `${activeBudgets} активных лимитов`
          : `${activeBudgets} active limits`,
      note:
        args.locale === "ru"
          ? "Плановые траты по лимитам уже входят в расчёт."
          : "Planned spending by limits is already included.",
    },
  ];

  const suggestedQuestions =
    args.locale === "ru"
      ? [
          "Хватает ли денег до конца периода?",
          "Что сейчас сильнее всего давит на бюджет?",
          "Какие доходы у меня ещё ожидаются?",
          "Какие платежи сильнее всего влияют на свободные деньги?",
          "Что будет, если доход задержится на неделю?",
        ]
      : [
          "Do I have enough money until the end of the period?",
          "What is putting the most pressure on my budget right now?",
          "What income is still expected this period?",
          "Which payments affect my free money the most?",
          "What happens if income is delayed by a week?",
        ];

  const debugSummary: AdvisorFinancialDebugSummary = {
    currentBalance: financialContext.balances.currentBalance,
    plannedFreeMoney: financialContext.balances.plannedFreeMoney,
    periodEndDate: financialContext.balances.periodEndDate,
    incomeSourcesCount:
      financialContext.incomes.recurring.length + financialContext.incomes.oneOff.length,
    recurringIncomeTotal: financialContext.incomes.recurring.reduce(
      (sum, income) => sum + income.amount,
      0,
    ),
    oneOffIncomeTotal: financialContext.incomes.oneOff.reduce((sum, income) => sum + income.amount, 0),
    expectedIncomeTotal: financialContext.incomes.expectedTotal,
    recurringExpensesTotal: financialContext.expenses.recurringTotal,
    plannedBudgetsTotal: financialContext.expenses.plannedBudgetsTotal,
    goalsCount: financialContext.goals.length,
    nearestRiskDate: financialContext.forecast.firstDeficitDate,
  };

  return { cards, suggestedQuestions, financialContext, debugSummary };
}

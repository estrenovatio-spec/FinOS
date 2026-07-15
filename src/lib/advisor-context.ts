import type { DecisionCoreSnapshot } from "@/lib/decision-core/types";
import { formatIsoDate } from "@/lib/format-date";
import { formatMoney } from "@/lib/format-money";
import type { PlannedFreeMoneyView } from "@/lib/free-money";
import { buildPlannedFreeMoneySummary } from "@/lib/planned-free-money-presenter";
import type { Locale } from "@/types";
import type { CategoryBudget, DebtItem, RecurringTransaction, SavingsGoal } from "@/types/planning";

export type AdvisorContextCard = {
  id: "balance" | "free_money" | "forecast" | "goals" | "recurring" | "limits";
  label: string;
  value: string;
  note: string;
};

export type AdvisorContextView = {
  cards: AdvisorContextCard[];
  suggestedQuestions: string[];
};

export function buildAdvisorContext(args: {
  locale: Locale;
  currentBalance: number;
  decision: DecisionCoreSnapshot;
  recurringTransactions: RecurringTransaction[];
  goals: SavingsGoal[];
  debts: DebtItem[];
  categoryBudgets: CategoryBudget[];
  plannedFreeMoney?: PlannedFreeMoneyView;
}): AdvisorContextView {
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

  const cards: AdvisorContextCard[] = [
    {
      id: "balance",
      label: args.locale === "ru" ? "Сейчас в кошельке" : "Available now",
      value: `${formatMoney(args.currentBalance, args.locale)} ₽`,
      note:
        args.locale === "ru"
          ? "Советник отталкивается от текущего остатка."
          : "The advisor starts from your current balance.",
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
          ? "Советник использует тот же расчёт, что и Today."
          : "The advisor uses the same calculation as Today."),
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
            ? "На текущем горизонте всё спокойно."
            : "Everything looks stable on the current horizon."
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
          ? "Советник учитывает накопления и дедлайны."
          : "The advisor considers savings goals and deadlines.",
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
          ? "Сюда входят постоянные платежи и ожидаемые доходы."
          : "This includes recurring payments and expected income.",
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
          ? "Советник видит ваши лимиты и плановые траты."
          : "The advisor sees your limits and planned spending.",
    },
  ];

  const suggestedQuestions =
    args.locale === "ru"
      ? [
          "Хватает ли денег до конца периода?",
          "Что сейчас сильнее всего давит на бюджет?",
          "Какие платежи лучше перенести, если станет тесно?",
          "Как мои цели влияют на свободные деньги?",
          "Что будет, если доход задержится на неделю?",
        ]
      : [
          "Do I have enough money until the end of the period?",
          "What is putting the most pressure on my budget right now?",
          "Which payments are the safest to move if money gets tight?",
          "How are my goals affecting free money?",
          "What happens if income is delayed by a week?",
        ];

  return { cards, suggestedQuestions };
}

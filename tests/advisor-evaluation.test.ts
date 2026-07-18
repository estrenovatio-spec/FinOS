import assert from "node:assert/strict";
import test from "node:test";
import { buildAdvisorContext } from "@/lib/advisor-context";
import { buildAdvisorQuestionBrief, classifyAdvisorQuestion } from "@/lib/ai/question-classifier";
import { evaluateAdvisorAnswer } from "@/lib/ai/advisor-evaluation";
import { getDefaultCategories } from "@/lib/categories";
import { decisionCoreSnapshot, type DecisionCoreState } from "@/lib/decision-core";
import { calculatePlannedFreeMoneyUntilPeriodEnd } from "@/lib/free-money";
import { emptyMoneySetup } from "@/lib/money-setup";

function makeState(overrides: Partial<DecisionCoreState> = {}): DecisionCoreState {
  return {
    locale: "ru",
    today: "2026-07-15",
    forecastHorizonMonths: 3,
    categories: getDefaultCategories(),
    transactions: [],
    householdFilter: "me",
    recurringTransactions: [
      {
        id: "rent",
        amount: 53000,
        type: "expense",
        categoryId: "rent",
        note: "Аренда",
        skippedDates: [],
        owner: "me",
        frequency: "monthly",
        intervalMonths: 1,
        dayOfMonth: 20,
        nextRunDate: "2026-07-20",
        endDate: null,
        enabled: true,
      },
    ],
    debts: [],
    moneySetup: {
      ...emptyMoneySetup(),
      incomeSources: [
        {
          id: "salary",
          label: "Зарплата",
          expectedDate: "2026-07-25",
          expectedAmount: 68000,
          kind: "salary",
          recurrence: "monthly",
          intervalMonths: 1,
          dayOfMonth: 25,
          endDate: null,
          isPrimary: true,
        },
      ],
      essentialCategoryIds: ["groceries", "transport"],
    },
    categoryBudgets: [
      { categoryId: "groceries", monthlyLimit: 30000 },
      { categoryId: "transport", monthlyLimit: 10000 },
    ],
    budgetMonthStartDay: 1,
    balances: { all: 80925, me: 80925, partner: 0 },
    ...overrides,
  };
}

function makeFinancialContext() {
  const state = makeState();
  const snapshot = decisionCoreSnapshot(state);
  const plannedFreeMoney = calculatePlannedFreeMoneyUntilPeriodEnd(state, snapshot);
  const adviserContext = buildAdvisorContext({
    locale: "ru",
    today: state.today,
    currentBalance: state.balances.me,
    decision: snapshot,
    recurringTransactions: state.recurringTransactions,
    goals: [],
    debts: state.debts,
    categoryBudgets: state.categoryBudgets,
    plannedFreeMoney,
    transactions: state.transactions,
    categories: state.categories,
    budgetMonthStartDay: state.budgetMonthStartDay,
    expectedEventReminderStates: state.moneySetup.expectedEventReminderStates,
  });

  return { state, snapshot, plannedFreeMoney, financialContext: adviserContext.financialContext };
}

test("income evaluation rejects answers that deny income when expected income exists", () => {
  const { financialContext } = makeFinancialContext();
  const result = evaluateAdvisorAnswer({
    question: "Почему у меня нет денег?",
    questionType: "expense_control",
    answer: "У вас нет доходов, поэтому нужно просто сократить расходы.",
    financialContext,
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.includes("answer_uses_forbidden_phrase"));
  assert.ok(result.issues.includes("answer_claims_no_income_despite_expected_income"));
});

test("purchase evaluation requires factual sums and rejects generic credit advice", () => {
  const { financialContext } = makeFinancialContext();
  const result = evaluateAdvisorAnswer({
    question: "Можно ли мне купить машину за 1 500 000 ₽?",
    questionType: "purchase_decision",
    purchaseAmountRub: 1_500_000,
    answer:
      "Стоимость машины 1 500 000 ₽. Свободных денег до конца периода 6 639 ₽, поэтому сейчас не хватает 1 493 361 ₽. Сначала лучше проверить, как покупка повлияет на регулярные платежи и цели.",
    financialContext,
  });

  assert.equal(result.ok, true);
  assert.equal(result.usedFacts.hasAnyAmount, true);
});

test("goal evaluation expects clarification instead of invented certainty", () => {
  const { financialContext, state, plannedFreeMoney } = makeFinancialContext();
  const brief = buildAdvisorQuestionBrief({
    locale: "ru",
    question: "Как мне накопить на дом за 20 млн?",
    state,
    plannedFreeMoneyAmount: plannedFreeMoney.amount ?? 0,
    financialContext,
  });

  assert.match(brief.promptGuide ?? "", /Сначала уточни недостающие данные:/i);

  const result = evaluateAdvisorAnswer({
    question: "Как мне накопить на дом за 20 млн?",
    questionType: "goal_planning",
    answer:
      "Сейчас у вас 80 925 ₽ в кошельке и 15 925 ₽ можно направить по плану. Чтобы посчитать путь к 20 000 000 ₽, нужно понять срок цели и сколько уже отложено именно на дом. За какой срок хотите купить дом?",
    financialContext,
  });

  assert.equal(result.ok, true);
});

test("cash-gap evaluation expects forecast date and payment reasoning", () => {
  const state = makeState({
    balances: { all: 5000, me: 5000, partner: 0 },
    recurringTransactions: [
      {
        id: "rent",
        amount: 53000,
        type: "expense",
        categoryId: "rent",
        note: "Аренда",
        skippedDates: [],
        owner: "me",
        frequency: "monthly",
        intervalMonths: 1,
        dayOfMonth: 20,
        nextRunDate: "2026-07-20",
        endDate: null,
        enabled: true,
      },
    ],
  });
  const snapshot = decisionCoreSnapshot(state);
  const plannedFreeMoney = calculatePlannedFreeMoneyUntilPeriodEnd(state, snapshot);
  const adviserContext = buildAdvisorContext({
    locale: "ru",
    today: state.today,
    currentBalance: state.balances.me,
    decision: snapshot,
    recurringTransactions: state.recurringTransactions,
    goals: [],
    debts: state.debts,
    categoryBudgets: state.categoryBudgets,
    plannedFreeMoney,
    transactions: state.transactions,
    categories: state.categories,
    budgetMonthStartDay: state.budgetMonthStartDay,
    expectedEventReminderStates: state.moneySetup.expectedEventReminderStates,
  });

  const result = evaluateAdvisorAnswer({
    question: "У меня через неделю большой платеж, что делать?",
    questionType: classifyAdvisorQuestion("У меня через неделю большой платеж, что делать?").type,
    answer:
      "По прогнозу первая точка риска приходится на 2026-07-20: в этот день аренда 53 000 ₽ может увести баланс в минус. До этой даты лучше проверить, какие расходы можно сдвинуть и хватит ли ожидаемой зарплаты 68 000 ₽.",
    financialContext: adviserContext.financialContext,
  });

  assert.equal(result.ok, true);
});

test("investing evaluation requires horizon, goal and risk questions", () => {
  const { financialContext } = makeFinancialContext();
  const result = evaluateAdvisorAnswer({
    question: "Куда вложить деньги?",
    questionType: "investment",
    answer:
      "Сначала нужно понять срок, цель и допустимый риск. Без этого нельзя выбирать инструмент даже при текущем остатке 80 925 ₽.",
    financialContext,
  });

  assert.equal(result.ok, true);
});

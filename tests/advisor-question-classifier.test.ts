import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultCategories } from "@/lib/categories";
import type { DecisionCoreState } from "@/lib/decision-core";
import { emptyMoneySetup } from "@/lib/money-setup";
import { buildAdvisorContext } from "@/lib/advisor-context";
import { decisionCoreSnapshot } from "@/lib/decision-core";
import { calculatePlannedFreeMoneyUntilPeriodEnd } from "@/lib/free-money";
import { buildAdvisorQuestionBrief, classifyAdvisorQuestion } from "@/lib/ai/question-classifier";

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
        amount: 40000,
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
    },
    categoryBudgets: [{ categoryId: "groceries", monthlyLimit: 12000 }],
    budgetMonthStartDay: 1,
    balances: { all: 81561, me: 81561, partner: 0 },
    ...overrides,
  };
}

test("classifier marks car purchase questions and extracts the amount", () => {
  const result = classifyAdvisorQuestion("Можно ли купить машину за 1 500 000 ₽?");

  assert.equal(result.type, "purchase_decision");
  assert.equal(result.purchaseKind, "car");
  assert.equal(result.amountRub, 1_500_000);
  assert.equal(result.needsClarification, true);
});

test("classifier marks house purchase questions and extracts the amount", () => {
  const result = classifyAdvisorQuestion("Хочу купить дом за 26 000 000 ₽.");

  assert.equal(result.type, "purchase_decision");
  assert.equal(result.purchaseKind, "home");
  assert.equal(result.amountRub, 26_000_000);
});

test("purchase brief includes financial gap, avoids generic loan advice, and proposes a scenario", () => {
  const state = makeState();
  const snapshot = decisionCoreSnapshot(state);
  const plannedFreeMoney = calculatePlannedFreeMoneyUntilPeriodEnd(state, snapshot);
  const financialContext = buildAdvisorContext({
    locale: "ru",
    today: state.today,
    currentBalance: state.balances.me,
    decision: snapshot,
    recurringTransactions: state.recurringTransactions,
    goals: [],
    debts: state.debts,
    categoryBudgets: state.categoryBudgets,
    plannedFreeMoney,
    categories: state.categories,
    budgetMonthStartDay: state.budgetMonthStartDay,
    transactions: state.transactions,
    expectedEventReminderStates: state.moneySetup.expectedEventReminderStates,
  }).financialContext;

  const brief = buildAdvisorQuestionBrief({
    locale: "ru",
    question: "Можно ли купить машину за 1 500 000 ₽?",
    state,
    plannedFreeMoneyAmount: 6639,
    financialContext,
  });

  assert.match(brief.promptGuide ?? "", /Стоимость покупки: 1500000 ₽/);
  assert.match(brief.promptGuide ?? "", /Итог анализа:/);
  assert.match(brief.promptGuide ?? "", /Финансовый разрыв: 1402439 ₽/);
  assert.doesNotMatch(brief.promptGuide ?? "", /возьмите кредит/i);
  assert.equal(brief.financialBrief?.questionType, "purchase_decision");
  assert.equal(brief.financialBrief?.purchaseAnalysis?.gap, 1_402_439);
});

test("house purchase brief asks clarifying questions when the plan inputs are missing", () => {
  const state = makeState();
  const snapshot = decisionCoreSnapshot(state);
  const plannedFreeMoney = calculatePlannedFreeMoneyUntilPeriodEnd(state, snapshot);
  const financialContext = buildAdvisorContext({
    locale: "ru",
    today: state.today,
    currentBalance: state.balances.me,
    decision: snapshot,
    recurringTransactions: state.recurringTransactions,
    goals: [],
    debts: state.debts,
    categoryBudgets: state.categoryBudgets,
    plannedFreeMoney,
    categories: state.categories,
    budgetMonthStartDay: state.budgetMonthStartDay,
    transactions: state.transactions,
    expectedEventReminderStates: state.moneySetup.expectedEventReminderStates,
  }).financialContext;

  const brief = buildAdvisorQuestionBrief({
    locale: "ru",
    question: "Хочу купить дом за 26 000 000 ₽.",
    state,
    plannedFreeMoneyAmount: 6639,
    financialContext,
  });

  assert.match(brief.promptGuide ?? "", /Сначала уточни недостающие данные:/);
  assert.match(brief.promptGuide ?? "", /За сколько лет хотите купить\?/);
  assert.match(brief.promptGuide ?? "", /Будете использовать ипотеку или только свои деньги\?/);
  assert.match(brief.promptGuide ?? "", /Есть ли уже первоначальный взнос\?/);
});

test("income brief keeps expected income visible and never says that income is missing", () => {
  const state = makeState();
  const snapshot = decisionCoreSnapshot(state);
  const plannedFreeMoney = calculatePlannedFreeMoneyUntilPeriodEnd(state, snapshot);
  const financialContext = buildAdvisorContext({
    locale: "ru",
    today: state.today,
    currentBalance: state.balances.me,
    decision: snapshot,
    recurringTransactions: state.recurringTransactions,
    goals: [],
    debts: state.debts,
    categoryBudgets: state.categoryBudgets,
    plannedFreeMoney,
    categories: state.categories,
    budgetMonthStartDay: state.budgetMonthStartDay,
    transactions: state.transactions,
    expectedEventReminderStates: state.moneySetup.expectedEventReminderStates,
  }).financialContext;

  const brief = buildAdvisorQuestionBrief({
    locale: "ru",
    question: "Какие доходы у меня ожидаются?",
    state,
    plannedFreeMoneyAmount: plannedFreeMoney.amount ?? 0,
    financialContext,
  });

  assert.equal(brief.financialBrief?.questionType, "income_review");
  assert.equal(brief.financialBrief?.expectedIncome[0]?.name, "Зарплата");
  assert.doesNotMatch(brief.promptGuide ?? "", /у вас нет доходов/i);
});

test("expenses brief cites concrete pressure points instead of generic advice", () => {
  const state = makeState();
  const snapshot = decisionCoreSnapshot(state);
  const plannedFreeMoney = calculatePlannedFreeMoneyUntilPeriodEnd(state, snapshot);
  const financialContext = buildAdvisorContext({
    locale: "ru",
    today: state.today,
    currentBalance: state.balances.me,
    decision: snapshot,
    recurringTransactions: state.recurringTransactions,
    goals: [],
    debts: state.debts,
    categoryBudgets: state.categoryBudgets,
    plannedFreeMoney,
    categories: state.categories,
    budgetMonthStartDay: state.budgetMonthStartDay,
    transactions: state.transactions,
    expectedEventReminderStates: state.moneySetup.expectedEventReminderStates,
  }).financialContext;

  const brief = buildAdvisorQuestionBrief({
    locale: "ru",
    question: "Почему у меня постоянно нет денег?",
    state,
    plannedFreeMoneyAmount: plannedFreeMoney.amount ?? 0,
    financialContext,
  });

  assert.equal(brief.financialBrief?.questionType, "expense_control");
  assert.match(brief.promptGuide ?? "", /Факты:/);
  assert.match(brief.promptGuide ?? "", /Аренда/);
  assert.doesNotMatch(brief.promptGuide ?? "", /^сократите расходы$/im);
});

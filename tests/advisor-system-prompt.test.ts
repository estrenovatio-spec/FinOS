import assert from "node:assert/strict";
import test from "node:test";
import { buildAdvisorContext } from "@/lib/advisor-context";
import { getAdvisorSystemPrompt } from "@/lib/ai/advisor-system-prompt";
import { resolveAdvisorModel } from "@/lib/ai/model-router";
import { decisionCoreSnapshot, type DecisionCoreState } from "@/lib/decision-core";
import { calculatePlannedFreeMoneyUntilPeriodEnd } from "@/lib/free-money";
import { emptyMoneySetup } from "@/lib/money-setup";
import { getDefaultCategories } from "@/lib/categories";

function makeState(overrides: Partial<DecisionCoreState> = {}): DecisionCoreState {
  return {
    locale: "ru",
    today: "2026-07-15",
    forecastHorizonMonths: 3,
    categories: getDefaultCategories(),
    transactions: [],
    householdFilter: "me",
    recurringTransactions: [],
    debts: [],
    moneySetup: emptyMoneySetup(),
    categoryBudgets: [],
    budgetMonthStartDay: 1,
    balances: { all: 81000, me: 81000, partner: 0 },
    ...overrides,
  };
}

test("advisor prompt contains the fixed behavior rules and response format", () => {
  const prompt = getAdvisorSystemPrompt({
    locale: "ru",
    periodNote: "до 31 июля 2026",
    cards: [
      {
        label: "Сейчас в кошельке",
        value: "81 000 ₽",
        note: "Это текущий остаток.",
      },
    ],
  });

  assert.match(prompt, /Ты — личный финансовый консультант FIN OS/);
  assert.match(prompt, /Используй только информацию из переданного финансового контекста/);
  assert.match(prompt, /Не придумывай данные и не пересчитывай суммы самостоятельно/);
  assert.match(prompt, /Каждый важный вывод опирай на конкретные суммы, даты или статьи/);
  assert.match(prompt, /Ответ должен быть коротким для мобильного экрана/);
});

test("advisor prompt avoids the banned technical English words in Russian copy", () => {
  const prompt = getAdvisorSystemPrompt({
    locale: "ru",
    cards: [
      {
        label: "Можно потратить",
        value: "7 000 ₽",
        note: "Это сумма до конца месяца.",
      },
    ],
  });

  assert.doesNotMatch(prompt, /\bforecast\b/i);
  assert.doesNotMatch(prompt, /\brecurring\b/i);
  assert.doesNotMatch(prompt, /\bessential\b/i);
  assert.doesNotMatch(prompt, /\bconstraint\b/i);
  assert.doesNotMatch(prompt, /\bplanned\b/i);
});

test("advisor model router maps plans to the intended models", () => {
  assert.equal(resolveAdvisorModel("free"), "gpt-4o-mini");
  assert.equal(resolveAdvisorModel("standard"), "gpt-4o-mini");
  assert.equal(resolveAdvisorModel("pro"), "gpt-4o");
});

test("advisor context passes the financial picture instead of raw transactions", () => {
  const state = makeState({
    recurringTransactions: [
      {
        id: "salary",
        amount: 68000,
        type: "income",
        categoryId: "salary",
        note: "Зарплата",
        skippedDates: [],
        owner: "me",
        frequency: "monthly",
        intervalMonths: 1,
        dayOfMonth: 25,
        nextRunDate: "2026-07-25",
        endDate: null,
        enabled: true,
      },
    ],
    categoryBudgets: [{ categoryId: "groceries", monthlyLimit: 12000 }],
    moneySetup: {
      ...emptyMoneySetup(),
      essentialCategoryIds: ["groceries"],
    },
  });

  const snapshot = decisionCoreSnapshot(state);
  const plannedFreeMoney = calculatePlannedFreeMoneyUntilPeriodEnd(state, snapshot);
  const context = buildAdvisorContext({
    locale: "ru",
    today: state.today,
    currentBalance: state.balances.me,
    decision: snapshot,
    recurringTransactions: state.recurringTransactions,
    goals: [],
    debts: [],
    categoryBudgets: state.categoryBudgets,
    plannedFreeMoney,
    categories: state.categories,
    budgetMonthStartDay: state.budgetMonthStartDay,
    transactions: state.transactions,
    expectedEventReminderStates: state.moneySetup.expectedEventReminderStates,
  });
  const prompt = getAdvisorSystemPrompt({
    locale: "ru",
    cards: context.cards,
    periodNote: "до 31 июля 2026",
    financialContext: context.financialContext,
  });

  assert.ok(context.cards.some((card) => card.id === "balance"));
  assert.ok(context.cards.some((card) => card.id === "free_money"));
  assert.ok(context.cards.some((card) => card.id === "recurring"));
  assert.ok(context.financialContext.incomes.recurring.length > 0);
  assert.match(prompt, /Сейчас в кошельке/);
  assert.match(prompt, /Можно потратить/);
  assert.match(prompt, /Регулярные платежи и доходы/);
  assert.match(prompt, /Структурированный финансовый контекст/);
  assert.match(prompt, /Регулярные доходы:/);
  assert.match(prompt, /Лимиты:/);
});

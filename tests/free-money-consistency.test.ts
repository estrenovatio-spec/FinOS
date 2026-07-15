import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateBalanceAtDate } from "@/lib/decision-core/forecast-days";
import { buildTodayScreenView } from "@/components/today/today-screen-presenter";
import { getDefaultCategories } from "@/lib/categories";
import { decisionCoreSnapshot, type DecisionCoreState } from "@/lib/decision-core";
import { emptyMoneySetup } from "@/lib/money-setup";
import { calculatePlannedFreeMoneyUntilPeriodEnd } from "@/lib/free-money";
import { buildPlannedFreeMoneySummary } from "@/lib/planned-free-money-presenter";
import { buildAdvisorContext } from "@/lib/advisor-context";

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
    moneySetup: {
      ...emptyMoneySetup(),
      essentialCategoryIds: ["groceries", "transport"],
    },
    categoryBudgets: [],
    budgetMonthStartDay: 1,
    balances: { all: 130000, me: 130000, partner: 0 },
    ...overrides,
  };
}

test("planned free money stays identical across Today, Forecast summary and Adviser", () => {
  const state = makeState({
    moneySetup: {
      ...emptyMoneySetup(),
      essentialCategoryIds: ["groceries", "transport"],
      incomeSources: [
        {
          id: "salary",
          label: "Зарплата",
          expectedDate: "2026-07-25",
          expectedAmount: 130000,
          kind: "salary",
          recurrence: "monthly",
          intervalMonths: 1,
          dayOfMonth: 25,
          endDate: null,
          isPrimary: true,
        },
      ],
    },
    categoryBudgets: [
      { categoryId: "groceries", monthlyLimit: 30000 },
      { categoryId: "transport", monthlyLimit: 10000 },
    ],
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
  });

  const snapshot = decisionCoreSnapshot(state);
  const plannedFreeMoney = calculatePlannedFreeMoneyUntilPeriodEnd(state, snapshot);
  const sharedSummary = buildPlannedFreeMoneySummary("ru", plannedFreeMoney);
  const todayView = buildTodayScreenView({
    decision: snapshot,
    locale: "ru",
    transactionCount: state.transactions.length,
    moneySetup: state.moneySetup,
    balances: state.balances,
    plannedFreeMoney,
  });
  const advisorContext = buildAdvisorContext({
    locale: "ru",
    currentBalance: state.balances.me,
    decision: snapshot,
    recurringTransactions: state.recurringTransactions,
    goals: [],
    debts: state.debts,
    categoryBudgets: state.categoryBudgets,
    plannedFreeMoney,
  });

  const todayCard = todayView.overviewItems.find((item) => item.id === "planned-free-money");
  const adviserCard = advisorContext.cards.find((card) => card.id === "free_money");
  assert.ok(sharedSummary);
  assert.equal(plannedFreeMoney.amount, 180000);
  assert.equal(todayCard?.value, sharedSummary?.value);
  assert.equal(adviserCard?.value, sharedSummary?.value);
  assert.equal(adviserCard?.label, `${sharedSummary?.label} ${sharedSummary?.subtitle}`);
  assert.notEqual(plannedFreeMoney.amount, 0);
});

test("Forecast tab and Today presenter both rely on the shared planned-free-money presenter", () => {
  const forecastTab = readFileSync("src/components/app/ForecastTab.tsx", "utf8");
  const todayPresenter = readFileSync("src/components/today/today-screen-presenter.ts", "utf8");

  assert.match(forecastTab, /buildPlannedFreeMoneySummary/);
  assert.match(todayPresenter, /buildPlannedFreeMoneySummary/);
});

test("one scenario gives the same planned result in Today, Forecast period end, Calendar period end and Adviser", () => {
  const state = makeState({
    balances: { all: 0, me: 0, partner: 0 },
    moneySetup: {
      ...emptyMoneySetup(),
      incomeSources: [
        {
          id: "sale",
          label: "Продажа",
          expectedDate: "2026-07-20",
          expectedAmount: 10000,
          kind: "other",
          recurrence: "once",
          intervalMonths: 1,
          dayOfMonth: 20,
          endDate: null,
          isPrimary: true,
        },
      ],
    },
    transactions: [
      {
        id: "expense-1",
        amount: 3000,
        type: "expense",
        categoryId: "other",
        currency: "RUB",
        note: "Покупка",
        date: "2026-07-31",
        owner: "me",
        confirmed: false,
        goalId: null,
        goalAmount: null,
        recurringId: null,
        odometerKm: null,
        fuelLiters: null,
        vehicleId: null,
        transferPairId: null,
        businessTxId: null,
      },
    ],
  });

  const snapshot = decisionCoreSnapshot(state);
  const plannedFreeMoney = calculatePlannedFreeMoneyUntilPeriodEnd(state, snapshot);
  const summary = buildPlannedFreeMoneySummary("ru", plannedFreeMoney);
  const todayView = buildTodayScreenView({
    decision: snapshot,
    locale: "ru",
    transactionCount: state.transactions.length,
    moneySetup: state.moneySetup,
    balances: state.balances,
    plannedFreeMoney,
  });
  const advisorContext = buildAdvisorContext({
    locale: "ru",
    currentBalance: state.balances.me,
    decision: snapshot,
    recurringTransactions: state.recurringTransactions,
    goals: [],
    debts: state.debts,
    categoryBudgets: state.categoryBudgets,
    plannedFreeMoney,
  });

  assert.equal(plannedFreeMoney.amount, 7000);
  assert.equal(summary?.value, "7 000 ₽");
  assert.equal(
    todayView.overviewItems.find((item) => item.id === "planned-free-money")?.value,
    "7 000 ₽",
  );
  assert.equal(
    calculateBalanceAtDate(snapshot.forecast, plannedFreeMoney.periodEndDate ?? ""),
    7000,
  );
  assert.equal(
    advisorContext.cards.find((card) => card.id === "free_money")?.value,
    "7 000 ₽",
  );
});

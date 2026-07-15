import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveDisplayedEndBalance } from "@/components/app/ForecastCalendarView";
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

test("planned free money stays identical across Today, Forecast, Calendar and Adviser", () => {
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
  const periodEndDay = snapshot.forecast.events.find(
    (event) => event.date === plannedFreeMoney.periodEndDate,
  );

  assert.ok(sharedSummary);
  assert.equal(plannedFreeMoney.amount, 180000);
  assert.equal(todayCard?.value, sharedSummary?.value);
  assert.equal(adviserCard?.value, sharedSummary?.value);
  assert.equal(adviserCard?.label, `${sharedSummary?.label} ${sharedSummary?.subtitle}`);
  assert.equal(
    resolveDisplayedEndBalance({
      date: plannedFreeMoney.periodEndDate ?? "",
      forecastDay:
        plannedFreeMoney.periodEndDate == null
          ? null
          : {
              date: plannedFreeMoney.periodEndDate,
              startBalance: periodEndDay?.balanceAfter ?? 0,
              endBalance: periodEndDay?.balanceAfter ?? 0,
              incomeTotal: 0,
              expenseTotal: 0,
              netChange: 0,
              events: [],
            },
      periodFreeMoney: plannedFreeMoney,
    }),
    plannedFreeMoney.amount,
  );
});

test("Forecast tab and Today presenter both rely on the shared planned-free-money presenter", () => {
  const forecastTab = readFileSync("src/components/app/ForecastTab.tsx", "utf8");
  const todayPresenter = readFileSync("src/components/today/today-screen-presenter.ts", "utf8");

  assert.match(forecastTab, /buildPlannedFreeMoneySummary/);
  assert.match(todayPresenter, /buildPlannedFreeMoneySummary/);
});

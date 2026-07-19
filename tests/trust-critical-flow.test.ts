import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildTodayScreenView } from "@/components/today/today-screen-presenter";
import { buildAdvisorContext } from "@/lib/advisor-context";
import { getDefaultCategories } from "@/lib/categories";
import { applyHouseholdSync } from "@/lib/cloud/apply-sync";
import { decisionCoreSnapshot, type DecisionCoreState } from "@/lib/decision-core";
import { calculatePlannedFreeMoneyUntilPeriodEnd } from "@/lib/free-money";
import type { HouseholdPublic, SyncPayload } from "@/lib/household/types";
import { emptyMoneySetup } from "@/lib/money-setup";
import { useCloudStore } from "@/store/useCloudStore";
import { useStore } from "@/store/useStore";
import type { Transaction } from "@/types";
import type { CategoryBudget, RecurringTransaction } from "@/types/planning";

const todayOverviewSource = fs.readFileSync(
  path.join(process.cwd(), "src/components/today/TodayOverview.tsx"),
  "utf8",
);

const household: HouseholdPublic = {
  id: "household-1",
  name: "Мои финансы",
  mode: "solo",
  inviteCode: "ABC123",
  partnerLabel: null,
  memberCount: 1,
};

function makeSyncPayload(overrides: Partial<SyncPayload>): SyncPayload {
  return {
    household,
    memberUserIds: ["user-1"],
    transactions: [],
    categories: getDefaultCategories(),
    savingsGoals: [],
    categoryBudgets: [],
    recurringTransactions: [],
    debts: [],
    moneySetup: emptyMoneySetup(),
    ...overrides,
  };
}

function tx(
  partial: Partial<Transaction> &
    Pick<Transaction, "id" | "amount" | "type" | "categoryId" | "date">,
): Transaction {
  return {
    id: partial.id,
    amount: partial.amount,
    type: partial.type,
    categoryId: partial.categoryId,
    currency: "RUB",
    note: partial.note ?? "",
    date: partial.date,
    owner: partial.owner ?? "me",
    confirmed: partial.confirmed,
    goalId: null,
    goalAmount: null,
    recurringId: partial.recurringId ?? null,
    odometerKm: null,
    fuelLiters: null,
    vehicleId: null,
    transferPairId: null,
    businessTxId: null,
  };
}

function recurring(
  partial: Partial<RecurringTransaction> &
    Pick<
      RecurringTransaction,
      "id" | "amount" | "type" | "categoryId" | "nextRunDate" | "frequency"
    >,
): RecurringTransaction {
  return {
    id: partial.id,
    amount: partial.amount,
    type: partial.type,
    categoryId: partial.categoryId,
    note: partial.note ?? "",
    skippedDates: partial.skippedDates ?? [],
    owner: partial.owner ?? "me",
    frequency: partial.frequency,
    intervalMonths: partial.intervalMonths ?? 1,
    dayOfMonth: partial.dayOfMonth ?? 15,
    nextRunDate: partial.nextRunDate,
    endDate: partial.endDate ?? null,
    enabled: partial.enabled ?? true,
    updatedAt: partial.updatedAt,
  };
}

function makeState(overrides: Partial<DecisionCoreState> = {}): DecisionCoreState {
  return {
    locale: "ru",
    today: "2026-07-18",
    forecastHorizonMonths: 3,
    categories: getDefaultCategories(),
    transactions: [],
    householdFilter: "me",
    recurringTransactions: [],
    debts: [],
    moneySetup: {
      ...emptyMoneySetup(),
      essentialCategoryIds: ["groceries", "transport"],
      hasNoRequiredFixedExpenses: true,
    },
    categoryBudgets: [],
    budgetMonthStartDay: 1,
    balances: { all: 68115, me: 68115, partner: 0 },
    ...overrides,
  };
}

test("goal survives cloud hydrate when local browser goal is still unsynced", () => {
  const previousStore = useStore.getState();
  const previousCloud = useCloudStore.getState();

  useStore.setState({
    ...previousStore,
    transactions: [],
    categories: getDefaultCategories(),
    savingsGoals: [
      {
        id: "goal-car",
        name: "Автомобиль",
        targetAmount: 1500000,
        savedAmount: 0,
        deadline: "2027-12-01",
        monthlyContribution: null,
        kind: "custom",
        emergencyMonths: null,
        updatedAt: "2026-07-18T09:00:00.000Z",
      },
    ],
  });

  useCloudStore.setState({
    ...previousCloud,
    token: "token-1",
    household,
    lastSyncedAt: "2026-07-18T09:05:00.000Z",
    pendingGoalIds: [],
    deletedRecurringIds: [],
    deletedDebtIds: [],
    deletedTransactionIds: [],
    pendingTransactionUpdateIds: {},
    lastSyncedRemoteTxIds: [],
    lastSyncedRemoteCategoryIds: [],
    lastSyncedRemoteGoalIds: [],
    lastSyncedRemoteBudgetCategoryIds: [],
    lastSyncedRemoteRecurringIds: [],
    lastSyncedRemoteDebtIds: [],
  });

  applyHouseholdSync(
    makeSyncPayload({
      savingsGoals: [],
    }),
    "token-1",
  );

  assert.equal(useStore.getState().savingsGoals.length, 1);
  assert.equal(useStore.getState().savingsGoals[0]?.name, "Автомобиль");

  useStore.setState(previousStore);
  useCloudStore.setState(previousCloud);
});

test("debt payment creates an expense transaction, reduces balance, and does not repeat after sync", () => {
  const previousStore = useStore.getState();
  const previousCloud = useCloudStore.getState();

  useStore.setState({
    ...previousStore,
    locale: "ru",
    entryOwner: "me",
    householdFilter: "me",
    forecastHorizonMonths: 3,
    categories: getDefaultCategories(),
    transactions: [],
    savingsGoals: [],
    categoryBudgets: [],
    recurringTransactions: [],
    debts: [
      {
        id: "water-debt",
        name: "ЖКХ вода трудовая",
        owner: "all",
        balance: 21000,
        minPayment: 5000,
        ratePct: null,
        nextPaymentDate: "2026-07-20",
        strategy: "avalanche",
        priority: "normal",
        updatedAt: "2026-07-19T09:00:00.000Z",
      },
    ],
    moneySetup: {
      ...emptyMoneySetup(),
      hasNoRequiredFixedExpenses: true,
    },
    budgetMonthStartDay: 1,
    cashOffsetMe: 97494,
    cashOffsetPartner: 0,
  });

  useCloudStore.setState({
    ...previousCloud,
    token: "token-1",
    household,
    cloudUserId: "user-1",
    householdMemberUserIds: ["user-1"],
    lastSyncedAt: "2026-07-19T09:00:00.000Z",
    deletedRecurringIds: [],
    deletedDebtIds: [],
    deletedTransactionIds: [],
    pendingTransactionUpdateIds: {},
    pendingGoalIds: [],
    lastSyncedRemoteTxIds: [],
    lastSyncedRemoteCategoryIds: [],
    lastSyncedRemoteGoalIds: [],
    lastSyncedRemoteBudgetCategoryIds: [],
    lastSyncedRemoteRecurringIds: [],
    lastSyncedRemoteDebtIds: [],
  });

  const paid = useStore.getState().payDebt("water-debt", 5000, {
    paymentDate: "2026-07-19",
  });
  assert.equal(paid, true);

  const localState = useStore.getState();
  assert.equal(localState.debts[0]?.balance, 16000);
  assert.equal(localState.debts[0]?.nextPaymentDate, "2026-08-20");
  assert.equal(localState.transactions.length, 1);
  assert.equal(localState.transactions[0]?.type, "expense");
  assert.equal(localState.transactions[0]?.amount, 5000);
  assert.equal(localState.transactions[0]?.date, "2026-07-19");
  assert.equal(localState.transactions[0]?.note, "Платёж по долгу — ЖКХ вода трудовая");

  const currentBalance =
    localState.cashOffsetMe +
    localState.transactions.reduce(
      (sum, tx) => sum + (tx.type === "income" ? tx.amount : -tx.amount),
      0,
    );
  assert.equal(currentBalance, 92494);

  const localDecision = decisionCoreSnapshot({
    locale: "ru",
    today: "2026-07-19",
    forecastHorizonMonths: 3,
    categories: localState.categories,
    transactions: localState.transactions,
    householdFilter: "me",
    recurringTransactions: localState.recurringTransactions,
    debts: localState.debts,
    moneySetup: localState.moneySetup,
    categoryBudgets: localState.categoryBudgets,
    budgetMonthStartDay: localState.budgetMonthStartDay,
    balances: { all: currentBalance, me: currentBalance, partner: 0 },
  });

  assert.equal(
    localDecision.forecast.events.some(
      (event) => event.source === "debt_payment" && event.date === "2026-07-20",
    ),
    false,
  );
  assert.equal(
    localDecision.forecast.events.some(
      (event) =>
        event.source === "debt_payment" &&
        event.date === "2026-08-20" &&
        event.amount === -5000,
    ),
    true,
  );

  applyHouseholdSync(
    makeSyncPayload({
      transactions: localState.transactions,
      debts: localState.debts,
      moneySetup: localState.moneySetup,
      balanceOffsets: { "user-1": 97494 },
    }),
    "token-1",
    { replace: true },
  );

  const syncedState = useStore.getState();
  assert.equal(syncedState.transactions.length, 1);
  assert.equal(syncedState.transactions[0]?.note, "Платёж по долгу — ЖКХ вода трудовая");
  assert.equal(syncedState.debts[0]?.balance, 16000);
  assert.equal(syncedState.debts[0]?.nextPaymentDate, "2026-08-20");

  const syncedBalance =
    syncedState.cashOffsetMe +
    syncedState.transactions.reduce(
      (sum, tx) => sum + (tx.type === "income" ? tx.amount : -tx.amount),
      0,
    );
  assert.equal(syncedBalance, 92494);

  useStore.setState(previousStore);
  useCloudStore.setState(previousCloud);
});

test("Today planned free money card keeps the add-operation CTA wired as the primary action", () => {
  const state = makeState({
    balances: { all: 0, me: 0, partner: 0 },
    moneySetup: {
      ...emptyMoneySetup(),
      incomeSources: [
        {
          id: "salary",
          label: "Зарплата",
          expectedDate: "2026-07-25",
          expectedAmount: 10000,
          kind: "salary",
          recurrence: "monthly",
          intervalMonths: 1,
          dayOfMonth: 25,
          endDate: null,
          isPrimary: true,
        },
      ],
      essentialCategoryIds: ["groceries"],
    },
    categoryBudgets: [{ categoryId: "groceries", monthlyLimit: 3000 }],
  });

  const snapshot = decisionCoreSnapshot(state);
  const plannedFreeMoney = calculatePlannedFreeMoneyUntilPeriodEnd(state, snapshot);
  const view = buildTodayScreenView({
    decision: snapshot,
    locale: "ru",
    transactionCount: state.transactions.length,
    moneySetup: state.moneySetup,
    balances: state.balances,
    plannedFreeMoney,
  });

  const card = view.overviewItems.find((item) => item.id === "planned-free-money");
  assert.equal(card?.actionKey, "add_transaction");
  assert.equal(card?.actionLabel, "＋ Добавить операцию");
  assert.equal(card?.actionVariant, "primary");
  assert.match(todayOverviewSource, /w-full rounded-xl bg-primary/);
});

test("rescheduled recurring mortgage keeps identity, moves to the new date and is not duplicated", () => {
  const state = makeState({
    today: "2026-07-18",
    transactions: [
      tx({
        id: "mortgage-july",
        amount: 19000,
        type: "expense",
        categoryId: "other",
        date: "2026-07-18",
        note: "",
        confirmed: false,
        recurringId: "mortgage-recurring",
      }),
    ],
    recurringTransactions: [
      recurring({
        id: "mortgage-recurring",
        amount: 19000,
        type: "expense",
        categoryId: "housing",
        note: "Ипотека",
        nextRunDate: "2026-07-18",
        frequency: "monthly",
        dayOfMonth: 17,
      }),
    ],
  });

  const snapshot = decisionCoreSnapshot(state);
  const mortgageEvents = snapshot.forecast.events.filter(
    (event) =>
      (event.source === "pending_transaction" || event.source === "recurring") &&
      event.amount === -19000,
  );

  assert.equal(
    mortgageEvents.some((event) => event.date === "2026-07-17"),
    false,
  );
  assert.equal(
    mortgageEvents.filter((event) => event.date === "2026-07-18").length,
    1,
  );
  assert.equal(mortgageEvents[0]?.source, "pending_transaction");
  assert.equal(mortgageEvents[0]?.title, "Ипотека");
  assert.equal(mortgageEvents[0]?.paymentSource, "recurring");
  assert.equal(mortgageEvents[0]?.linkedEntityId, "mortgage-recurring");
  assert.equal(snapshot.todayPayments.length, 1);
  assert.equal(snapshot.todayPayments[0]?.title, "Ипотека");
  assert.equal(snapshot.todayPayments[0]?.date, "2026-07-18");
});

test("moving a recurring payment inside the same period does not create extra free money", () => {
  const sharedState: Partial<DecisionCoreState> = {
    today: "2026-07-16",
    balances: { all: 68115, me: 68115, partner: 0 },
  };

  const beforeState = makeState({
    ...sharedState,
    transactions: [
      tx({
        id: "mortgage-before",
        amount: 19000,
        type: "expense",
        categoryId: "housing",
        date: "2026-07-16",
        note: "Ипотека",
        confirmed: false,
        recurringId: "mortgage-recurring",
      }),
    ],
    recurringTransactions: [
      recurring({
        id: "mortgage-recurring",
        amount: 19000,
        type: "expense",
        categoryId: "housing",
        note: "Ипотека",
        nextRunDate: "2026-07-16",
        frequency: "monthly",
        dayOfMonth: 16,
      }),
    ],
  });

  const afterState = makeState({
    ...sharedState,
    transactions: [
      tx({
        id: "mortgage-after",
        amount: 19000,
        type: "expense",
        categoryId: "housing",
        date: "2026-07-18",
        note: "Ипотека",
        confirmed: false,
        recurringId: "mortgage-recurring",
      }),
    ],
    recurringTransactions: [
      recurring({
        id: "mortgage-recurring",
        amount: 19000,
        type: "expense",
        categoryId: "housing",
        note: "Ипотека",
        nextRunDate: "2026-07-18",
        frequency: "monthly",
        dayOfMonth: 16,
      }),
    ],
  });

  const beforeSnapshot = decisionCoreSnapshot(beforeState);
  const afterSnapshot = decisionCoreSnapshot(afterState);
  const beforeAmount = calculatePlannedFreeMoneyUntilPeriodEnd(beforeState, beforeSnapshot).amount;
  const afterAmount = calculatePlannedFreeMoneyUntilPeriodEnd(afterState, afterSnapshot).amount;

  assert.equal(beforeAmount, afterAmount);
});

test("advisor context keeps expected income visible instead of collapsing it into 'no income'", () => {
  const recurringTransactions: RecurringTransaction[] = [
    recurring({
      id: "rent",
      amount: 40000,
      type: "expense",
      categoryId: "rent",
      note: "Аренда",
      nextRunDate: "2026-07-20",
      frequency: "monthly",
      dayOfMonth: 20,
    }),
  ];
  const categoryBudgets: CategoryBudget[] = [
    { categoryId: "groceries", monthlyLimit: 30000 },
    { categoryId: "transport", monthlyLimit: 10000 },
  ];
  const state = makeState({
    today: "2026-07-15",
    balances: { all: 80925, me: 80925, partner: 0 },
    recurringTransactions,
    categoryBudgets,
    moneySetup: {
      ...emptyMoneySetup(),
      essentialCategoryIds: ["groceries", "transport"],
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
  });

  const snapshot = decisionCoreSnapshot(state);
  const plannedFreeMoney = calculatePlannedFreeMoneyUntilPeriodEnd(state, snapshot);
  const advisorContext = buildAdvisorContext({
    locale: "ru",
    currentBalance: state.balances.me,
    decision: snapshot,
    recurringTransactions,
    goals: [],
    debts: [],
    categoryBudgets,
    plannedFreeMoney,
  });

  assert.ok(advisorContext.financialContext.incomes.expectedTotal > 0);
  assert.equal(advisorContext.financialContext.incomes.recurring.length, 1);
  assert.equal(advisorContext.financialContext.incomes.recurring[0]?.title, "Зарплата");
  assert.ok(advisorContext.debugSummary.expectedIncomeTotal > 0);
  assert.equal(advisorContext.cards.some((card) => card.id === "free_money"), true);
});

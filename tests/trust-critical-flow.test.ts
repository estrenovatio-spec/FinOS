import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildTodayScreenView } from "@/components/today/today-screen-presenter";
import { buildAdvisorContext } from "@/lib/advisor-context";
import { getDefaultCategories } from "@/lib/categories";
import { applyHouseholdSync } from "@/lib/cloud/apply-sync";
import { decisionCoreSnapshot, type DecisionCoreState } from "@/lib/decision-core";
import { confirmExpectedPaymentFromInput } from "@/lib/expected-payment-actions";
import {
  buildMatcherState,
  buildSyntheticPaymentTransaction,
  matchInputToExpectedPayments,
} from "@/lib/expected-payment-matcher";
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
    recurringOccurrenceDate: partial.recurringOccurrenceDate ?? null,
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

test("future one-time planned payment survives sync hydration and can be deleted without returning", () => {
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
    debts: [],
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
    token: null,
    household,
    lastSyncedAt: "2026-07-20T09:00:00.000Z",
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

  const transactionId = useStore.getState().addTransaction({
    amount: 12000,
    type: "expense",
    categoryId: "auto",
    currency: "RUB",
    note: "ОСАГО",
    date: "2027-03-15",
    owner: "me",
    confirmed: false,
  });

  const localPlanned = useStore.getState().transactions.find((tx) => tx.id === transactionId) ?? null;
  assert.equal(localPlanned?.confirmed, false);
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      useCloudStore.getState().pendingTransactionUpdateIds,
      transactionId,
    ),
    true,
  );

  applyHouseholdSync(
    makeSyncPayload({
      transactions: [],
    }),
    "token-1",
  );

  assert.equal(
    useStore.getState().transactions.some((tx) => tx.id === transactionId && tx.confirmed === false),
    true,
  );

  const plannedTransaction = useStore.getState().transactions.find((tx) => tx.id === transactionId);
  assert.ok(plannedTransaction);

  applyHouseholdSync(
    makeSyncPayload({
      transactions: [plannedTransaction],
    }),
    "token-1",
  );

  assert.equal(
    useStore.getState().transactions.filter((tx) => tx.id === transactionId).length,
    1,
  );

  useStore.getState().deleteTransaction(transactionId);
  applyHouseholdSync(
    makeSyncPayload({
      transactions: [],
    }),
    "token-1",
  );

  assert.equal(useStore.getState().transactions.some((tx) => tx.id === transactionId), false);

  useStore.setState(previousStore);
  useCloudStore.setState(previousCloud);
});

test("removing a recurring series clears only its pending materialized occurrences", () => {
  const previousStore = useStore.getState();
  const previousCloud = useCloudStore.getState();

  useStore.setState({
    ...previousStore,
    locale: "ru",
    entryOwner: "me",
    householdFilter: "me",
    forecastHorizonMonths: 3,
    categories: getDefaultCategories(),
    transactions: [
      tx({
        id: "r1-pending",
        amount: 10000,
        type: "expense",
        categoryId: "housing",
        date: "2026-07-15",
        note: "Smoke аренда (регулярно)",
        confirmed: false,
        recurringId: "r1",
        recurringOccurrenceDate: "2026-07-15",
      }),
      tx({
        id: "r1-history",
        amount: 10000,
        type: "expense",
        categoryId: "housing",
        date: "2026-06-15",
        note: "Smoke аренда (регулярно)",
        confirmed: true,
        recurringId: "r1",
        recurringOccurrenceDate: "2026-06-15",
      }),
      tx({
        id: "r2-pending",
        amount: 1200,
        type: "expense",
        categoryId: "subscriptions",
        date: "2026-07-18",
        note: "Музыка",
        confirmed: false,
        recurringId: "r2",
        recurringOccurrenceDate: "2026-07-18",
      }),
      tx({
        id: "future-once",
        amount: 400,
        type: "expense",
        categoryId: "services",
        date: "2026-08-01",
        note: "Интернет",
        confirmed: false,
      }),
    ],
    savingsGoals: [],
    categoryBudgets: [],
    recurringTransactions: [
      recurring({
        id: "r1",
        amount: 10000,
        type: "expense",
        categoryId: "housing",
        note: "Smoke аренда",
        nextRunDate: "2026-07-15",
        frequency: "monthly",
      }),
      recurring({
        id: "r2",
        amount: 1200,
        type: "expense",
        categoryId: "subscriptions",
        note: "Музыка",
        nextRunDate: "2026-07-18",
        frequency: "monthly",
      }),
    ],
    debts: [],
    moneySetup: {
      ...emptyMoneySetup(),
      hasNoRequiredFixedExpenses: true,
    },
    budgetMonthStartDay: 1,
    cashOffsetMe: 50000,
    cashOffsetPartner: 0,
  });

  useCloudStore.setState({
    ...previousCloud,
    token: "token-remove-recurring",
    household,
    deletedRecurringIds: [],
    deletedDebtIds: [],
    deletedTransactionIds: [],
    pendingTransactionUpdateIds: {},
    lastSyncedRemoteTxIds: ["r1-pending", "r1-history", "r2-pending", "future-once"],
    lastSyncedRemoteCategoryIds: [],
    lastSyncedRemoteGoalIds: [],
    lastSyncedRemoteBudgetCategoryIds: [],
    lastSyncedRemoteRecurringIds: ["r1", "r2"],
    lastSyncedRemoteDebtIds: [],
  });

  useStore.getState().removeRecurring("r1");

  const nextStore = useStore.getState();
  const nextCloud = useCloudStore.getState();

  assert.equal(nextStore.recurringTransactions.some((item) => item.id === "r1"), false);
  assert.equal(nextStore.transactions.some((transaction) => transaction.id === "r1-pending"), false);
  assert.equal(nextStore.transactions.some((transaction) => transaction.id === "r1-history"), true);
  assert.equal(nextStore.transactions.some((transaction) => transaction.id === "r2-pending"), true);
  assert.equal(nextStore.transactions.some((transaction) => transaction.id === "future-once"), true);
  assert.deepEqual(nextCloud.deletedRecurringIds, ["r1"]);
  assert.deepEqual(nextCloud.deletedTransactionIds, ["r1-pending"]);
  assert.equal(nextCloud.lastSyncedRemoteTxIds.includes("r1-pending"), false);

  const snapshot = decisionCoreSnapshot(
    makeState({
      today: "2026-07-18",
      balances: { all: 50000, me: 50000, partner: 0 },
      transactions: nextStore.transactions,
      recurringTransactions: nextStore.recurringTransactions,
    }),
  );

  assert.equal(snapshot.todayPayments.some((payment) => payment.id === "r1-pending"), false);
  assert.equal(
    snapshot.forecast.events.some(
      (event) =>
        event.source === "pending_transaction" && event.id === "r1-pending",
    ),
    false,
  );

  applyHouseholdSync(
    makeSyncPayload({
      transactions: nextStore.transactions,
      recurringTransactions: nextStore.recurringTransactions,
    }),
    "token-remove-recurring",
  );

  assert.equal(
    useStore.getState().transactions.some((transaction) => transaction.id === "r1-pending"),
    false,
  );

  useStore.setState(previousStore);
  useCloudStore.setState(previousCloud);
});

test("future one-time planned payment is confirmed through the expected-event flow without duplicate reappearance", () => {
  const previousStore = useStore.getState();
  const previousCloud = useCloudStore.getState();

  useStore.setState({
    ...previousStore,
    locale: "ru",
    entryOwner: "me",
    householdFilter: "me",
    forecastHorizonMonths: 3,
    categories: getDefaultCategories(),
    transactions: [
      tx({
        id: "osago-planned",
        amount: 12000,
        type: "expense",
        categoryId: "auto",
        date: "2026-07-20",
        note: "ОСАГО",
        confirmed: false,
      }),
    ],
    savingsGoals: [],
    categoryBudgets: [],
    recurringTransactions: [],
    debts: [],
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
    pendingTransactionUpdateIds: {},
  });

  const match = matchInputToExpectedPayments({
    state: buildMatcherState({
      locale: "ru",
      today: "2026-07-20",
      forecastHorizonMonths: 3,
      categories: getDefaultCategories(),
      transactions: useStore.getState().transactions,
      householdFilter: "me",
      recurringTransactions: [],
      debts: [],
      moneySetup: useStore.getState().moneySetup,
      categoryBudgets: [],
      budgetMonthStartDay: 1,
      balances: { all: 97494, me: 97494, partner: 0 },
    }),
    input: "оплатил осаго 12000",
    parsed: {
      amount: 12000,
      type: "expense",
      categoryId: "auto",
      currency: "RUB",
      note: "ОСАГО",
      date: "2026-07-20",
      owner: "me",
    },
    today: "2026-07-20",
  });

  assert.equal(match.kind, "single");
  if (match.kind !== "single") return;

  const confirmed = confirmExpectedPaymentFromInput({
    candidate: match.candidate,
    actual: buildSyntheticPaymentTransaction(match.candidate, "ОСАГО 12000", 12000),
    transcript: "ОСАГО 12000",
    actions: {
      addTransaction: useStore.getState().addTransaction,
      updateTransaction: useStore.getState().updateTransaction,
      deleteTransaction: useStore.getState().deleteTransaction,
      payDebt: useStore.getState().payDebt,
      updateDebt: useStore.getState().updateDebt,
      updateRecurring: useStore.getState().updateRecurring,
    },
    lookups: {
      recurringTransactions: [],
      debts: [],
    },
  });

  assert.equal(confirmed, true);
  const snapshot = decisionCoreSnapshot(
    makeState({
      today: "2026-07-20",
      balances: { all: 85494, me: 85494, partner: 0 },
      transactions: useStore.getState().transactions,
    }),
  );

  assert.equal(
    snapshot.forecast.events.some((event) => event.id === "osago-planned" && event.source === "pending_transaction"),
    false,
  );
  assert.equal(
    useStore.getState().transactions.filter((tx) => tx.id === "osago-planned" && tx.confirmed === false).length,
    0,
  );

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

test("editing a recurring payment amount preserves its occurrence identity", () => {
  const previousStore = useStore.getState();

  useStore.setState({
    ...previousStore,
    categories: getDefaultCategories(),
    recurringTransactions: [
      recurring({
        id: "internet-recurring",
        amount: 800,
        type: "expense",
        categoryId: "utilities",
        note: "Интернет",
        nextRunDate: "2026-07-18",
        frequency: "monthly",
        dayOfMonth: 18,
      }),
    ],
    transactions: [
      tx({
        id: "internet-pending",
        amount: 800,
        type: "expense",
        categoryId: "utilities",
        date: "2026-07-18",
        note: "Интернет",
        confirmed: false,
        recurringId: "internet-recurring",
        recurringOccurrenceDate: "2026-07-18",
      }),
    ],
  });

  useStore.getState().updateTransaction("internet-pending", { amount: 855 });

  const snapshot = decisionCoreSnapshot({
    locale: "ru",
    today: "2026-07-18",
    forecastHorizonMonths: 3,
    categories: useStore.getState().categories,
    transactions: useStore.getState().transactions,
    householdFilter: "me",
    recurringTransactions: useStore.getState().recurringTransactions,
    debts: [],
    moneySetup: {
      ...emptyMoneySetup(),
      hasNoRequiredFixedExpenses: true,
    },
    categoryBudgets: [],
    budgetMonthStartDay: 1,
    balances: { all: 10000, me: 10000, partner: 0 },
  });

  const julyInternetEvents = snapshot.forecast.events.filter(
    (event) =>
      event.linkedEntityId === "internet-recurring" &&
      event.date === "2026-07-18" &&
      (event.source === "pending_transaction" || event.source === "recurring"),
  );

  assert.equal(useStore.getState().transactions[0]?.recurringOccurrenceDate, "2026-07-18");
  assert.equal(useStore.getState().transactions[0]?.amount, 855);
  assert.equal(julyInternetEvents.length, 1);
  assert.equal(julyInternetEvents[0]?.amount, -855);

  useStore.setState(previousStore);
});

test("deleting a confirmed recurring payment reopens the same occurrence as pending", () => {
  const previousStore = useStore.getState();

  useStore.setState({
    ...previousStore,
    categories: getDefaultCategories(),
    recurringTransactions: [
      recurring({
        id: "mortgage-recurring",
        amount: 19000,
        type: "expense",
        categoryId: "housing",
        note: "Ипотека",
        nextRunDate: "2026-08-16",
        frequency: "monthly",
        dayOfMonth: 16,
      }),
    ],
    transactions: [
      tx({
        id: "mortgage-paid",
        amount: 19000,
        type: "expense",
        categoryId: "housing",
        date: "2026-07-17",
        note: "Ипотека",
        confirmed: true,
        recurringId: "mortgage-recurring",
        recurringOccurrenceDate: "2026-07-16",
      }),
    ],
  });

  useStore.getState().deleteTransaction("mortgage-paid");

  const recurringTransactions = useStore
    .getState()
    .transactions.filter((item) => item.recurringId === "mortgage-recurring");

  assert.equal(recurringTransactions.length, 1);
  assert.equal(recurringTransactions[0]?.confirmed, false);
  assert.equal(recurringTransactions[0]?.date, "2026-07-16");
  assert.equal(recurringTransactions[0]?.recurringOccurrenceDate, "2026-07-16");

  const snapshot = decisionCoreSnapshot({
    locale: "ru",
    today: "2026-07-16",
    forecastHorizonMonths: 3,
    categories: useStore.getState().categories,
    transactions: useStore.getState().transactions,
    householdFilter: "me",
    recurringTransactions: useStore.getState().recurringTransactions,
    debts: [],
    moneySetup: {
      ...emptyMoneySetup(),
      hasNoRequiredFixedExpenses: true,
    },
    categoryBudgets: [],
    budgetMonthStartDay: 1,
    balances: { all: 50000, me: 50000, partner: 0 },
  });

  assert.equal(snapshot.todayPayments.length, 1);
  assert.equal(snapshot.todayPayments[0]?.title, "Ипотека");
  assert.equal(snapshot.todayPayments[0]?.recurringOccurrenceDate, "2026-07-16");

  useStore.setState(previousStore);
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

test("matched debt payment from quick input reduces balance and does not repeat in forecast", () => {
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
        id: "bankrot-ksyu",
        name: "банкрот ксю",
        owner: "all",
        balance: 17850,
        minPayment: 17850,
        ratePct: null,
        nextPaymentDate: "2026-07-20",
        strategy: "avalanche",
        priority: "normal",
        updatedAt: "2026-07-20T09:00:00.000Z",
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
    lastSyncedAt: "2026-07-20T09:00:00.000Z",
  });

  const match = matchInputToExpectedPayments({
    state: buildMatcherState({
      locale: "ru",
      today: "2026-07-20",
      forecastHorizonMonths: 3,
      categories: getDefaultCategories(),
      transactions: useStore.getState().transactions,
      householdFilter: "me",
      recurringTransactions: useStore.getState().recurringTransactions,
      debts: useStore.getState().debts,
      moneySetup: useStore.getState().moneySetup,
      categoryBudgets: useStore.getState().categoryBudgets,
      budgetMonthStartDay: 1,
      balances: { all: 97494, me: 97494, partner: 0 },
    }),
    input: "17850 банкрот ксю",
    parsed: {
      amount: 17850,
      type: "expense",
      categoryId: "banking",
      currency: "RUB",
      note: "банкрот ксю",
      date: "2026-07-20",
      owner: "me",
    },
    today: "2026-07-20",
  });

  assert.equal(match.kind, "single");
  if (match.kind !== "single") return;

  const confirmed = confirmExpectedPaymentFromInput({
    candidate: match.candidate,
    actual: buildSyntheticPaymentTransaction(match.candidate, "17850 банкрот ксю", 17850),
    transcript: "17850 банкрот ксю",
    actions: {
      addTransaction: useStore.getState().addTransaction,
      updateTransaction: useStore.getState().updateTransaction,
      deleteTransaction: useStore.getState().deleteTransaction,
      payDebt: useStore.getState().payDebt,
      updateDebt: useStore.getState().updateDebt,
      updateRecurring: useStore.getState().updateRecurring,
    },
    lookups: {
      recurringTransactions: useStore.getState().recurringTransactions,
      debts: useStore.getState().debts,
    },
  });

  assert.equal(confirmed, true);
  assert.equal(useStore.getState().transactions.length, 1);
  assert.equal(useStore.getState().transactions[0]?.amount, 17850);
  assert.equal(useStore.getState().debts[0]?.balance, 0);

  const currentBalance =
    useStore.getState().cashOffsetMe +
    useStore.getState().transactions.reduce(
      (sum, tx) => sum + (tx.type === "income" ? tx.amount : -tx.amount),
      0,
    );
  assert.equal(currentBalance, 79644);

  const snapshot = decisionCoreSnapshot({
    locale: "ru",
    today: "2026-07-20",
    forecastHorizonMonths: 3,
    categories: useStore.getState().categories,
    transactions: useStore.getState().transactions,
    householdFilter: "me",
    recurringTransactions: useStore.getState().recurringTransactions,
    debts: useStore.getState().debts,
    moneySetup: useStore.getState().moneySetup,
    categoryBudgets: useStore.getState().categoryBudgets,
    budgetMonthStartDay: 1,
    balances: { all: currentBalance, me: currentBalance, partner: 0 },
  });

  assert.equal(
    snapshot.forecast.events.some(
      (event) => event.debtId === "bankrot-ksyu" && event.date === "2026-07-20",
    ),
    false,
  );

  useStore.setState(previousStore);
  useCloudStore.setState(previousCloud);
});

test("partial matched payment keeps only the remaining pending amount in forecast", () => {
  const previousStore = useStore.getState();

  useStore.setState({
    ...previousStore,
    locale: "ru",
    entryOwner: "me",
    householdFilter: "me",
    forecastHorizonMonths: 3,
    categories: getDefaultCategories(),
    transactions: [
      tx({
        id: "mortgage-pending",
        amount: 18000,
        type: "expense",
        categoryId: "housing",
        date: "2026-07-20",
        note: "Ипотека",
        confirmed: false,
        recurringId: "mortgage-recurring",
      }),
    ],
    recurringTransactions: [
      recurring({
        id: "mortgage-recurring",
        amount: 18000,
        type: "expense",
        categoryId: "housing",
        note: "Ипотека",
        nextRunDate: "2026-07-20",
        frequency: "monthly",
        dayOfMonth: 20,
      }),
    ],
    debts: [],
    moneySetup: {
      ...emptyMoneySetup(),
      hasNoRequiredFixedExpenses: true,
    },
    categoryBudgets: [],
    budgetMonthStartDay: 1,
    cashOffsetMe: 50000,
    cashOffsetPartner: 0,
  });

  const match = matchInputToExpectedPayments({
    state: buildMatcherState({
      locale: "ru",
      today: "2026-07-20",
      forecastHorizonMonths: 3,
      categories: getDefaultCategories(),
      transactions: useStore.getState().transactions,
      householdFilter: "me",
      recurringTransactions: useStore.getState().recurringTransactions,
      debts: [],
      moneySetup: useStore.getState().moneySetup,
      categoryBudgets: [],
      budgetMonthStartDay: 1,
      balances: { all: 50000, me: 50000, partner: 0 },
    }),
    input: "5000 ипотека",
    parsed: {
      amount: 5000,
      type: "expense",
      categoryId: "housing",
      currency: "RUB",
      note: "ипотека",
      date: "2026-07-20",
      owner: "me",
    },
    today: "2026-07-20",
  });

  assert.equal(match.kind, "single");
  if (match.kind !== "single") return;

  const confirmed = confirmExpectedPaymentFromInput({
    candidate: match.candidate,
    actual: {
      amount: 5000,
      type: "expense",
      categoryId: "housing",
      currency: "RUB",
      note: "ипотека",
      date: "2026-07-20",
      owner: "me",
      confirmed: true,
      recurringId: "mortgage-recurring",
    },
    transcript: "5000 ипотека",
    actions: {
      addTransaction: useStore.getState().addTransaction,
      updateTransaction: useStore.getState().updateTransaction,
      deleteTransaction: useStore.getState().deleteTransaction,
      payDebt: useStore.getState().payDebt,
      updateDebt: useStore.getState().updateDebt,
      updateRecurring: useStore.getState().updateRecurring,
    },
    lookups: {
      recurringTransactions: useStore.getState().recurringTransactions,
      debts: [],
    },
  });

  assert.equal(confirmed, true);
  assert.equal(
    useStore.getState().transactions.filter((tx) => tx.confirmed === false)[0]?.amount,
    13000,
  );

  const snapshot = decisionCoreSnapshot({
    locale: "ru",
    today: "2026-07-20",
    forecastHorizonMonths: 3,
    categories: useStore.getState().categories,
    transactions: useStore.getState().transactions,
    householdFilter: "me",
    recurringTransactions: useStore.getState().recurringTransactions,
    debts: [],
    moneySetup: useStore.getState().moneySetup,
    categoryBudgets: [],
    budgetMonthStartDay: 1,
    balances: { all: 45000, me: 45000, partner: 0 },
  });

  assert.equal(
    snapshot.forecast.events.filter(
      (event) =>
        event.date === "2026-07-20" &&
        event.amount === -13000 &&
        (event.source === "pending_transaction" || event.source === "recurring"),
    ).length,
    1,
  );

  useStore.setState(previousStore);
});

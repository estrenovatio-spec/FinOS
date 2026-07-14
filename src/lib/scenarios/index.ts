import { getFallbackCategoryId } from "@/lib/categories";
import { decisionCoreSnapshot, type DecisionCoreSnapshot, type DecisionCoreState } from "@/lib/decision-core";
import { calculatePlannedFreeMoneyUntilPeriodEnd } from "@/lib/free-money";
import type { CategoryBudget, RecurringTransaction } from "@/types/planning";

export type FinancialScenario =
  | {
      type: "one_off_expense";
      amount: number;
      date: string;
      title?: string;
    }
  | {
      type: "delay_income";
      incomeSourceId: string;
      newDate: string;
    }
  | {
      type: "change_recurring_amount";
      recurringId: string;
      amount: number;
    }
  | {
      type: "change_budget";
      categoryId: string;
      monthlyLimit: number;
    };

export type ScenarioSummary = {
  plannedFreeMoney: number;
  firstDeficitDate: string | null;
  minimumBalance: number;
  periodEndDate: string | null;
};

export type ScenarioEvaluation = {
  baseline: ScenarioSummary;
  scenario: ScenarioSummary;
  differences: {
    plannedFreeMoney: number;
    minimumBalance: number;
  };
  safe: boolean;
  baselineSnapshot: DecisionCoreSnapshot;
  scenarioSnapshot: DecisionCoreSnapshot;
};

function cloneState(state: DecisionCoreState): DecisionCoreState {
  return structuredClone(state);
}

function summarize(state: DecisionCoreState, snapshot: DecisionCoreSnapshot): ScenarioSummary {
  const planned = calculatePlannedFreeMoneyUntilPeriodEnd(state, snapshot);
  return {
    plannedFreeMoney: planned.amount ?? 0,
    firstDeficitDate: snapshot.forecast.firstDeficitDate,
    minimumBalance: snapshot.forecast.minBalance,
    periodEndDate: planned.periodEndDate,
  };
}

function ensureRecurringExists(
  recurringTransactions: RecurringTransaction[],
  recurringId: string,
): RecurringTransaction {
  const recurring = recurringTransactions.find((item) => item.id === recurringId);
  if (!recurring) {
    throw new Error(`Recurring transaction not found: ${recurringId}`);
  }
  return recurring;
}

function upsertBudget(
  budgets: CategoryBudget[],
  categoryId: string,
  monthlyLimit: number,
): CategoryBudget[] {
  const next = Math.max(0, Math.round(monthlyLimit));
  const index = budgets.findIndex((item) => item.categoryId === categoryId);
  if (index === -1) {
    return [...budgets, { categoryId, monthlyLimit: next }];
  }
  return budgets.map((item, itemIndex) =>
    itemIndex === index ? { ...item, monthlyLimit: next } : item,
  );
}

function applyScenario(
  state: DecisionCoreState,
  scenario: FinancialScenario,
): DecisionCoreState {
  const next = cloneState(state);

  switch (scenario.type) {
    case "one_off_expense": {
      const amount = Math.max(0, Math.round(scenario.amount));
      next.transactions = [
        {
          id: `scenario-expense-${scenario.date}-${amount}`,
          amount,
          type: "expense",
          categoryId: getFallbackCategoryId("expense"),
          currency: "RUB",
          note: scenario.title ?? "Сценарная покупка",
          date: scenario.date,
          owner: "me",
          confirmed: true,
          goalId: null,
          goalAmount: null,
          recurringId: null,
          odometerKm: null,
          fuelLiters: null,
          vehicleId: null,
          transferPairId: null,
          businessTxId: null,
        },
        ...next.transactions,
      ];
      if (scenario.date <= state.today) {
        next.balances = {
          ...next.balances,
          me: next.balances.me - amount,
          all: next.balances.all - amount,
        };
      }
      return next;
    }

    case "delay_income": {
      let found = false;
      next.moneySetup = {
        ...next.moneySetup,
        incomeSources: next.moneySetup.incomeSources.map((source) => {
          if (source.id !== scenario.incomeSourceId) return source;
          found = true;
          return { ...source, expectedDate: scenario.newDate };
        }),
      };
      if (!found) {
        throw new Error(`Income source not found: ${scenario.incomeSourceId}`);
      }
      if (next.moneySetup.nextIncomeDate) {
        next.moneySetup.nextIncomeDate = scenario.newDate;
      }
      return next;
    }

    case "change_recurring_amount": {
      ensureRecurringExists(next.recurringTransactions, scenario.recurringId);
      next.recurringTransactions = next.recurringTransactions.map((item) =>
        item.id === scenario.recurringId
          ? { ...item, amount: Math.max(0, Math.round(scenario.amount)) }
          : item,
      );
      return next;
    }

    case "change_budget": {
      next.categoryBudgets = upsertBudget(
        next.categoryBudgets,
        scenario.categoryId,
        scenario.monthlyLimit,
      );
      if (!next.moneySetup.essentialCategoryIds.includes(scenario.categoryId)) {
        next.moneySetup = {
          ...next.moneySetup,
          essentialCategoryIds: [...next.moneySetup.essentialCategoryIds, scenario.categoryId],
        };
      }
      return next;
    }
  }
}

export function evaluateFinancialScenario(
  state: DecisionCoreState,
  scenario: FinancialScenario,
): ScenarioEvaluation {
  const baselineSnapshot = decisionCoreSnapshot(state);
  const scenarioState = applyScenario(state, scenario);
  const scenarioSnapshot = decisionCoreSnapshot(scenarioState);
  const baseline = summarize(state, baselineSnapshot);
  const scenarioSummary = summarize(scenarioState, scenarioSnapshot);

  return {
    baseline,
    scenario: scenarioSummary,
    differences: {
      plannedFreeMoney: scenarioSummary.plannedFreeMoney - baseline.plannedFreeMoney,
      minimumBalance: scenarioSummary.minimumBalance - baseline.minimumBalance,
    },
    safe: scenarioSummary.firstDeficitDate == null,
    baselineSnapshot,
    scenarioSnapshot,
  };
}

import { countsInBalance } from "@/lib/transaction-confirmed";
import { resolveMoneySetupIncomeSources } from "@/lib/money-setup";
import { isExpectedEventVisibleToday } from "@/lib/expected-events";
import { buildAllowed } from "@/lib/decision-core/allowed";
import { buildAvoid } from "@/lib/decision-core/avoid";
import { buildConstraintExplanation } from "@/lib/decision-core/constraint-explanation";
import { getRequiredFloor } from "@/lib/decision-core/constraint-point";
import { buildEssentialBudgetReserve } from "@/lib/decision-core/essential-budget-reserve";
import { buildForecastLine } from "@/lib/decision-core/forecast-line";
import { buildMainAction } from "@/lib/decision-core/main-action";
import { buildNextRisk } from "@/lib/decision-core/next-risk";
import { buildPeaceIndex } from "@/lib/decision-core/peace-index";
import { resolvePrimaryDecision } from "@/lib/decision-core/primary-decision";
import { calculateDecisionSafeSpending, buildSafeUntil } from "@/lib/decision-core/safe-until";
import { buildStatus } from "@/lib/decision-core/status";
import { buildTodayPayments } from "@/lib/decision-core/today-payments";
import type {
  DecisionCoreContext,
  DecisionCoreResult,
  DecisionCoreSnapshot,
  DecisionCoreState,
} from "@/lib/decision-core/types";

function buildContext(state: DecisionCoreState): DecisionCoreContext {
  const transactions = state.transactions.filter((transaction) =>
    state.householdFilter === "all" ? true : transaction.owner === state.householdFilter,
  );
  const confirmedTransactions = transactions.filter(countsInBalance);
  const safeSpending = calculateDecisionSafeSpending(state);
  const availableNow = state.moneySetup.useHouseholdBalance
    ? state.balances.all
    : state.balances.me;

  return {
    locale: state.locale,
    today: state.today,
    forecastHorizonMonths: state.forecastHorizonMonths,
    categories: state.categories,
    transactions,
    confirmedTransactions,
    recurringTransactions: state.recurringTransactions,
    debts: state.debts,
    moneySetup: state.moneySetup,
    categoryBudgets: state.categoryBudgets,
    budgetMonthStartDay: state.budgetMonthStartDay,
    expectedEventReminderStates:
      state.expectedEventReminderStates ?? state.moneySetup.expectedEventReminderStates,
    availableNow,
    safeSpending,
    resolvedIncomeSources: resolveMoneySetupIncomeSources({
      moneySetup: state.moneySetup,
      confirmedTransactions,
      today: state.today,
      locale: state.locale,
      forecastHorizonMonths: state.forecastHorizonMonths,
    }),
    essentialBudgetReserve: {
      totalRemaining: 0,
      periodFrom: state.today,
      periodTo: state.today,
      items: [],
    },
    forecast: {
      startBalance: availableNow,
      minBalance: availableNow,
      minBalanceDate: null,
      firstDeficitDate: null,
      nextIncomeDate: null,
      horizonEndDate: state.today,
      horizonMonths: state.forecastHorizonMonths,
      events: [],
    },
  };
}

export function decisionCoreSnapshot(state: DecisionCoreState): DecisionCoreSnapshot {
  const ctx = buildContext(state);
  ctx.essentialBudgetReserve = buildEssentialBudgetReserve(ctx);
  ctx.forecast = buildForecastLine(ctx);
  const safeUntil = buildSafeUntil(ctx);
  const todayPayments = buildTodayPayments(ctx);
  const nextRisk = buildNextRisk(ctx);
  const primaryDecision = resolvePrimaryDecision({
    ctx,
    safeUntil,
    todayPayments,
    nextRisk,
  });
  const hasOverduePayments = ctx.transactions.some(
    (transaction) =>
      transaction.confirmed === false &&
      transaction.type === "expense" &&
      transaction.date.slice(0, 10) < ctx.today &&
      isExpectedEventVisibleToday(
        `expense:${transaction.id}:${transaction.date.slice(0, 10)}`,
        ctx.expectedEventReminderStates,
        ctx.today,
      ),
  );
  const hasOverdueDebtPayments = ctx.debts.some(
    (debt) =>
      debt.balance > 0 &&
      debt.minPayment > 0 &&
      debt.nextPaymentDate != null &&
      debt.nextPaymentDate.slice(0, 10) < ctx.today &&
      isExpectedEventVisibleToday(
        `debt:${debt.id}:${debt.nextPaymentDate.slice(0, 10)}`,
        ctx.expectedEventReminderStates,
        ctx.today,
      ),
  );
  const status = buildStatus({
    locale: ctx.locale,
    safeUntil,
    todayPayments,
    nextRisk,
    confirmedTransactionsCount: ctx.confirmedTransactions.length,
    forecast: ctx.forecast,
    requiredFloor: getRequiredFloor(ctx),
    hasOverduePayments: hasOverduePayments || hasOverdueDebtPayments,
    hasIncomeToConfirm: ctx.resolvedIncomeSources.some(
      (source) =>
        (source.status === "due_today" || source.status === "overdue_unconfirmed") &&
        isExpectedEventVisibleToday(
          `income:${source.id}:${source.occurrenceDate}`,
          ctx.expectedEventReminderStates,
          ctx.today,
        ),
    ),
  });
  const mainAction = buildMainAction(primaryDecision, ctx, nextRisk);
  const avoid = buildAvoid(primaryDecision, ctx, nextRisk);
  const allowed = buildAllowed(primaryDecision, ctx);
  const constraintExplanation = buildConstraintExplanation(ctx);
  const peaceIndex = buildPeaceIndex({
    locale: ctx.locale,
    status,
    safeUntil,
    todayPayments,
    nextRisk,
  });

  return {
    status,
    safeUntil,
    todayPayments,
    nextRisk,
    mainAction,
    avoid,
    allowed,
    constraintExplanation,
    peaceIndex,
    hasHistory: ctx.confirmedTransactions.length > 0,
    forecast: ctx.forecast,
    resolvedIncomeSources: ctx.resolvedIncomeSources,
  };
}

export function decisionCore(state: DecisionCoreState): DecisionCoreResult {
  const snapshot = decisionCoreSnapshot(state);
  const { forecast: _forecast, ...result } = snapshot;
  return result;
}

export type {
  DecisionAllowed,
  DecisionAvoid,
  DecisionCoreResult,
  DecisionCoreSnapshot,
  DecisionCoreState,
  DecisionConstraintExplanation,
  DecisionMainAction,
  DecisionNextRisk,
  DecisionPeaceIndex,
  DecisionSafeUntil,
  DecisionStatus,
  DecisionStatusKey,
  DecisionTodayPayment,
} from "@/lib/decision-core/types";

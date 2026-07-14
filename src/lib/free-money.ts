import { getCurrentBudgetPeriod } from "@/lib/budget-period";
import { formatIsoDate } from "@/lib/format-date";
import { formatMoney } from "@/lib/format-money";
import type { DecisionCoreSnapshot, DecisionCoreState } from "@/lib/decision-core";
import type { ResolvedMoneySetupIncomeSource } from "@/lib/money-setup";

export type FreeMoneyBreakdown = {
  currentActualBalance: number;
  recurringPayments: number;
  otherMandatoryPayments: number;
  mandatoryPayments: number;
  essentialPlannedSpending: number;
  otherRequiredExpenses: number;
  freeMoney: number;
  periodEndDate: string;
};

export type PlannedFreeMoneyBreakdown = {
  currentActualBalance: number;
  expectedRecurringIncome: number;
  recurringPayments: number;
  otherMandatoryPayments: number;
  mandatoryPayments: number;
  essentialPlannedSpending: number;
  otherRequiredExpenses: number;
  plannedFreeMoney: number;
  periodStartDate: string;
  periodEndDate: string;
};

export type FreeMoneyView = {
  status: "available" | "restricted" | "unknown";
  amount: number | null;
  periodEndDate: string | null;
  breakdown: FreeMoneyBreakdown | null;
  note: string | null;
};

export type PlannedFreeMoneyView = {
  status: "available" | "restricted" | "unknown";
  amount: number | null;
  periodEndDate: string | null;
  periodStartDate: string | null;
  expectedRecurringIncome: number;
  includesUnconfirmedIncome: boolean;
  breakdown: PlannedFreeMoneyBreakdown | null;
  note: string | null;
};

function rub(amount: number, locale: "ru" | "en"): string {
  return `${formatMoney(amount, locale)} ${locale === "ru" ? "₽" : "RUB"}`;
}

function roundAmount(value: number): number {
  return Math.max(0, Math.round(value));
}

function addDays(iso: string, days: number): Date {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date;
}

function resolveTargetPeriod(state: DecisionCoreState) {
  const currentPeriod = getCurrentBudgetPeriod(
    state.budgetMonthStartDay,
    new Date(`${state.today}T12:00:00`),
  );
  return currentPeriod.to <= state.today
    ? getCurrentBudgetPeriod(state.budgetMonthStartDay, addDays(state.today, 1))
    : currentPeriod;
}

function collectRequiredSpending(
  state: DecisionCoreState,
  snapshot: DecisionCoreSnapshot,
  periodEndDate: string,
) {
  let recurringPayments = 0;
  let otherMandatoryPayments = 0;
  let mandatoryPayments = 0;
  let essentialPlannedSpending = 0;
  let otherRequiredExpenses = 0;

  for (const event of snapshot.forecast.events) {
    if (event.date < state.today || event.date > periodEndDate || event.amount >= 0) continue;

    if (event.source === "essential_budget") {
      essentialPlannedSpending += -event.amount;
      continue;
    }

    if (event.source === "debt_payment") {
      otherMandatoryPayments += -event.amount;
      mandatoryPayments += -event.amount;
      continue;
    }

    if (event.source === "recurring") {
      recurringPayments += -event.amount;
      mandatoryPayments += -event.amount;
      continue;
    }

    if (event.source === "confirmed_transaction" || event.source === "pending_transaction") {
      otherMandatoryPayments += -event.amount;
      mandatoryPayments += -event.amount;
    }
  }

  return {
    recurringPayments,
    otherMandatoryPayments,
    mandatoryPayments,
    essentialPlannedSpending,
    otherRequiredExpenses,
  };
}

function sumExpectedRecurringIncome(
  state: DecisionCoreState,
  snapshot: DecisionCoreSnapshot,
  periodStartDate: string,
  periodEndDate: string,
) {
  const resolved = snapshot.resolvedIncomeSources ?? [];
  let expectedRecurringIncome = 0;
  let includesUnconfirmedIncome = false;

  for (const income of resolved) {
    if (!shouldCountRecurringIncome(income, periodStartDate, periodEndDate)) continue;
    expectedRecurringIncome += Math.round(income.expectedAmount ?? 0);
    if (income.status === "overdue_unconfirmed" || income.status === "due_today") {
      includesUnconfirmedIncome = true;
    }
  }

  for (const event of snapshot.forecast.events) {
    if (event.source !== "recurring" || event.amount <= 0) continue;
    if (event.date < periodStartDate || event.date > periodEndDate) continue;
    expectedRecurringIncome += Math.round(event.amount);
    includesUnconfirmedIncome = true;
  }

  return {
    expectedRecurringIncome,
    includesUnconfirmedIncome,
  };
}

function shouldCountRecurringIncome(
  income: ResolvedMoneySetupIncomeSource,
  periodStartDate: string,
  periodEndDate: string,
): boolean {
  if ((income.recurrence ?? "monthly") === "once") return false;
  if (income.status === "received") return false;
  if (income.occurrenceDate < periodStartDate || income.occurrenceDate > periodEndDate) {
    return false;
  }
  return (income.expectedAmount ?? 0) > 0;
}

export function calculateFreeMoneyUntilPeriodEnd(
  state: DecisionCoreState,
  snapshot: DecisionCoreSnapshot,
): FreeMoneyView {
  const period = resolveTargetPeriod(state);
  const currentActualBalance = roundAmount(
    state.moneySetup.useHouseholdBalance ? state.balances.all : state.balances.me,
  );
  const {
    recurringPayments,
    otherMandatoryPayments,
    mandatoryPayments,
    essentialPlannedSpending,
    otherRequiredExpenses,
  } =
    collectRequiredSpending(state, snapshot, period.to);

  const freeMoney = Math.max(
    currentActualBalance - mandatoryPayments - essentialPlannedSpending - otherRequiredExpenses,
    0,
  );

  const breakdown: FreeMoneyBreakdown = {
    currentActualBalance,
    recurringPayments: roundAmount(recurringPayments),
    otherMandatoryPayments: roundAmount(otherMandatoryPayments),
    mandatoryPayments: roundAmount(mandatoryPayments),
    essentialPlannedSpending: roundAmount(essentialPlannedSpending),
    otherRequiredExpenses: roundAmount(otherRequiredExpenses),
    freeMoney: roundAmount(freeMoney),
    periodEndDate: period.to,
  };

  return {
    status: breakdown.freeMoney > 0 ? "available" : "restricted",
    amount: breakdown.freeMoney,
    periodEndDate: period.to,
    breakdown,
    note:
      breakdown.freeMoney > 0
        ? state.locale === "ru"
          ? `Из уже полученных денег после обязательных платежей и плановых расходов до ${formatIsoDate(period.to, state.locale)} остаётся ${rub(breakdown.freeMoney, state.locale)}.`
          : `After required payments and planned essentials until ${period.to}, ${rub(
              breakdown.freeMoney,
              state.locale,
            )} remains free.`
        : state.locale === "ru"
          ? `Текущих денег пока не остаётся сверх обязательных и плановых расходов до ${formatIsoDate(period.to, state.locale)}.`
          : `No current money remains beyond required and planned spending until ${period.to}.`,
  };
}

export function calculatePlannedFreeMoneyUntilPeriodEnd(
  state: DecisionCoreState,
  snapshot: DecisionCoreSnapshot,
): PlannedFreeMoneyView {
  const period = resolveTargetPeriod(state);
  const currentActualBalance = roundAmount(
    state.moneySetup.useHouseholdBalance ? state.balances.all : state.balances.me,
  );
  const {
    recurringPayments,
    otherMandatoryPayments,
    mandatoryPayments,
    essentialPlannedSpending,
    otherRequiredExpenses,
  } = collectRequiredSpending(state, snapshot, period.to);
  const { expectedRecurringIncome, includesUnconfirmedIncome } = sumExpectedRecurringIncome(
    state,
    snapshot,
    state.today,
    period.to,
  );

  const plannedFreeMoney = Math.max(
    currentActualBalance +
      expectedRecurringIncome -
      mandatoryPayments -
      essentialPlannedSpending -
      otherRequiredExpenses,
    0,
  );

  const breakdown: PlannedFreeMoneyBreakdown = {
    currentActualBalance,
    expectedRecurringIncome: roundAmount(expectedRecurringIncome),
    recurringPayments: roundAmount(recurringPayments),
    otherMandatoryPayments: roundAmount(otherMandatoryPayments),
    mandatoryPayments: roundAmount(mandatoryPayments),
    essentialPlannedSpending: roundAmount(essentialPlannedSpending),
    otherRequiredExpenses: roundAmount(otherRequiredExpenses),
    plannedFreeMoney: roundAmount(plannedFreeMoney),
    periodStartDate: state.today,
    periodEndDate: period.to,
  };

  return {
    status: breakdown.plannedFreeMoney > 0 ? "available" : "restricted",
    amount: breakdown.plannedFreeMoney,
    periodEndDate: period.to,
    periodStartDate: state.today,
    expectedRecurringIncome: breakdown.expectedRecurringIncome,
    includesUnconfirmedIncome,
    note:
      state.locale === "ru"
        ? includesUnconfirmedIncome
          ? `После всех платежей и плановых расходов до ${formatIsoDate(period.to, state.locale)}, если регулярные доходы придут по плану. Поступление ещё не подтверждено.`
          : `После всех платежей и плановых расходов до ${formatIsoDate(period.to, state.locale)}, если регулярные доходы придут по плану.`
        : includesUnconfirmedIncome
          ? `After all payments and planned spending until ${period.to}, if recurring income arrives as planned. The income is not confirmed yet.`
          : `After all payments and planned spending until ${period.to}, if recurring income arrives as planned.`,
    breakdown,
  };
}

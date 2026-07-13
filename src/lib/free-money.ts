import { getCurrentBudgetPeriod } from "@/lib/budget-period";
import { formatMoney } from "@/lib/format-money";
import type { DecisionCoreSnapshot, DecisionCoreState } from "@/lib/decision-core";

export type FreeMoneyBreakdown = {
  currentActualBalance: number;
  mandatoryPayments: number;
  essentialPlannedSpending: number;
  otherRequiredExpenses: number;
  freeMoney: number;
  periodEndDate: string;
};

export type FreeMoneyView = {
  status: "available" | "restricted" | "unknown";
  amount: number | null;
  periodEndDate: string | null;
  breakdown: FreeMoneyBreakdown | null;
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

export function calculateFreeMoneyUntilPeriodEnd(
  state: DecisionCoreState,
  snapshot: DecisionCoreSnapshot,
): FreeMoneyView {
  const currentPeriod = getCurrentBudgetPeriod(
    state.budgetMonthStartDay,
    new Date(`${state.today}T12:00:00`),
  );
  const period =
    currentPeriod.to <= state.today
      ? getCurrentBudgetPeriod(state.budgetMonthStartDay, addDays(state.today, 1))
      : currentPeriod;
  const currentActualBalance = roundAmount(
    state.moneySetup.useHouseholdBalance ? state.balances.all : state.balances.me,
  );

  const requiredRecurringIds = new Set(state.moneySetup.requiredRecurringIds ?? []);
  let mandatoryPayments = 0;
  let essentialPlannedSpending = 0;
  let otherRequiredExpenses = 0;

  for (const event of snapshot.forecast.events) {
    if (event.date < state.today || event.date > period.to || event.amount >= 0) continue;

    if (event.source === "essential_budget") {
      essentialPlannedSpending += -event.amount;
      continue;
    }

    if (event.source === "debt_payment") {
      mandatoryPayments += -event.amount;
      continue;
    }

    if (event.source === "recurring") {
      if (event.recurringId && requiredRecurringIds.has(event.recurringId)) {
        mandatoryPayments += -event.amount;
      }
      continue;
    }

    if (event.source === "confirmed_transaction" || event.source === "pending_transaction") {
      mandatoryPayments += -event.amount;
    }
  }

  const freeMoney = Math.max(
    currentActualBalance - mandatoryPayments - essentialPlannedSpending - otherRequiredExpenses,
    0,
  );

  const breakdown: FreeMoneyBreakdown = {
    currentActualBalance,
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
          ? `После обязательных платежей и плановых базовых трат до ${period.to} остаётся ${rub(
              breakdown.freeMoney,
              state.locale,
            )}.`
          : `After required payments and planned essentials until ${period.to}, ${rub(
              breakdown.freeMoney,
              state.locale,
            )} remains free.`
        : state.locale === "ru"
          ? "Часть обязательных или плановых расходов внутри текущего периода пока не покрыта."
          : "Some required or planned spending inside the current period is not covered yet.",
  };
}

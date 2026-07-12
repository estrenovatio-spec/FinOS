import type {
  DecisionCoreContext,
  DecisionNextRisk,
  DecisionSafeUntil,
  DecisionTodayPayment,
  PrimaryDecision,
} from "@/lib/decision-core/types";
import { getRequiredFloor } from "@/lib/decision-core/constraint-point";

type ResolvePrimaryDecisionInput = {
  ctx: DecisionCoreContext;
  safeUntil: DecisionSafeUntil;
  todayPayments: DecisionTodayPayment[];
  nextRisk: DecisionNextRisk | null;
};

function appendMissingReason(
  missing: Set<"income" | "required_expenses" | "essential_budgets" | "balance">,
  status: string,
) {
  if (status === "missing_income" || status === "unconfirmed_income") {
    missing.add("income");
  }
  if (status === "missing_required_expenses") {
    missing.add("required_expenses");
  }
  if (status === "missing_essential_budgets") {
    missing.add("essential_budgets");
  }
  if (status === "missing_balance") {
    missing.add("balance");
  }
}

function resolveMissingData(ctx: DecisionCoreContext, safeUntil: DecisionSafeUntil): PrimaryDecision | null {
  const missing = new Set<"income" | "required_expenses" | "essential_budgets" | "balance">();

  appendMissingReason(missing, safeUntil.rawStatus);
  appendMissingReason(missing, ctx.safeSpending.status);

  if (missing.size === 0) {
    return null;
  }

  return {
    type: "missing_data",
    missing: [...missing],
  };
}

export function resolvePrimaryDecision(
  input: ResolvePrimaryDecisionInput,
): PrimaryDecision {
  const { ctx, safeUntil, todayPayments, nextRisk } = input;

  const overduePayment =
    ctx.transactions
      .filter(
        (transaction) =>
          transaction.confirmed === false &&
          transaction.type === "expense" &&
          transaction.date.slice(0, 10) < ctx.today,
      )
      .sort((left, right) => {
        if (left.date !== right.date) return left.date.localeCompare(right.date);
        return right.amount - left.amount;
      })[0] ?? null;

  if (overduePayment) {
    return {
      type: "overdue_payment",
      paymentId: overduePayment.id,
      amount: overduePayment.amount,
      dueDate: overduePayment.date.slice(0, 10),
      title: overduePayment.note.trim() || overduePayment.categoryId,
    };
  }

  if (todayPayments.length > 0) {
    const payment = todayPayments[0]!;
    return {
      type: "payment_today",
      paymentId: payment.id,
      amount: payment.amount,
      dueDate: payment.date,
      title: payment.title,
    };
  }

  if (ctx.forecast.startBalance < 0 || ctx.forecast.firstDeficitDate === ctx.today) {
    return {
      type: "current_deficit",
      amount: Math.max(Math.abs(ctx.forecast.minBalance), Math.abs(ctx.forecast.startBalance)),
    };
  }

  const missingDataDecision = resolveMissingData(ctx, safeUntil);
  if (missingDataDecision) {
    return missingDataDecision;
  }

  if (ctx.forecast.firstDeficitDate) {
    return {
      type: "future_deficit",
      amount: Math.abs(Math.min(ctx.forecast.minBalance, 0)),
      riskDate: ctx.forecast.firstDeficitDate,
      title: nextRisk?.date === ctx.forecast.firstDeficitDate ? nextRisk.title : null,
    };
  }

  if (
    nextRisk &&
    !ctx.forecast.firstDeficitDate &&
    getRequiredFloor(ctx) > 0 &&
    ctx.forecast.minBalance <= getRequiredFloor(ctx)
  ) {
    return {
      type: "reserve_required",
      amount: getRequiredFloor(ctx),
      dueDate: nextRisk.date,
      title: nextRisk.title,
    };
  }

  return {
    type: "no_urgent_action",
  };
}

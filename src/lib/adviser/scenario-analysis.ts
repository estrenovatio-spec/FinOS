import { addDaysToIsoDate } from "@/lib/format-date";
import type { AdvisorFinancialContext } from "@/lib/advisor-context";
import type { DecisionCoreState } from "@/lib/decision-core";
import { evaluateFinancialScenario } from "@/lib/scenarios";

export type AdviserScenarioSeverity = "low" | "medium" | "high";

export type ScenarioActionCode =
  | "wait"
  | "move_optional_payments"
  | "cut_optional_spending"
  | "use_reserve"
  | "find_extra_income"
  | "consider_borrowing";

export type AdviserScenarioAction = {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  action: ScenarioActionCode;
  label: string;
  reason: string;
};

export type AdviserScenarioAnalysis = {
  original: {
    incomeDate: string;
  };
  scenario: {
    incomeDate: string;
  };
  impact: {
    worstBalance: number;
    riskDate: string | null;
    plannedFreeMoneyAfter: number;
  };
  severity: AdviserScenarioSeverity;
  actions: AdviserScenarioAction[];
};

function classifySeverity(worstBalance: number, riskDate: string | null): AdviserScenarioSeverity {
  if (riskDate == null && worstBalance >= 0) return "low";
  if (worstBalance <= -20_000) return "high";
  return "medium";
}

function buildScenarioActions(args: {
  severity: AdviserScenarioSeverity;
  currentBalance: number;
  expectedIncomeAmount: number;
}): AdviserScenarioAction[] {
  const shared: AdviserScenarioAction[] = [];

  if (args.severity === "low") {
    shared.push({
      level: 1,
      action: "wait",
      label: "Ничего резко не менять",
      reason: "Текущей ликвидности хватает, чтобы пережить задержку без кассового разрыва.",
    });
    shared.push({
      level: 2,
      action: "move_optional_payments",
      label: "Держать необязательные траты под контролем",
      reason: "Лучше не разгонять расходы, пока ожидаемый доход ещё не пришёл.",
    });
    return shared;
  }

  shared.push({
    level: 2,
    action: "move_optional_payments",
    label: "Сдвинуть необязательные платежи",
    reason: "Это даёт время до поступления денег и снижает давление по датам.",
  });
  shared.push({
    level: 3,
    action: "cut_optional_spending",
    label: "Срезать необязательные траты",
    reason: "Так можно удержать баланс выше нуля до прихода дохода.",
  });

  if (args.currentBalance >= Math.max(10_000, Math.round(args.expectedIncomeAmount * 0.15))) {
    shared.push({
      level: 4,
      action: "use_reserve",
      label: "Использовать резерв",
      reason: "Подушка поможет закрыть временной разрыв без дорогих решений.",
    });
  }

  if (args.severity === "high") {
    shared.push({
      level: 5,
      action: "find_extra_income",
      label: "Искать дополнительный приток денег",
      reason: "Разрыва по датам уже нельзя закрыть только переносом расходов.",
    });
    shared.push({
      level: 6,
      action: "consider_borrowing",
      label: "Рассматривать заёмные деньги только как запасной вариант",
      reason: "До этого стоит проверить перенос платежей, сокращение расходов и резерв.",
    });
  }

  return shared;
}

export function evaluateScenario(args: {
  state: DecisionCoreState;
  financialContext: AdvisorFinancialContext;
  incomeSourceId: string;
  currentIncomeDate: string;
  incomeDelayDays: number;
  expectedIncomeAmount: number;
}): AdviserScenarioAnalysis {
  const delayedDate = addDaysToIsoDate(args.currentIncomeDate, args.incomeDelayDays);
  const result = evaluateFinancialScenario(args.state, {
    type: "delay_income",
    incomeSourceId: args.incomeSourceId,
    newDate: delayedDate,
  });

  const worstBalance = Math.round(result.scenario.minimumBalance);
  const riskDate = result.scenario.firstDeficitDate;
  const severity = classifySeverity(worstBalance, riskDate);

  return {
    original: {
      incomeDate: args.currentIncomeDate,
    },
    scenario: {
      incomeDate: delayedDate,
    },
    impact: {
      worstBalance,
      riskDate,
      plannedFreeMoneyAfter: Math.round(result.scenario.plannedFreeMoney),
    },
    severity,
    actions: buildScenarioActions({
      severity,
      currentBalance: args.financialContext.balances.currentBalance,
      expectedIncomeAmount: args.expectedIncomeAmount,
    }),
  };
}

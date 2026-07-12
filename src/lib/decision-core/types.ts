import type { SafeSpendingResult, SafeSpendingStatus } from "@/lib/safe-spending";
import type {
  MoneySetup,
  MoneySetupIncomeSourceStatus,
  ResolvedMoneySetupIncomeSource,
} from "@/lib/money-setup";
import type {
  CategoryDefinition,
  HouseholdFilter,
  Locale,
  Transaction,
} from "@/types";
import type { CategoryBudget, DebtItem, RecurringTransaction } from "@/types/planning";
import type { EssentialBudgetReserve } from "@/lib/decision-core/essential-budget-reserve";

export type DecisionStatusKey = "calm" | "risk" | "action";

export type DecisionStatus = {
  key: DecisionStatusKey;
  title: string;
  toneClassName: string;
  note?: string;
};

export type ForecastConfidence = "confirmed" | "planned" | "uncertain";

export type DecisionSafeUntil = {
  status: "constraint_found" | "no_risk_in_horizon" | "unknown";
  title: string;
  note: string | null;
  isReady: boolean;
  needsSetup: boolean;
  rawStatus: SafeSpendingStatus;
  safeToday: number | null;
  nextIncomeDate: string | null;
  nextIncomeTitle?: string | null;
  nextIncomeAmount?: number | null;
  horizonEndDate: string | null;
  horizonMonths: 1 | 3 | 6 | null;
  confidence: ForecastConfidence;
  confidenceNote?: string | null;
};

export type DecisionTodayPayment = {
  id: string;
  title: string;
  amount: number;
  date: string;
  isOverdue?: boolean;
  source?: "pending_transaction" | "recurring";
};

export type DecisionNextRisk = {
  kind: "payment" | "debt";
  title: string;
  amount: number;
  date: string;
  daysAway: number;
  label: string;
  note?: string;
  balanceAfter?: number;
  eventId?: string;
  eventSource?: ForecastEventSource;
};

export type DecisionMainActionCommand =
  | {
      type: "confirm_payment";
      paymentId: string;
    }
  | {
      type: "confirm_income_source";
      incomeSourceId: string;
      incomeTitle: string;
      plannedDate: string;
      plannedAmount: number;
      status: Extract<MoneySetupIncomeSourceStatus, "due_today" | "overdue_unconfirmed">;
    }
  | {
      type: "open_money_setup";
      scope: "balance" | "income" | "required_expenses" | "essential_budgets";
    }
  | {
      type: "open_forecast";
      focusDate?: string | null;
      reason?: "current_deficit" | "future_deficit" | "reserve_required";
      eventId?: string | null;
    }
  | {
      type: "open_recurring_operations";
      recurringId?: string | null;
    }
  | {
      type: "add_transaction";
      preset?: {
        type?: "income" | "expense";
        amount?: number;
        categoryId?: string;
        note?: string;
        date?: string;
      };
    }
  | {
      type: "none";
    };

export type DecisionMainAction = {
  type:
    | "pay_overdue"
    | "pay_today"
    | "cover_deficit"
    | "reserve_for_risk"
    | "complete_balance_setup"
    | "complete_income_setup"
    | "complete_required_expenses_setup"
    | "add_first_entry"
    | "confirm_income"
    | "resolve_income_delay"
    | "hold";
  title: string;
  text: string;
  description?: string;
  reason?: string;
  amount?: number | null;
  dueDate?: string | null;
  relatedEntityId?: string | null;
  priority: "critical" | "high" | "medium" | "low";
  command: DecisionMainActionCommand;
};

export type DecisionAvoid = {
  text: string | null;
  reason?: string | null;
};

export type DecisionAllowed = {
  text: string;
  hasRestPermission: boolean;
  status?: "available" | "restricted" | "unknown";
  amount?: number | null;
  horizonDate?: string | null;
  reason?: string | null;
  confidence?: ForecastConfidence;
  confidenceNote?: string | null;
};

export type DecisionConstraintExplanation = {
  date: string;
  kind: "deficit" | "reserve";
  title: string;
  summary: string;
  detail: string | null;
  eventId?: string | null;
  eventTitle?: string | null;
  eventAmount?: number | null;
  balanceAfter: number;
  requiredFloor: number;
  eventCount: number;
  totalDelta: number;
};

export type DecisionPeaceIndex = {
  value: number;
  note: string;
};

export type DecisionCoreResult = {
  status: DecisionStatus;
  safeUntil: DecisionSafeUntil;
  todayPayments: DecisionTodayPayment[];
  nextRisk: DecisionNextRisk | null;
  mainAction: DecisionMainAction;
  avoid: DecisionAvoid;
  allowed: DecisionAllowed;
  constraintExplanation: DecisionConstraintExplanation | null;
  peaceIndex: DecisionPeaceIndex;
  hasHistory: boolean;
};

export type DecisionCoreSnapshot = DecisionCoreResult & {
  forecast: BalanceForecast;
  resolvedIncomeSources: ResolvedMoneySetupIncomeSource[];
};

export type DecisionCoreState = {
  locale: Locale;
  today: string;
  forecastHorizonMonths: 1 | 3 | 6;
  categories: CategoryDefinition[];
  transactions: Transaction[];
  householdFilter: HouseholdFilter;
  recurringTransactions: RecurringTransaction[];
  debts: DebtItem[];
  moneySetup: MoneySetup;
  categoryBudgets: CategoryBudget[];
  budgetMonthStartDay: number;
  balances: {
    all: number;
    me: number;
    partner: number;
  };
};

export type DecisionCoreContext = {
  locale: Locale;
  today: string;
  forecastHorizonMonths: 1 | 3 | 6;
  categories: CategoryDefinition[];
  transactions: Transaction[];
  confirmedTransactions: Transaction[];
  recurringTransactions: RecurringTransaction[];
  debts: DebtItem[];
  moneySetup: MoneySetup;
  categoryBudgets: CategoryBudget[];
  budgetMonthStartDay: number;
  availableNow: number;
  resolvedIncomeSources: ResolvedMoneySetupIncomeSource[];
  safeSpending: SafeSpendingResult;
  essentialBudgetReserve: EssentialBudgetReserve;
  forecast: BalanceForecast;
};

export type PrimaryDecision =
  | {
      type: "overdue_payment";
      paymentId: string;
      amount: number;
      dueDate: string;
      title: string;
    }
  | {
      type: "payment_today";
      paymentId: string;
      amount: number;
      dueDate: string;
      title: string;
    }
  | {
      type: "overdue_income_confirmation";
      incomeSourceId: string;
      amount: number;
      dueDate: string;
      title: string;
    }
  | {
      type: "income_due_today";
      incomeSourceId: string;
      amount: number;
      dueDate: string;
      title: string;
    }
  | {
      type: "current_deficit";
      amount: number;
    }
  | {
      type: "future_deficit";
      amount: number;
      riskDate: string;
      title?: string | null;
    }
  | {
      type: "reserve_required";
      amount: number;
      dueDate: string;
      title?: string | null;
    }
  | {
      type: "missing_data";
      missing: Array<"income" | "required_expenses" | "essential_budgets" | "balance">;
    }
  | {
      type: "no_urgent_action";
    };

export type ForecastEventSource =
  | "income_source"
  | "confirmed_transaction"
  | "pending_transaction"
  | "recurring"
  | "debt_payment";

export type ForecastEvent = {
  id: string;
  title: string;
  amount: number;
  date: string;
  balanceAfter: number;
  source: ForecastEventSource;
  incomeSourceId?: string | null;
  incomeOccurrenceId?: string | null;
  incomeOccurrenceDate?: string | null;
  plannedIncomeStatus?: Exclude<MoneySetupIncomeSourceStatus, "received"> | null;
  plannedDate?: string | null;
};

export type ForecastDay = {
  date: string;
  events: ForecastEvent[];
  incomeTotal: number;
  expenseTotal: number;
  netChange: number;
  startBalance: number;
  endBalance: number;
};

export type BalanceForecast = {
  startBalance: number;
  minBalance: number;
  minBalanceDate: string | null;
  firstDeficitDate: string | null;
  nextIncomeDate: string | null;
  horizonEndDate: string;
  horizonMonths?: 1 | 3 | 6;
  events: ForecastEvent[];
  days?: ForecastDay[];
};

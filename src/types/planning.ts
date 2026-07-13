import type { BudgetOwner, TxType } from "@/types";

export type SavingsGoalKind = "custom" | "emergency";

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  deadline: string | null;
  /** Плановый взнос в месяц (₽), необязательно */
  monthlyContribution: number | null;
  kind: SavingsGoalKind;
  /** 3 или 6 — только для kind=emergency */
  emergencyMonths: number | null;
  updatedAt?: string;
}

export interface CategoryBudget {
  categoryId: string;
  monthlyLimit: number;
  updatedAt?: string;
}

export type RecurringFrequency = "weekly" | "monthly" | "yearly";

export interface RecurringTransaction {
  id: string;
  amount: number;
  type: TxType;
  categoryId: string;
  /** Название подписки / операции (не заметка) */
  note: string;
  /** Даты периодов, когда нажали «Не было» (ISO YYYY-MM-DD) */
  skippedDates?: string[];
  owner: BudgetOwner;
  frequency: RecurringFrequency;
  /** Для monthly: раз в N месяцев. Старые записи без поля считаются ежемесячными. */
  intervalMonths?: number | null;
  dayOfMonth: number | null;
  nextRunDate: string;
  endDate?: string | null;
  enabled: boolean;
  updatedAt?: string;
}

export type DebtPriority = "normal" | "high";
export type DebtStrategy = "avalanche" | "snowball";

export interface DebtItem {
  id: string;
  name: string;
  owner: BudgetOwner | "all";
  balance: number;
  minPayment: number;
  ratePct: number | null;
  nextPaymentDate: string | null;
  strategy: DebtStrategy;
  priority: DebtPriority;
  updatedAt?: string;
}

export const EMERGENCY_GOAL_ID = "__emergency_fund__";

export type PlanningInputAction =
  | { kind: "goal_deposit"; goalId: string; amount: number }
  | {
      kind: "goal_create";
      name: string;
      targetAmount: number;
      deadline?: string | null;
    }
  | { kind: "goal_deposit_by_name"; goalName: string; amount: number }
  | {
      kind: "income_with_goal";
      incomeAmount: number;
      goalAmount: number;
      goalName: string;
      goalId?: string;
      sourceText: string;
    };

import type {
  CategoryBudget as DbCategoryBudget,
  RecurringTransaction as DbRecurring,
  SavingsGoal as DbSavingsGoal,
} from "@prisma/client";
import { migrateCategoryId } from "@/lib/categories";
import type {
  CategoryBudget,
  RecurringTransaction,
  SavingsGoal,
} from "@/types/planning";

export function dbGoalToApp(row: DbSavingsGoal): SavingsGoal {
  return {
    id: row.id,
    name: row.name,
    targetAmount: row.targetAmount,
    savedAmount: row.savedAmount,
    deadline: row.deadline,
    monthlyContribution: row.monthlyContribution ?? null,
    kind: row.kind,
    emergencyMonths: row.emergencyMonths,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function appGoalToDb(
  householdId: string,
  goal: SavingsGoal,
): Omit<DbSavingsGoal, "createdAt" | "updatedAt"> & { householdId: string } {
  return {
    id: goal.id,
    householdId,
    name: goal.name,
    targetAmount: goal.targetAmount,
    savedAmount: goal.savedAmount,
    deadline: goal.deadline,
    monthlyContribution: goal.monthlyContribution,
    kind: goal.kind,
    emergencyMonths: goal.emergencyMonths,
  };
}

export function dbCategoryBudgetToApp(row: DbCategoryBudget): CategoryBudget {
  return {
    categoryId: migrateCategoryId(row.categoryId),
    monthlyLimit: row.monthlyLimit,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function appCategoryBudgetToDb(
  householdId: string,
  budget: CategoryBudget,
): Omit<DbCategoryBudget, "id" | "createdAt" | "updatedAt"> & {
  householdId: string;
  categoryId: string;
} {
  return {
    householdId,
    categoryId: migrateCategoryId(budget.categoryId),
    monthlyLimit: budget.monthlyLimit,
  };
}

export function dbRecurringToApp(row: DbRecurring): RecurringTransaction {
  return {
    id: row.id,
    amount: row.amount,
    type: row.type,
    categoryId: migrateCategoryId(row.categoryId),
    note: row.note,
    owner: row.owner === "partner" ? "partner" : "me",
    frequency: row.frequency,
    intervalMonths:
      row.frequency === "monthly"
        ? Math.max(1, Math.min(60, Math.round(Number(row.intervalMonths) || 1)))
        : null,
    dayOfMonth: row.dayOfMonth,
    nextRunDate: row.nextRunDate,
    enabled: row.enabled,
    skippedDates: row.skippedDates ?? [],
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function appRecurringToDb(
  householdId: string,
  item: RecurringTransaction,
): Omit<DbRecurring, "createdAt" | "updatedAt"> {
  return {
    id: item.id,
    householdId,
    amount: item.amount,
    type: item.type,
    categoryId: migrateCategoryId(item.categoryId),
    note: item.note,
    owner: item.owner ?? "me",
    frequency: item.frequency,
    intervalMonths:
      item.frequency === "monthly"
        ? Math.max(1, Math.min(60, Math.round(Number(item.intervalMonths) || 1)))
        : null,
    dayOfMonth: item.dayOfMonth,
    nextRunDate: item.nextRunDate,
    enabled: item.enabled,
    skippedDates: item.skippedDates ?? [],
  };
}

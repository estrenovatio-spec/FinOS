import type { Category, Transaction as DbTransaction } from "@prisma/client";
import { migrateCategoryId } from "@/lib/categories";
import { normalizeAppCurrency } from "@/lib/app-currency";
import type { CategoryDefinition, Transaction } from "@/types";

type DbTransactionWithFuelLiters = DbTransaction & {
  fuelLiters?: number | null;
};

export function dbCategoryToApp(row: Category): CategoryDefinition {
  const id = migrateCategoryId(row.id);
  return {
    id,
    type: row.type,
    labels: { ru: row.labelRu, en: row.labelEn },
    keywords: row.keywords ?? [],
    isSystem: row.isSystem,
  };
}

export function dbTransactionToApp(row: DbTransactionWithFuelLiters): Transaction {
  return {
    id: row.id,
    amount: row.amount,
    type: row.type,
    categoryId: migrateCategoryId(row.categoryId),
    currency: normalizeAppCurrency(row.currency),
    note: row.note,
    date: row.date,
    owner: (row.owner === "partner" ? "partner" : "me") as Transaction["owner"],
    createdBy: row.createdBy ?? null,
    goalId: row.goalId ?? null,
    goalAmount: row.goalAmount ?? null,
    confirmed: row.confirmed,
    recurringId: row.recurringId ?? null,
    odometerKm: row.odometerKm ?? null,
    fuelLiters: row.fuelLiters ?? null,
    vehicleId: row.vehicleId ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function appCategoryToDb(
  householdId: string,
  cat: CategoryDefinition,
): Omit<Category, "householdId"> & { householdId: string } {
  return {
    householdId,
    id: cat.id,
    type: cat.type,
    labelRu: cat.labels.ru,
    labelEn: cat.labels.en,
    keywords: cat.keywords,
    isSystem: cat.isSystem,
  };
}

export function appTransactionToDb(
  householdId: string,
  tx: Transaction,
  createdBy?: string,
): Omit<DbTransaction, "createdAt" | "updatedAt"> & { fuelLiters?: number | null } {
  return {
    id: tx.id,
    householdId,
    amount: tx.amount,
    type: tx.type,
    categoryId: migrateCategoryId(tx.categoryId),
    currency: normalizeAppCurrency(tx.currency),
    note: tx.note,
    date: tx.date,
    owner: tx.owner ?? "me",
    createdBy: createdBy ?? null,
    goalId: tx.goalId ?? null,
    goalAmount: tx.goalAmount ?? null,
    confirmed: tx.confirmed !== false,
    recurringId: tx.recurringId ?? null,
    odometerKm:
      tx.odometerKm != null && Number.isFinite(tx.odometerKm)
        ? Math.max(0, Math.round(tx.odometerKm))
        : null,
    fuelLiters:
      tx.fuelLiters != null && Number.isFinite(tx.fuelLiters)
        ? Math.max(0, Math.round(tx.fuelLiters * 100) / 100)
        : null,
    vehicleId: tx.vehicleId?.trim() || null,
  };
}

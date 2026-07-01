import { randomUUID } from "node:crypto";
import { parseBalanceOffsets } from "@/lib/balance-offsets";
import { prisma } from "@/lib/db";
import { isMissingDbObject } from "@/lib/household/db-capabilities";
import { defaultVehicleGaragePrefs } from "@/lib/vehicle";
import type { CategoryDefinition, Transaction } from "@/types";
import type { CategoryBudget, DebtItem, RecurringTransaction, SavingsGoal } from "@/types/planning";
import type { Vehicle, VehicleGaragePrefs } from "@/types/vehicle";
import {
  appCategoryBudgetToDb,
  appGoalToDb,
  appRecurringToDb,
} from "@/lib/household/planning-mapper";
import { saveVehicleGarage, VehicleGarageDbNotConfiguredError } from "@/lib/household/vehicle-garage-db";
import { appCategoryToDb } from "@/lib/household/sync-mapper";
import { createTransactionForHousehold } from "@/lib/household/safe-transactions";
import type { SyncPayload } from "@/lib/household/types";
import {
  buildSyncPayload,
} from "@/lib/household/service";

let householdBackupTablesReady: { value: boolean; checkedAt: number } | null = null;
const HOUSEHOLD_BACKUP_TABLE_CACHE_MS = 60_000;

export type HouseholdBackupPayload = Omit<SyncPayload, "viewerUserId"> & {
  version: 1;
  createdAt: string;
  debts: DebtItem[];
};

export type HouseholdBackupSummary = {
  id: string;
  createdAt: string;
  reason: string;
  transactions: number;
  categories: number;
  goals: number;
  recurring: number;
  debts: number;
  budgets: number;
  vehicles: number;
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeBackupPayload(raw: unknown): HouseholdBackupPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Partial<HouseholdBackupPayload>;
  if (!o.household || typeof o.household !== "object") return null;

  return {
    version: 1,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString(),
    household: o.household,
    memberUserIds: asArray<string>(o.memberUserIds),
    transactions: asArray<Transaction>(o.transactions),
    categories: asArray<CategoryDefinition>(o.categories),
    savingsGoals: asArray<SavingsGoal>(o.savingsGoals),
    categoryBudgets: asArray<CategoryBudget>(o.categoryBudgets),
    recurringTransactions: asArray<RecurringTransaction>(o.recurringTransactions),
    debts: asArray<DebtItem>(o.debts),
    balanceOffsets: parseBalanceOffsets(o.balanceOffsets),
    vehicles: asArray<Vehicle>(o.vehicles),
    vehiclePrefs: (o.vehiclePrefs ?? defaultVehicleGaragePrefs()) as VehicleGaragePrefs,
    vehicleGarageAvailable: Boolean(o.vehicleGarageAvailable),
    vehicle: o.vehicle ?? null,
  };
}

function toBackupPayload(sync: SyncPayload): HouseholdBackupPayload {
  return normalizeBackupPayload({
    ...sync,
    version: 1,
    createdAt: new Date().toISOString(),
  }) as HouseholdBackupPayload;
}

function hasMeaningfulHouseholdPayload(payload: HouseholdBackupPayload): boolean {
  return (
    payload.transactions.length > 0 ||
    payload.categories.length > 0 ||
    payload.savingsGoals.length > 0 ||
    payload.categoryBudgets.length > 0 ||
    payload.recurringTransactions.length > 0 ||
    payload.debts.length > 0 ||
    Object.keys(payload.balanceOffsets ?? {}).length > 0 ||
    (payload.vehicles?.length ?? 0) > 0
  );
}

export async function ensureHouseholdBackupTables(): Promise<boolean> {
  if (
    householdBackupTablesReady &&
    Date.now() - householdBackupTablesReady.checkedAt < HOUSEHOLD_BACKUP_TABLE_CACHE_MS
  ) {
    return householdBackupTablesReady.value;
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "HouseholdBackup" (
        "id" TEXT PRIMARY KEY,
        "householdId" TEXT NOT NULL,
        "userId" TEXT,
        "payload" JSONB NOT NULL,
        "reason" TEXT NOT NULL DEFAULT 'manual',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "HouseholdBackup_householdId_fkey"
          FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE,
        CONSTRAINT "HouseholdBackup_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "HouseholdBackup_householdId_createdAt_idx"
      ON "HouseholdBackup" ("householdId", "createdAt" DESC)
    `);
    householdBackupTablesReady = { value: true, checkedAt: Date.now() };
    return true;
  } catch (e) {
    console.error("[household/backup tables]", e);
    householdBackupTablesReady = { value: false, checkedAt: Date.now() };
    return false;
  }
}

export async function backupHouseholdSnapshot(
  householdId: string,
  userId: string | null,
  reason = "manual",
  snapshot?: SyncPayload | null,
): Promise<boolean> {
  if (!(await ensureHouseholdBackupTables())) return false;
  const sync = snapshot ?? (await buildSyncPayload(householdId, userId ?? undefined));
  const payload = toBackupPayload(sync);
  if (!hasMeaningfulHouseholdPayload(payload)) return false;

  try {
    await prisma.$executeRaw`
      INSERT INTO "HouseholdBackup" ("id", "householdId", "userId", "payload", "reason")
      VALUES (${randomUUID()}, ${householdId}, ${userId}, CAST(${JSON.stringify(payload)} AS jsonb), ${reason})
    `;
    await prisma.$executeRaw`
      DELETE FROM "HouseholdBackup"
      WHERE "householdId" = ${householdId}
        AND "id" NOT IN (
          SELECT "id" FROM "HouseholdBackup"
          WHERE "householdId" = ${householdId}
          ORDER BY "createdAt" DESC
          LIMIT 90
        )
    `;
    return true;
  } catch (e) {
    console.error("[household/backup]", e);
    return false;
  }
}

function summaryFromRow(row: {
  id: string;
  createdAt: Date;
  reason: string;
  payload: unknown;
}): HouseholdBackupSummary {
  const payload = normalizeBackupPayload(row.payload);
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    reason: row.reason,
    transactions: payload?.transactions.length ?? 0,
    categories: payload?.categories.length ?? 0,
    goals: payload?.savingsGoals.length ?? 0,
    recurring: payload?.recurringTransactions.length ?? 0,
    debts: payload?.debts.length ?? 0,
    budgets: payload?.categoryBudgets.length ?? 0,
    vehicles: payload?.vehicles?.length ?? 0,
  };
}

export async function listHouseholdBackups(
  householdId: string,
  limit = 30,
): Promise<HouseholdBackupSummary[]> {
  if (!(await ensureHouseholdBackupTables())) return [];
  const rows = await prisma.$queryRaw<
    { id: string; createdAt: Date; reason: string; payload: unknown }[]
  >`
    SELECT "id", "createdAt", "reason", "payload"
    FROM "HouseholdBackup"
    WHERE "householdId" = ${householdId}
    ORDER BY "createdAt" DESC
    LIMIT ${Math.max(1, Math.min(50, limit))}
  `;
  return rows.map(summaryFromRow);
}

async function restoreHouseholdFromPayload(
  householdId: string,
  userId: string,
  payload: HouseholdBackupPayload,
): Promise<void> {
  try {
    await prisma.household.update({
      where: { id: householdId },
      data: {
        name: payload.household.name,
        partnerLabel: payload.household.partnerLabel,
        mode: payload.household.mode === "shared" ? "SHARED" : "SOLO",
        balanceOffsets: payload.balanceOffsets ?? {},
      },
    });
  } catch (e) {
    if (!isMissingDbObject(e)) throw e;
    await prisma.household.update({
      where: { id: householdId },
      data: {
        name: payload.household.name,
        partnerLabel: payload.household.partnerLabel,
        mode: payload.household.mode === "shared" ? "SHARED" : "SOLO",
      },
    });
  }

  const memberUserIds = [...new Set(payload.memberUserIds ?? [])].filter(
    (id): id is string => typeof id === "string" && id.trim().length > 0,
  );
  const existingUsers = memberUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: memberUserIds } },
        select: { id: true },
      })
    : [];
  const existingUserIds = new Set(existingUsers.map((u) => u.id));
  const safeMemberIds = memberUserIds.filter((id) => existingUserIds.has(id));
  if (safeMemberIds.length > 0) {
    await prisma.householdMember.createMany({
      data: safeMemberIds.map((memberUserId) => ({
        householdId,
        userId: memberUserId,
        role: memberUserId === userId ? ("OWNER" as const) : ("MEMBER" as const),
      })),
      skipDuplicates: true,
    });
  }

  await prisma.transaction.deleteMany({ where: { householdId } });
  await prisma.categoryBudget.deleteMany({ where: { householdId } }).catch(() => null);
  await prisma.recurringTransaction.deleteMany({ where: { householdId } }).catch(() => null);
  await prisma.$executeRaw`
    DELETE FROM "HouseholdDebt" WHERE "householdId" = ${householdId}
  `.catch(() => null);
  await prisma.savingsGoal.deleteMany({ where: { householdId } }).catch(() => null);
  await prisma.category.deleteMany({ where: { householdId } });

  for (const category of payload.categories) {
    await prisma.category.upsert({
      where: { householdId_id: { householdId, id: category.id } },
      create: appCategoryToDb(householdId, category),
      update: {
        type: category.type,
        labelRu: category.labels.ru,
        labelEn: category.labels.en,
        keywords: category.keywords,
        isSystem: category.isSystem,
      },
    });
  }

  for (const goal of payload.savingsGoals) {
    await prisma.savingsGoal.upsert({
      where: { householdId_id: { householdId, id: goal.id } },
      create: appGoalToDb(householdId, goal),
      update: {
        name: goal.name,
        targetAmount: goal.targetAmount,
        savedAmount: goal.savedAmount,
        deadline: goal.deadline,
        monthlyContribution: goal.monthlyContribution,
        kind: goal.kind,
        emergencyMonths: goal.emergencyMonths,
      },
    });
  }

  for (const budget of payload.categoryBudgets) {
    const data = appCategoryBudgetToDb(householdId, budget);
    await prisma.categoryBudget.upsert({
      where: { householdId_categoryId: { householdId, categoryId: data.categoryId } },
      create: { ...data, id: `${householdId}-${data.categoryId}` },
      update: { monthlyLimit: data.monthlyLimit },
    }).catch(() => null);
  }

  for (const item of payload.recurringTransactions) {
    await prisma.recurringTransaction.upsert({
      where: { id: item.id },
      create: appRecurringToDb(householdId, item),
      update: {
        amount: item.amount,
        type: item.type,
        categoryId: item.categoryId,
        note: item.note,
        owner: item.owner ?? "me",
        frequency: item.frequency,
        intervalMonths: item.frequency === "monthly" ? item.intervalMonths ?? 1 : null,
        dayOfMonth: item.dayOfMonth,
        nextRunDate: item.nextRunDate,
        enabled: item.enabled,
        skippedDates: item.skippedDates ?? [],
      },
    }).catch(() => null);
  }

  const { upsertDebtForHousehold } = await import("@/lib/household/debts-db");
  for (const debt of payload.debts) {
    await upsertDebtForHousehold(householdId, debt);
  }

  for (const tx of payload.transactions) {
    const createdBy =
      tx.createdBy && memberUserIds.includes(tx.createdBy) ? tx.createdBy : userId;
    try {
      await createTransactionForHousehold(householdId, tx, createdBy ?? undefined);
    } catch (e) {
      console.warn("[household/restore transaction skipped]", tx.id, e);
    }
  }

  if (payload.vehicleGarageAvailable) {
    await saveVehicleGarage(
      householdId,
      payload.vehicles ?? [],
      payload.vehiclePrefs ?? defaultVehicleGaragePrefs(),
    ).catch((e) => {
      if (!(e instanceof VehicleGarageDbNotConfiguredError)) throw e;
    });
  }
}

export async function restoreHouseholdBackup(
  householdId: string,
  userId: string,
  backupId: string,
): Promise<SyncPayload | null> {
  if (!(await ensureHouseholdBackupTables())) return null;
  const rows = await prisma.$queryRaw<{ payload: unknown }[]>`
    SELECT "payload"
    FROM "HouseholdBackup"
    WHERE "householdId" = ${householdId} AND "id" = ${backupId}
    LIMIT 1
  `;
  const payload = normalizeBackupPayload(rows[0]?.payload);
  if (!payload) return null;

  await backupHouseholdSnapshot(householdId, userId, "before_restore");
  await restoreHouseholdFromPayload(householdId, userId, payload);
  return buildSyncPayload(householdId, userId);
}

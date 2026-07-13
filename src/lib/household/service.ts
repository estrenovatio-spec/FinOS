import type { HouseholdMode, Prisma } from "@prisma/client";
import { normalizeAppCurrency } from "@/lib/app-currency";
import { getDefaultCategories, getFallbackCategoryId } from "@/lib/categories";
import { prisma } from "@/lib/db";
import {
  emptyMoneySetup,
  normalizeMoneySetup,
  pruneMoneySetupIds,
  type MoneySetup,
} from "@/lib/money-setup";
import { assertActiveSubscription, assertHouseholdSubscription } from "@/lib/payments/subscription";
import { applyGoalMonthlyToGoal } from "@/lib/planning/analytics";
import type { CategoryBudget, DebtItem, RecurringTransaction, SavingsGoal } from "@/types/planning";
import {
  appCategoryBudgetToDb,
  appGoalToDb,
  appRecurringToDb,
  dbCategoryBudgetToApp,
  dbGoalToApp,
  dbRecurringToApp,
} from "./planning-mapper";
import {
  fetchVehicleGarageForHousehold,
  saveVehicleGarage,
  VehicleGarageDbNotConfiguredError,
} from "./vehicle-garage-db";
export { VehicleGarageDbNotConfiguredError };
import {
  deleteDebtForHousehold,
  ensureHouseholdDebtTable,
  fetchDebtsForHousehold,
  upsertDebtForHousehold,
} from "./debts-db";
import { isMissingDbObject } from "./db-capabilities";
import {
  createTransactionForHousehold,
  deleteTransactionForHousehold,
  fetchTransactionsForHousehold,
  findTransactionInHousehold,
  stripUnsupportedTransactionFields,
  updateTransactionForHousehold,
} from "./safe-transactions";
import { getHouseholdDbCapabilities } from "./db-capabilities";
import {
  appCategoryToDb,
  appTransactionToDb,
  dbCategoryToApp,
  dbTransactionToApp,
} from "./sync-mapper";
import {
  parseBalanceOffsets,
  type BalanceOffsetsByUser,
} from "@/lib/balance-offsets";
import type { CategoryDefinition, Transaction } from "@/types";
import type { TelegramWebAppUser } from "@/lib/telegram/init-data";
import { generateInviteCode } from "./invite-code";
import type { HouseholdPublic, SyncPayload } from "@/lib/household/types";

export type { HouseholdPublic, SyncPayload };

function isMissingDbColumn(err: unknown): boolean {
  return isMissingDbObject(err);
}

async function fetchSavingsGoalsSafe(householdId: string): Promise<SavingsGoal[]> {
  try {
    const rows = await prisma.savingsGoal.findMany({ where: { householdId } });
    return rows.map(dbGoalToApp);
  } catch (err) {
    if (!isMissingDbColumn(err)) throw err;
    console.warn("[household] SavingsGoal schema outdated — run prisma/migrate-planning-and-balance.sql");
    const rows = await prisma.$queryRaw<
      {
        id: string;
        householdId: string;
        name: string;
        targetAmount: number;
        savedAmount: number;
        deadline: string | null;
        kind: string | null;
        emergencyMonths: number | null;
      }[]
    >`
      SELECT id, "householdId", name, "targetAmount", "savedAmount", deadline, kind, "emergencyMonths"
      FROM "SavingsGoal"
      WHERE "householdId" = ${householdId}
    `;
    return rows.map(
      (row): SavingsGoal => ({
        id: row.id,
        name: row.name,
        targetAmount: row.targetAmount,
        savedAmount: row.savedAmount,
        deadline: row.deadline,
        monthlyContribution: null,
        kind: row.kind === "emergency" ? "emergency" : "custom",
        emergencyMonths: row.emergencyMonths,
      }),
    );
  }
}

async function fetchPlanningForHousehold(householdId: string) {
  try {
    const [savingsGoals, categoryBudgets, recurringTransactions] = await Promise.all([
      fetchSavingsGoalsSafe(householdId),
      prisma.categoryBudget
        .findMany({ where: { householdId } })
        .then((rows) => rows.map(dbCategoryBudgetToApp))
        .catch((err) => {
          if (isMissingDbColumn(err)) return [];
          throw err;
        }),
      prisma.recurringTransaction
        .findMany({ where: { householdId } })
        .then((rows) => rows.map(dbRecurringToApp))
        .catch((err) => {
          if (isMissingDbColumn(err)) return [];
          throw err;
        }),
    ]);
    return { savingsGoals, categoryBudgets, recurringTransactions };
  } catch (err) {
    console.warn("[household] planning tables unavailable — run prisma/planning-tables.sql", err);
    return {
      savingsGoals: [],
      categoryBudgets: [],
      recurringTransactions: [],
    };
  }
}

export async function getHouseholdSavingsGoals(householdId: string): Promise<SavingsGoal[]> {
  const { savingsGoals } = await fetchPlanningForHousehold(householdId);
  return savingsGoals;
}

async function readHouseholdBalanceOffsets(householdId: string): Promise<BalanceOffsetsByUser> {
  try {
    const row = await prisma.household.findUnique({
      where: { id: householdId },
      select: { balanceOffsets: true },
    });
    return parseBalanceOffsets(row?.balanceOffsets);
  } catch (err) {
    if (!isMissingDbColumn(err)) throw err;
    try {
      const rows = await prisma.$queryRaw<{ balanceOffsets: unknown }[]>`
        SELECT "balanceOffsets" FROM "Household" WHERE id = ${householdId} LIMIT 1
      `;
      return parseBalanceOffsets(rows[0]?.balanceOffsets);
    } catch {
      return {};
    }
  }
}

async function readHouseholdMoneySetup(householdId: string): Promise<MoneySetup> {
  try {
    const row = await prisma.household.findUnique({
      where: { id: householdId },
      select: { moneySetup: true },
    });
    return normalizeMoneySetup(row?.moneySetup);
  } catch (err) {
    if (!isMissingDbColumn(err)) throw err;
    try {
      const rows = await prisma.$queryRaw<{ moneySetup: unknown }[]>`
        SELECT "moneySetup" FROM "Household" WHERE id = ${householdId} LIMIT 1
      `;
      return normalizeMoneySetup(rows[0]?.moneySetup);
    } catch {
      return emptyMoneySetup();
    }
  }
}

async function writeHouseholdMoneySetup(householdId: string, setup: MoneySetup): Promise<void> {
  try {
    await prisma.household.update({
      where: { id: householdId },
      data: { moneySetup: setup as unknown as Prisma.InputJsonValue },
    });
  } catch (err) {
    if (!isMissingDbColumn(err)) throw err;
    await prisma.$executeRaw`
      UPDATE "Household"
      SET "moneySetup" = ${JSON.stringify(setup)}::jsonb
      WHERE id = ${householdId}
    `;
  }
}

function withMoneySetupUpdatedAt(
  setup: MoneySetup,
  updatedAt: string | null = new Date().toISOString(),
): MoneySetup {
  return {
    ...setup,
    updatedAt,
  };
}

export async function patchHouseholdBalanceOffset(
  userId: string,
  householdId: string,
  targetUserId: string,
  offset: number,
): Promise<BalanceOffsetsByUser> {
  await assertMember(userId, householdId);
  const members = await prisma.householdMember.findMany({
    where: { householdId },
    select: { userId: true },
  });
  if (!members.some((m) => m.userId === targetUserId)) {
    throw new Error("forbidden");
  }

  const current = await readHouseholdBalanceOffsets(householdId);
  const next = { ...current, [targetUserId]: offset };

  try {
    await prisma.household.update({
      where: { id: householdId },
      data: { balanceOffsets: next },
    });
  } catch (err) {
    if (!isMissingDbColumn(err)) throw err;
    await prisma.$executeRaw`
      UPDATE "Household"
      SET "balanceOffsets" = ${JSON.stringify(next)}::jsonb
      WHERE id = ${householdId}
    `;
  }

  return next;
}

export async function saveVehicleGarageForHousehold(
  userId: string,
  householdId: string,
  vehicles: Parameters<typeof saveVehicleGarage>[1],
  vehiclePrefs: Parameters<typeof saveVehicleGarage>[2],
) {
  await assertMember(userId, householdId);
  return saveVehicleGarage(householdId, vehicles, vehiclePrefs);
}

export async function patchHouseholdMoneySetup(
  userId: string,
  householdId: string,
  setup: MoneySetup,
): Promise<MoneySetup> {
  await assertMember(userId, householdId);
  const [planning, categories] = await Promise.all([
    fetchPlanningForHousehold(householdId),
    prisma.category.findMany({ where: { householdId } }).then((rows) => rows.map(dbCategoryToApp)),
  ]);
  const pruned = pruneMoneySetupIds(
    normalizeMoneySetup(setup),
    planning.recurringTransactions,
    categories,
  );
  const next = withMoneySetupUpdatedAt(pruned);
  await writeHouseholdMoneySetup(householdId, next);
  return next;
}

async function uniqueInviteCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = generateInviteCode(6);
    const exists = await prisma.household.findUnique({ where: { inviteCode: code } });
    if (!exists) return code;
  }
  throw new Error("invite_code_collision");
}

export async function upsertTelegramUser(user: TelegramWebAppUser) {
  return prisma.user.upsert({
    where: { telegramId: BigInt(user.id) },
    create: {
      telegramId: BigInt(user.id),
      firstName: user.first_name ?? null,
      username: user.username ?? null,
    },
    update: {
      firstName: user.first_name ?? null,
      username: user.username ?? null,
    },
    select: {
      id: true,
      telegramId: true,
      email: true,
      firstName: true,
      username: true,
      googleSheetsOpenLogged: true,
    },
  });
}

export async function getUserMembership(userId: string) {
  return prisma.householdMember.findFirst({
    where: { userId },
    include: {
      household: {
        include: { members: true },
      },
    },
  });
}

/** Same Telegram account on phone + browser — one membership, many devices */
export async function getHouseholdSessionForUser(
  userId: string,
): Promise<{ household: HouseholdPublic; sync: SyncPayload } | null> {
  const membership = await getUserMembership(userId);
  if (!membership) return null;
  const sync = await buildSyncPayload(membership.householdId);
  return {
    household: toPublicHousehold(
      membership.household,
      membership.household.members.length,
    ),
    sync,
  };
}

/** User leaves cloud household — disabled by default (see cloud-guard). */
export async function leaveHousehold(userId: string): Promise<void> {
  const { assertHouseholdLeaveAllowed } = await import("@/lib/household/cloud-guard");
  assertHouseholdLeaveAllowed();
  await prisma.householdMember.deleteMany({ where: { userId } });
}

async function seedCategories(householdId: string) {
  const defaults = getDefaultCategories();
  await prisma.category.createMany({
    data: defaults.map((c) => appCategoryToDb(householdId, c)),
    skipDuplicates: true,
  });
}

/** Новые системные категории и миграция food → groceries в облаке */
async function refreshHouseholdCategories(householdId: string) {
  const defaults = getDefaultCategories();
  for (const cat of defaults) {
    await prisma.category.upsert({
      where: { householdId_id: { householdId, id: cat.id } },
      create: appCategoryToDb(householdId, cat),
      update: {
        labelRu: cat.labels.ru,
        labelEn: cat.labels.en,
        keywords: cat.keywords,
        isSystem: cat.isSystem,
      },
    });
  }
  await prisma.transaction.updateMany({
    where: { householdId, categoryId: { in: ["food", "еда"] } },
    data: { categoryId: "groceries" },
  });
  await prisma.category.deleteMany({
    where: { householdId, id: { in: ["food", "еда"] } },
  });
  await prisma.category.deleteMany({
    where: { householdId, labelRu: "Еда", isSystem: true },
  });
  await prisma.transaction.updateMany({
    where: { householdId, categoryId: "vacation" },
    data: { categoryId: "leisure" },
  });
  await prisma.category.deleteMany({
    where: { householdId, id: "vacation" },
  });
}

export async function createHousehold(
  userId: string,
  opts: { name?: string; mode?: "solo" | "shared"; partnerLabel?: string | null },
): Promise<{ household: HouseholdPublic; sync: SyncPayload; isNew: boolean }> {
  await assertActiveSubscription(userId);

  const existingSession = await getHouseholdSessionForUser(userId);
  if (existingSession) return { ...existingSession, isNew: false };

  const inviteCode = await uniqueInviteCode();
  const mode: HouseholdMode = opts.mode === "shared" ? "SHARED" : "SOLO";
  const partnerLabel = opts.partnerLabel?.trim() || null;

  const household = await prisma.household.create({
    data: {
      name: opts.name?.trim() || "Семейный бюджет",
      inviteCode,
      mode,
      partnerLabel,
      members: {
        create: { userId, role: "OWNER" },
      },
    },
    include: { members: true },
  });

  await seedCategories(household.id);
  const sync = await buildSyncPayload(household.id);
  return {
    household: toPublicHousehold(household, household.members.length),
    sync,
    isNew: true,
  };
}

export async function joinHousehold(
  userId: string,
  rawCode: string,
): Promise<{ household: HouseholdPublic; sync: SyncPayload; isNew: boolean }> {
  const inviteCode = rawCode.trim().toUpperCase().replace(/^VB-?/i, "");
  if (inviteCode.length < 4) throw new Error("invalid_code");

  const existingSession = await getHouseholdSessionForUser(userId);
  if (existingSession) {
    if (existingSession.household.inviteCode === inviteCode) {
      return { ...existingSession, isNew: false };
    }
    throw new Error("already_in_household");
  }

  const household = await prisma.household.findUnique({
    where: { inviteCode },
    include: { members: true },
  });
  if (!household) throw new Error("household_not_found");

  await assertHouseholdSubscription(household.id);

  await prisma.householdMember.create({
    data: { householdId: household.id, userId, role: "MEMBER" },
  });

  const memberCount = household.members.length + 1;
  if (memberCount >= 2 && household.mode === "SOLO") {
    await prisma.household.update({
      where: { id: household.id },
      data: { mode: "SHARED" },
    });
  }

  const sync = await buildSyncPayload(household.id);
  return {
    household: {
      ...toPublicHousehold(household, memberCount),
      mode: memberCount >= 2 ? "shared" : "solo",
    },
    sync,
    isNew: true,
  };
}

function toPublicHousehold(
  h: { id: string; name: string; mode: HouseholdMode; inviteCode: string; partnerLabel: string | null },
  memberCount: number,
): HouseholdPublic {
  return {
    id: h.id,
    name: h.name,
    mode: h.mode === "SHARED" ? "shared" : "solo",
    inviteCode: h.inviteCode,
    partnerLabel: h.partnerLabel,
    memberCount,
  };
}

export async function buildSyncPayload(
  householdId: string,
  viewerUserId?: string,
): Promise<SyncPayload> {
  await refreshHouseholdCategories(householdId);

  let household:
    | {
        id: string;
        name: string;
        mode: HouseholdMode;
        inviteCode: string;
        partnerLabel: string | null;
        members: { userId: string }[];
      }
    | null = null;

  try {
    household = await prisma.household.findUniqueOrThrow({
      where: { id: householdId },
      include: { members: { select: { userId: true } } },
    });
  } catch (err) {
    if (!isMissingDbColumn(err)) throw err;
    const rows = await prisma.$queryRaw<
      {
        id: string;
        name: string;
        mode: HouseholdMode;
        inviteCode: string;
        partnerLabel: string | null;
      }[]
    >`
      SELECT id, name, mode, "inviteCode", "partnerLabel"
      FROM "Household"
      WHERE id = ${householdId}
      LIMIT 1
    `;
    if (!rows[0]) throw err;
    const members = await prisma.householdMember.findMany({
      where: { householdId },
      select: { userId: true },
    });
    household = { ...rows[0], members };
  }

  const [transactions, categories, planning, debts, garage] = await Promise.all([
    fetchTransactionsForHousehold(householdId),
    prisma.category.findMany({ where: { householdId } }),
    fetchPlanningForHousehold(householdId),
    fetchDebtsForHousehold(householdId),
    fetchVehicleGarageForHousehold(householdId),
  ]);

  const balanceOffsets = await readHouseholdBalanceOffsets(householdId);
  const normalizedCategories = categories.map(dbCategoryToApp);
  const rawMoneySetup = await readHouseholdMoneySetup(householdId);
  const moneySetup = pruneMoneySetupIds(
    normalizeMoneySetup(rawMoneySetup),
    planning.recurringTransactions,
    normalizedCategories,
  );
  if (JSON.stringify(moneySetup) !== JSON.stringify(rawMoneySetup)) {
    await writeHouseholdMoneySetup(householdId, moneySetup);
  }

  return {
    household: toPublicHousehold(household, household.members.length),
    memberUserIds: household.members.map((m) => m.userId),
    ...(viewerUserId ? { viewerUserId } : {}),
    transactions,
    categories: normalizedCategories,
    moneySetup,
    balanceOffsets,
    vehicles: garage.vehicles,
    vehiclePrefs: garage.vehiclePrefs,
    vehicleGarageAvailable: garage.available,
    debts,
    ...planning,
  };
}

export async function assertMember(userId: string, householdId: string) {
  const member = await prisma.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId } },
  });
  if (!member) throw new Error("forbidden");
  await assertHouseholdSubscription(householdId);
  return member;
}

export async function importLocalSnapshot(
  userId: string,
  householdId: string,
  data: {
    transactions: Transaction[];
    categories?: CategoryDefinition[];
    replaceTransactions?: boolean;
    replacePlanning?: boolean;
    savingsGoals?: SavingsGoal[];
    categoryBudgets?: CategoryBudget[];
    recurringTransactions?: RecurringTransaction[];
    debts?: DebtItem[];
  },
) {
  await assertMember(userId, householdId);

  if (data.categories?.length) {
    for (const cat of data.categories) {
      await prisma.category.upsert({
        where: { householdId_id: { householdId, id: cat.id } },
        create: appCategoryToDb(householdId, cat),
        update: {
          labelRu: cat.labels.ru,
          labelEn: cat.labels.en,
          keywords: cat.keywords,
          isSystem: cat.isSystem,
        },
      });
    }
  }

  const memberIds = (
    await prisma.householdMember.findMany({
      where: { householdId },
      select: { userId: true },
    })
  ).map((m) => m.userId);

  const caps = await getHouseholdDbCapabilities();
  if (data.replaceTransactions) {
    const keepIds = data.transactions.map((tx) => tx.id);
    await prisma.transaction.deleteMany({
      where: {
        householdId,
        ...(keepIds.length > 0 ? { id: { notIn: keepIds } } : {}),
      },
    });
  }
  if (data.replacePlanning) {
    await Promise.all([
      prisma.savingsGoal.deleteMany({ where: { householdId } }).catch((err) => {
        if (!isMissingDbColumn(err)) throw err;
      }),
      prisma.categoryBudget.deleteMany({ where: { householdId } }).catch((err) => {
        if (!isMissingDbColumn(err)) throw err;
      }),
      prisma.recurringTransaction.deleteMany({ where: { householdId } }).catch((err) => {
        if (!isMissingDbColumn(err)) throw err;
      }),
      ensureHouseholdDebtTable().then((ready) =>
        ready
          ? prisma.$executeRaw`
              DELETE FROM "HouseholdDebt"
              WHERE "householdId" = ${householdId}
            `
          : undefined,
      ),
    ]);
  }

  for (const goal of data.savingsGoals ?? []) {
    await prisma.savingsGoal.upsert({
      where: { householdId_id: { householdId, id: goal.id } },
      create: appGoalToDb(householdId, goal),
      update: appGoalToDb(householdId, goal),
    }).catch((err) => {
      if (!isMissingDbColumn(err)) throw err;
    });
  }
  for (const budget of data.categoryBudgets ?? []) {
    await prisma.categoryBudget.upsert({
      where: { householdId_categoryId: { householdId, categoryId: budget.categoryId } },
      create: appCategoryBudgetToDb(householdId, budget),
      update: { monthlyLimit: budget.monthlyLimit },
    }).catch((err) => {
      if (!isMissingDbColumn(err)) throw err;
    });
  }
  for (const item of data.recurringTransactions ?? []) {
    await prisma.recurringTransaction.upsert({
      where: { id: item.id },
      create: appRecurringToDb(householdId, item),
      update: appRecurringToDb(householdId, item),
    }).catch((err) => {
      if (!isMissingDbColumn(err)) throw err;
    });
  }
  for (const debt of data.debts ?? []) {
    await upsertDebtForHousehold(householdId, debt);
  }
  for (const tx of data.transactions) {
    const createdBy =
      tx.createdBy && memberIds.includes(tx.createdBy) ? tx.createdBy : userId;
    const createPayload = stripUnsupportedTransactionFields(
      { ...appTransactionToDb(householdId, tx, createdBy), createdAt: new Date() },
      caps,
    );
    const updatePayload = stripUnsupportedTransactionFields(
      {
        amount: tx.amount,
        type: tx.type,
        categoryId: tx.categoryId,
        currency: normalizeAppCurrency(tx.currency),
        note: tx.note,
        date: tx.date,
        owner: tx.owner ?? "me",
        goalId: tx.goalId ?? null,
        goalAmount: tx.goalAmount ?? null,
        confirmed: tx.confirmed !== false,
        recurringId: tx.recurringId ?? null,
        ...(tx.createdBy && memberIds.includes(tx.createdBy)
          ? { createdBy: tx.createdBy }
          : {}),
      },
      caps,
    );
    await prisma.transaction.upsert({
      where: { id: tx.id },
      create: createPayload as never,
      update: updatePayload as never,
    });
    if (tx.confirmed !== false) {
      const { recordActivityAndTryQualify } = await import("@/lib/referrals/qualify");
      await recordActivityAndTryQualify(userId, tx.date);
    }
  }

  const [nextPlanning, nextCategories, currentMoneySetup] = await Promise.all([
    fetchPlanningForHousehold(householdId),
    prisma.category.findMany({ where: { householdId } }).then((rows) => rows.map(dbCategoryToApp)),
    readHouseholdMoneySetup(householdId),
  ]);
  const prunedMoneySetup = pruneMoneySetupIds(
    currentMoneySetup,
    nextPlanning.recurringTransactions,
    nextCategories,
  );
  if (JSON.stringify(prunedMoneySetup) !== JSON.stringify(currentMoneySetup)) {
    await writeHouseholdMoneySetup(householdId, prunedMoneySetup);
  }

  return buildSyncPayload(householdId, userId);
}

export async function createCloudTransaction(
  userId: string,
  householdId: string,
  tx: Transaction,
) {
  await assertMember(userId, householdId);
  const memberIds = (
    await prisma.householdMember.findMany({
      where: { householdId },
      select: { userId: true },
    })
  ).map((m) => m.userId);
  const createdBy =
    tx.createdBy && memberIds.includes(tx.createdBy) ? tx.createdBy : userId;
  await createTransactionForHousehold(householdId, { ...tx, createdBy }, createdBy);
  if (tx.confirmed !== false) {
    const { recordActivityAndTryQualify } = await import("@/lib/referrals/qualify");
    await recordActivityAndTryQualify(userId, tx.date);
  }
  return { ...tx, createdBy };
}

export async function updateCloudTransaction(
  userId: string,
  householdId: string,
  id: string,
  patch: Partial<
    Pick<
      Transaction,
      | "amount"
      | "categoryId"
      | "date"
      | "owner"
      | "type"
      | "goalId"
      | "goalAmount"
      | "confirmed"
      | "recurringId"
      | "createdBy"
      | "odometerKm"
      | "fuelLiters"
      | "vehicleId"
      | "note"
    >
  >,
) {
  await assertMember(userId, householdId);
  const existing = await findTransactionInHousehold(householdId, id);
  if (!existing) throw new Error("not_found");

  const memberIds = (
    await prisma.householdMember.findMany({
      where: { householdId },
      select: { userId: true },
    })
  ).map((m) => m.userId);

  let createdBy = existing.createdBy;
  if (patch.createdBy !== undefined) {
    if (patch.createdBy && memberIds.includes(patch.createdBy)) {
      createdBy = patch.createdBy;
    }
  }

  await updateTransactionForHousehold(
    householdId,
    id,
    patch,
    existing,
    createdBy,
  );
  return existing;
}

export async function deleteCloudTransaction(userId: string, householdId: string, id: string) {
  await assertMember(userId, householdId);
  const existing = await findTransactionInHousehold(householdId, id);
  if (!existing) throw new Error("not_found");
  await deleteTransactionForHousehold(householdId, id);
}

export async function upsertCloudCategory(
  userId: string,
  householdId: string,
  cat: CategoryDefinition,
) {
  await assertMember(userId, householdId);
  await prisma.category.upsert({
    where: { householdId_id: { householdId, id: cat.id } },
    create: appCategoryToDb(householdId, cat),
    update: {
      type: cat.type,
      labelRu: cat.labels.ru,
      labelEn: cat.labels.en,
      keywords: cat.keywords,
      isSystem: cat.isSystem,
    },
  });
}

export async function deleteCloudCategory(userId: string, householdId: string, id: string) {
  await assertMember(userId, householdId);
  const existing = await prisma.category.findUnique({
    where: { householdId_id: { householdId, id } },
  });
  if (!existing) throw new Error("not_found");

  const fallback = getFallbackCategoryId(existing.type);
  if (existing.id === fallback) throw new Error("cannot_delete_fallback");
  await prisma.transaction.updateMany({
    where: { householdId, categoryId: id },
    data: { categoryId: fallback },
  });
  await prisma.category.delete({
    where: { householdId_id: { householdId, id } },
  });
}

export async function updatePartnerLabel(
  userId: string,
  householdId: string,
  partnerLabel: string | null,
) {
  const member = await assertMember(userId, householdId);
  if (member.role !== "OWNER") throw new Error("forbidden");
  await prisma.household.update({
    where: { id: householdId },
    data: { partnerLabel: partnerLabel?.trim() || null },
  });
}

export async function upsertCloudGoal(
  userId: string,
  householdId: string,
  goal: SavingsGoal,
) {
  await assertMember(userId, householdId);
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

export async function deleteCloudGoal(userId: string, householdId: string, id: string) {
  await assertMember(userId, householdId);
  const existing = await prisma.savingsGoal.findUnique({
    where: { householdId_id: { householdId, id } },
  });
  if (!existing) throw new Error("not_found");
  if (existing.kind === "emergency") throw new Error("cannot_delete_emergency");
  await prisma.savingsGoal.delete({ where: { householdId_id: { householdId, id } } });
}

export async function depositCloudGoal(
  userId: string,
  householdId: string,
  id: string,
  amount: number,
) {
  await assertMember(userId, householdId);
  const existing = await prisma.savingsGoal.findUnique({
    where: { householdId_id: { householdId, id } },
  });
  if (!existing) throw new Error("not_found");
  const goal = applyGoalMonthlyToGoal(
    dbGoalToApp({ ...existing, savedAmount: existing.savedAmount + amount }),
  );
  await prisma.savingsGoal.update({
    where: { householdId_id: { householdId, id } },
    data: {
      savedAmount: goal.savedAmount,
      monthlyContribution: goal.monthlyContribution,
    },
  });
}

export async function upsertCloudCategoryBudget(
  userId: string,
  householdId: string,
  budget: CategoryBudget,
) {
  await assertMember(userId, householdId);
  const data = appCategoryBudgetToDb(householdId, budget);
  await prisma.categoryBudget.upsert({
    where: { householdId_categoryId: { householdId, categoryId: data.categoryId } },
    create: { ...data, id: `${householdId}-${data.categoryId}` },
    update: { monthlyLimit: data.monthlyLimit },
  });
}

export async function deleteCloudCategoryBudget(
  userId: string,
  householdId: string,
  categoryId: string,
) {
  await assertMember(userId, householdId);
  const existing = await prisma.categoryBudget.findUnique({
    where: { householdId_categoryId: { householdId, categoryId } },
  });
  if (!existing) throw new Error("not_found");
  await prisma.categoryBudget.delete({ where: { id: existing.id } });
}

export async function upsertCloudRecurring(
  userId: string,
  householdId: string,
  item: RecurringTransaction,
) {
  await assertMember(userId, householdId);
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
    },
  });
}

export async function deleteCloudRecurring(userId: string, householdId: string, id: string) {
  await assertMember(userId, householdId);
  const existing = await prisma.recurringTransaction.findFirst({ where: { id, householdId } });
  if (!existing) throw new Error("not_found");
  await prisma.recurringTransaction.delete({ where: { id } });
}

export async function upsertCloudDebt(
  userId: string,
  householdId: string,
  debt: DebtItem,
) {
  await assertMember(userId, householdId);
  await upsertDebtForHousehold(householdId, debt);
}

export async function deleteCloudDebt(userId: string, householdId: string, id: string) {
  await assertMember(userId, householdId);
  await deleteDebtForHousehold(householdId, id);
}

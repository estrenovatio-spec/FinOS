import { randomUUID } from "node:crypto";
import type { BusinessCloudPayload } from "@/lib/business/types";
import { defaultBusinessUnit } from "@/lib/business/types";
import { mergeBusinessPayload } from "@/lib/business/merge";
import { prisma } from "@/lib/db";
import { isMissingDbObject } from "@/lib/household/db-capabilities";

export { mergeBusinessPayload } from "@/lib/business/merge";

let ledgerTableExistsCache: { value: boolean; checkedAt: number } | null = null;
const LEDGER_TABLE_CACHE_MS = 60_000;

async function userBusinessLedgerTableExists(): Promise<boolean> {
  if (
    ledgerTableExistsCache &&
    Date.now() - ledgerTableExistsCache.checkedAt < LEDGER_TABLE_CACHE_MS
  ) {
    return ledgerTableExistsCache.value;
  }

  try {
    const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'UserBusinessLedger'
      ) AS "exists"
    `;
    const value = Boolean(rows[0]?.exists);
    ledgerTableExistsCache = { value, checkedAt: Date.now() };
    return value;
  } catch {
    ledgerTableExistsCache = { value: false, checkedAt: Date.now() };
    return false;
  }
}

export async function ensureBusinessCloudTables(): Promise<boolean> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "UserBusinessLedger" (
        "userId" TEXT PRIMARY KEY,
        "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "UserBusinessLedger_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION "set_UserBusinessLedger_updatedAt"()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW."updatedAt" = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_trigger
          WHERE tgname = 'UserBusinessLedger_updatedAt_trigger'
            AND tgrelid = '"UserBusinessLedger"'::regclass
        ) THEN
          CREATE TRIGGER "UserBusinessLedger_updatedAt_trigger"
          BEFORE UPDATE ON "UserBusinessLedger"
          FOR EACH ROW
          EXECUTE FUNCTION "set_UserBusinessLedger_updatedAt"();
        END IF;
      EXCEPTION
        WHEN duplicate_object THEN
          NULL;
      END
      $$
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "UserBusinessBackup" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "payload" JSONB NOT NULL,
        "reason" TEXT NOT NULL DEFAULT 'manual',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "UserBusinessBackup_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "UserBusinessBackup_userId_createdAt_idx"
      ON "UserBusinessBackup" ("userId", "createdAt" DESC)
    `);
    ledgerTableExistsCache = { value: true, checkedAt: Date.now() };
    return true;
  } catch (e) {
    console.error("[business/cloud tables]", e);
    ledgerTableExistsCache = { value: false, checkedAt: Date.now() };
    return false;
  }
}

function emptyPayload(): BusinessCloudPayload {
  const unit = defaultBusinessUnit();
  return {
    version: 2,
    units: [unit],
    transactions: [],
    deletedTransactionIds: [],
    assets: [],
    deletedAssetIds: [],
    debts: [],
    deletedUnitsArchive: [],
    passiveReceipts: [],
    selectedUnitId: unit.id,
  };
}

function normalizePayload(raw: unknown): BusinessCloudPayload {
  if (!raw || typeof raw !== "object") return emptyPayload();
  const o = raw as Record<string, unknown>;
  const units = Array.isArray(o.units) ? o.units : [];
  const transactions = Array.isArray(o.transactions) ? o.transactions : [];
  const deletedTransactionIds = Array.isArray(o.deletedTransactionIds)
    ? o.deletedTransactionIds.filter((id): id is string => typeof id === "string")
    : [];
  const deletedTransactionIdSet = new Set(deletedTransactionIds);
  const deletedAssetIds = Array.isArray(o.deletedAssetIds)
    ? o.deletedAssetIds.filter((id): id is string => typeof id === "string")
    : [];
  const deletedAssetIdSet = new Set(deletedAssetIds);
  const assets = Array.isArray(o.assets) ? o.assets : [];
  const debts = Array.isArray(o.debts) ? o.debts : [];
  const deletedUnitsArchive = Array.isArray(o.deletedUnitsArchive) ? o.deletedUnitsArchive : [];
  if (units.length === 0) {
    const unit = defaultBusinessUnit();
    return {
      version: 2,
      units: [unit],
      transactions: transactions
        .map((t) => ({
          ...(t as object),
          unitId: (t as { unitId?: string }).unitId ?? unit.id,
        }))
        .filter((t) => !deletedTransactionIdSet.has((t as { id?: string }).id ?? "")) as BusinessCloudPayload["transactions"],
      deletedTransactionIds,
      deletedAssetIds,
      assets: assets.map((a) => ({
        ...(a as object),
        unitId: (a as { unitId?: string }).unitId ?? unit.id,
      })).filter((a) => !deletedAssetIdSet.has((a as { id?: string }).id ?? "")) as BusinessCloudPayload["assets"],
      debts: debts.map((d) => ({
        ...(d as object),
        unitId: (d as { unitId?: string }).unitId ?? unit.id,
      })) as BusinessCloudPayload["debts"],
      deletedUnitsArchive:
        deletedUnitsArchive as BusinessCloudPayload["deletedUnitsArchive"],
      passiveReceipts: [],
      taxRatePct: typeof o.taxRatePct === "number" ? o.taxRatePct : 0,
      selectedUnitId: unit.id,
    };
  }
  const passiveReceipts = Array.isArray(o.passiveReceipts) ? o.passiveReceipts : [];
  const selectedUnitId =
    typeof o.selectedUnitId === "string" &&
    (units as { id?: string }[]).some((unit) => unit.id === o.selectedUnitId)
      ? o.selectedUnitId
      : null;

  return {
    version: 2,
    units: units as BusinessCloudPayload["units"],
    transactions: (transactions as BusinessCloudPayload["transactions"]).filter(
      (t) => !deletedTransactionIdSet.has(t.id),
    ),
    deletedTransactionIds,
    deletedAssetIds,
    assets: (assets as BusinessCloudPayload["assets"]).filter((a) => !deletedAssetIdSet.has(a.id)),
    debts: debts as BusinessCloudPayload["debts"],
    deletedUnitsArchive:
      deletedUnitsArchive as BusinessCloudPayload["deletedUnitsArchive"],
    passiveReceipts: passiveReceipts as BusinessCloudPayload["passiveReceipts"],
    taxRatePct: typeof o.taxRatePct === "number" ? o.taxRatePct : 0,
    selectedUnitId,
  };
}

export function hasMeaningfulBusinessPayload(payload: BusinessCloudPayload | null | undefined): boolean {
  if (!payload) return false;
  const units = payload.units ?? [];
  const nonDefaultUnits = units.filter((unit) => {
    const name = unit?.name?.trim().toLowerCase();
    return name && name !== "мой бизнес";
  });
  return (
    nonDefaultUnits.length > 0 ||
    (payload.transactions?.length ?? 0) > 0 ||
    (payload.assets?.length ?? 0) > 0 ||
    (payload.deletedAssetIds?.length ?? 0) > 0 ||
    (payload.debts?.length ?? 0) > 0 ||
    (payload.passiveReceipts?.length ?? 0) > 0 ||
    (payload.deletedUnitsArchive?.length ?? 0) > 0
  );
}

export async function backupUserBusinessPayload(
  userId: string,
  payload: BusinessCloudPayload,
  reason = "before_update",
): Promise<boolean> {
  if (!(await ensureBusinessCloudTables())) return false;
  const data = normalizePayload(payload);
  if (!hasMeaningfulBusinessPayload(data)) return false;
  const json = JSON.stringify(data);
  try {
    const recentWindow =
      reason === "manual"
        ? "30 minutes"
        : reason.startsWith("daily_")
          ? "23 hours"
          : reason === "first_save"
            ? "365 days"
            : "23 hours";

    const recentSameReason = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "UserBusinessBackup"
      WHERE "userId" = ${userId}
        AND "reason" = ${reason}
        AND "createdAt" > NOW() - (${recentWindow})::interval
      LIMIT 1
    `;
    if (recentSameReason.length > 0 && reason !== "manual") return false;

    const duplicate = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "UserBusinessBackup"
      WHERE "userId" = ${userId}
        AND "reason" = ${reason}
        AND "payload" = CAST(${json} AS jsonb)
        AND "createdAt" > NOW() - INTERVAL '30 minutes'
      LIMIT 1
    `;
    if (duplicate.length > 0) return false;

    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "UserBusinessBackup" ("id", "userId", "payload", "reason")
      VALUES (${id}, ${userId}, CAST(${json} AS jsonb), ${reason})
    `;
    await prisma.$executeRaw`
      DELETE FROM "UserBusinessBackup"
      WHERE "userId" = ${userId}
        AND "id" NOT IN (
          SELECT "id" FROM "UserBusinessBackup"
          WHERE "userId" = ${userId}
          ORDER BY "createdAt" DESC
          LIMIT 90
        )
    `;
    return true;
  } catch (e) {
    console.error("[business/backup]", e);
    return false;
  }
}

export type UserBusinessBackupSummary = {
  id: string;
  createdAt: string;
  reason: string;
  units: number;
  transactions: number;
  assets: number;
  debts: number;
  unitNames: string[];
  assetNames: string[];
};

function backupSummary(row: { id: string; createdAt: Date; reason: string; payload: unknown }): UserBusinessBackupSummary {
  const payload = normalizePayload(row.payload);
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    reason: row.reason,
    units: payload.units.length,
    transactions: payload.transactions.length,
    assets: payload.assets.length,
    debts: payload.debts?.length ?? 0,
    unitNames: payload.units.map((unit) => unit.name).filter(Boolean).slice(0, 6),
    assetNames: payload.assets.map((asset) => asset.name).filter(Boolean).slice(0, 6),
  };
}

export async function listUserBusinessBackups(
  userId: string,
  limit = 20,
): Promise<UserBusinessBackupSummary[]> {
  if (!(await ensureBusinessCloudTables())) return [];
  const rows = await prisma.$queryRaw<
    { id: string; createdAt: Date; reason: string; payload: unknown }[]
  >`
    SELECT "id", "createdAt", "reason", "payload"
    FROM "UserBusinessBackup"
    WHERE "userId" = ${userId}
    ORDER BY "createdAt" DESC
    LIMIT ${Math.max(1, Math.min(50, limit))}
  `;
  return rows.map(backupSummary);
}

export async function restoreUserBusinessBackup(
  userId: string,
  backupId: string,
): Promise<BusinessCloudPayload | null> {
  if (!(await ensureBusinessCloudTables())) return null;
  const rows = await prisma.$queryRaw<{ payload: unknown }[]>`
    SELECT "payload"
    FROM "UserBusinessBackup"
    WHERE "userId" = ${userId} AND "id" = ${backupId}
    LIMIT 1
  `;
  const payload = rows[0]?.payload;
  if (!payload) return null;
  const current = await fetchUserBusinessPayload(userId);
  if (current) await backupUserBusinessPayload(userId, current, "before_restore");
  const restored = normalizePayload(payload);
  await saveUserBusinessPayload(userId, restored);
  return restored;
}

export async function fetchUserBusinessPayload(
  userId: string,
): Promise<BusinessCloudPayload | null> {
  if (!(await ensureBusinessCloudTables())) return null;

  try {
    const row = await prisma.userBusinessLedger.findUnique({ where: { userId } });
    if (!row) return null;
    return normalizePayload(row.payload);
  } catch (err) {
    if (!isMissingDbObject(err)) throw err;
    try {
      const rows = await prisma.$queryRaw<{ payload: unknown }[]>`
        SELECT payload FROM "UserBusinessLedger" WHERE "userId" = ${userId} LIMIT 1
      `;
      if (!rows[0]) return null;
      return normalizePayload(rows[0].payload);
    } catch {
      return null;
    }
  }
}

export async function saveUserBusinessPayload(
  userId: string,
  payload: BusinessCloudPayload,
): Promise<boolean> {
  if (!(await ensureBusinessCloudTables())) return false;

  const data = normalizePayload(payload);
  try {
    await prisma.userBusinessLedger.upsert({
      where: { userId },
      create: { userId, payload: data },
      update: { payload: data },
    });
    return true;
  } catch (err) {
    if (!isMissingDbObject(err)) throw err;
    ledgerTableExistsCache = { value: false, checkedAt: Date.now() };
    return false;
  }
}

import { prisma } from "@/lib/db";
import type { DebtItem } from "@/types/planning";

let debtTableReady: { value: boolean; checkedAt: number } | null = null;
const DEBT_TABLE_CACHE_MS = 60_000;

function normalizeDebt(row: Partial<DebtItem> & { id: string; name: string }): DebtItem {
  return {
    id: row.id,
    name: row.name.trim().slice(0, 80) || "Долг",
    owner: row.owner === "me" || row.owner === "partner" || row.owner === "all" ? row.owner : "all",
    balance: Math.max(0, Number(row.balance) || 0),
    minPayment: Math.max(0, Number(row.minPayment) || 0),
    ratePct:
      row.ratePct == null || Number.isNaN(Number(row.ratePct))
        ? null
        : Math.max(0, Math.min(999, Math.round(Number(row.ratePct) * 10) / 10)),
    nextPaymentDate:
      typeof row.nextPaymentDate === "string" && row.nextPaymentDate.trim()
        ? row.nextPaymentDate.trim()
        : null,
    strategy: row.strategy === "snowball" ? "snowball" : "avalanche",
    priority: row.priority === "high" ? "high" : "normal",
    updatedAt: row.updatedAt ?? new Date().toISOString(),
  };
}

export async function ensureHouseholdDebtTable(): Promise<boolean> {
  if (debtTableReady && Date.now() - debtTableReady.checkedAt < DEBT_TABLE_CACHE_MS) {
    return debtTableReady.value;
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "HouseholdDebt" (
        "id" TEXT PRIMARY KEY,
        "householdId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "owner" TEXT NOT NULL DEFAULT 'all',
        "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "minPayment" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "ratePct" DOUBLE PRECISION,
        "nextPaymentDate" TEXT,
        "strategy" TEXT NOT NULL DEFAULT 'avalanche',
        "priority" TEXT NOT NULL DEFAULT 'normal',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "HouseholdDebt_householdId_fkey"
          FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "HouseholdDebt_householdId_updatedAt_idx"
      ON "HouseholdDebt" ("householdId", "updatedAt" DESC)
    `);
    debtTableReady = { value: true, checkedAt: Date.now() };
    return true;
  } catch (e) {
    console.error("[household/debts table]", e);
    debtTableReady = { value: false, checkedAt: Date.now() };
    return false;
  }
}

export async function fetchDebtsForHousehold(householdId: string): Promise<DebtItem[]> {
  if (!(await ensureHouseholdDebtTable())) return [];
  const rows = await prisma.$queryRaw<
    {
      id: string;
      name: string;
      owner: string;
      balance: number;
      minPayment: number;
      ratePct: number | null;
      nextPaymentDate: string | null;
      strategy: string;
      priority: string;
      updatedAt: Date;
    }[]
  >`
    SELECT id, name, owner, balance, "minPayment", "ratePct", "nextPaymentDate", strategy, priority, "updatedAt"
    FROM "HouseholdDebt"
    WHERE "householdId" = ${householdId}
    ORDER BY "updatedAt" DESC
  `;
  return rows.map((row) =>
    normalizeDebt({
      ...row,
      owner: row.owner as DebtItem["owner"],
      strategy: row.strategy as DebtItem["strategy"],
      priority: row.priority as DebtItem["priority"],
      updatedAt: row.updatedAt.toISOString(),
    }),
  );
}

export async function upsertDebtForHousehold(
  householdId: string,
  debt: DebtItem,
): Promise<DebtItem | null> {
  if (!(await ensureHouseholdDebtTable())) return null;
  const item = normalizeDebt(debt);
  await prisma.$executeRaw`
    INSERT INTO "HouseholdDebt" (
      id, "householdId", name, owner, balance, "minPayment", "ratePct",
      "nextPaymentDate", strategy, priority, "updatedAt"
    ) VALUES (
      ${item.id}, ${householdId}, ${item.name}, ${item.owner}, ${item.balance},
      ${item.minPayment}, ${item.ratePct}, ${item.nextPaymentDate}, ${item.strategy},
      ${item.priority}, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      owner = EXCLUDED.owner,
      balance = EXCLUDED.balance,
      "minPayment" = EXCLUDED."minPayment",
      "ratePct" = EXCLUDED."ratePct",
      "nextPaymentDate" = EXCLUDED."nextPaymentDate",
      strategy = EXCLUDED.strategy,
      priority = EXCLUDED.priority,
      "updatedAt" = NOW()
  `;
  return item;
}

export async function deleteDebtForHousehold(
  householdId: string,
  id: string,
): Promise<void> {
  if (!(await ensureHouseholdDebtTable())) return;
  await prisma.$executeRaw`
    DELETE FROM "HouseholdDebt"
    WHERE "householdId" = ${householdId} AND id = ${id}
  `;
}

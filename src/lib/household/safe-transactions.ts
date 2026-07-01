import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  canUsePrismaTransactionModel,
  getHouseholdDbCapabilities,
  isMissingDbObject,
  type HouseholdDbCapabilities,
} from "@/lib/household/db-capabilities";
import { PARTNER_TRANSFER_CATEGORY_ID, isPartnerTransferLike } from "@/lib/partner-transfer";
import { appTransactionToDb, dbTransactionToApp } from "@/lib/household/sync-mapper";
import type { Transaction } from "@/types";

type TxRow = {
  id: string;
  householdId: string;
  amount: number;
  type: string;
  categoryId: string;
  currency: string;
  note: string;
  date: string;
  owner: string;
  goalId: string | null;
  goalAmount: number | null;
  createdBy: string | null;
  confirmed: boolean;
  recurringId: string | null;
  odometerKm: number | null;
  fuelLiters: number | null;
  vehicleId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapRawRow(row: TxRow, caps: HouseholdDbCapabilities): Transaction {
  return dbTransactionToApp({
    ...row,
    type: row.type as Transaction["type"],
    odometerKm: caps.txOdometerKm ? row.odometerKm : null,
    fuelLiters: caps.txFuelLiters ? row.fuelLiters : null,
    vehicleId: caps.txVehicleId ? row.vehicleId : null,
  } as Parameters<typeof dbTransactionToApp>[0]);
}

async function fetchTransactionsRaw(
  householdId: string,
  caps: HouseholdDbCapabilities,
): Promise<Transaction[]> {
  const odometerSelect = caps.txOdometerKm
    ? Prisma.sql`"odometerKm"`
    : Prisma.sql`NULL::int AS "odometerKm"`;
  const vehicleSelect = caps.txVehicleId
    ? Prisma.sql`"vehicleId"`
    : Prisma.sql`NULL::text AS "vehicleId"`;
  const fuelLitersSelect = caps.txFuelLiters
    ? Prisma.sql`"fuelLiters"`
    : Prisma.sql`NULL::double precision AS "fuelLiters"`;

  const rows = await prisma.$queryRaw<TxRow[]>`
    SELECT
      id,
      "householdId",
      amount,
      type,
      "categoryId",
      currency,
      note,
      date,
      owner,
      "goalId",
      "goalAmount",
      "createdBy",
      confirmed,
      "recurringId",
      ${odometerSelect},
      ${fuelLitersSelect},
      ${vehicleSelect},
      "createdAt",
      "updatedAt"
    FROM "Transaction"
    WHERE "householdId" = ${householdId}
    ORDER BY date DESC, "createdAt" DESC
  `;

  return rows.map((r) => mapRawRow(r, caps));
}

export async function fetchTransactionsForHousehold(householdId: string): Promise<Transaction[]> {
  const caps = await getHouseholdDbCapabilities();
  if (canUsePrismaTransactionModel(caps)) {
    try {
      const rows = await prisma.transaction.findMany({
        where: { householdId },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      });
      return rows.map(dbTransactionToApp);
    } catch (err) {
      if (!isMissingDbObject(err)) throw err;
    }
  }
  return fetchTransactionsRaw(householdId, caps);
}

export function stripUnsupportedTransactionFields(
  data: Record<string, unknown>,
  caps: HouseholdDbCapabilities,
): Record<string, unknown> {
  const out = { ...data };
  if (!caps.txOdometerKm) delete out.odometerKm;
  if (!caps.txFuelLiters) delete out.fuelLiters;
  if (!caps.txVehicleId) delete out.vehicleId;
  return out;
}

export async function createTransactionForHousehold(
  householdId: string,
  tx: Transaction,
  createdBy?: string,
): Promise<void> {
  const caps = await getHouseholdDbCapabilities();
  const data = stripUnsupportedTransactionFields(
    { ...appTransactionToDb(householdId, tx, createdBy), createdAt: new Date() },
    caps,
  );

  if (canUsePrismaTransactionModel(caps)) {
    try {
      await prisma.transaction.create({ data: data as never });
      return;
    } catch (err) {
      if (!isMissingDbObject(err)) throw err;
    }
  }

  await prisma.$executeRaw`
    INSERT INTO "Transaction" (
      id, "householdId", amount, type, "categoryId", currency, note, date, owner,
      "goalId", "goalAmount", "createdBy", confirmed, "recurringId", "createdAt", "updatedAt"
      ${caps.txOdometerKm ? Prisma.sql`, "odometerKm"` : Prisma.empty}
      ${caps.txFuelLiters ? Prisma.sql`, "fuelLiters"` : Prisma.empty}
      ${caps.txVehicleId ? Prisma.sql`, "vehicleId"` : Prisma.empty}
    ) VALUES (
      ${String(data.id)}, ${householdId}, ${Number(data.amount)}, ${String(data.type)}::"TxType",
      ${String(data.categoryId)}, ${String(data.currency)}, ${String(data.note)}, ${String(data.date)},
      ${String(data.owner)}, ${data.goalId as string | null}, ${data.goalAmount as number | null},
      ${data.createdBy as string | null}, ${Boolean(data.confirmed)}, ${data.recurringId as string | null},
      NOW(), NOW()
      ${caps.txOdometerKm ? Prisma.sql`, ${data.odometerKm as number | null}` : Prisma.empty}
      ${caps.txFuelLiters ? Prisma.sql`, ${data.fuelLiters as number | null}` : Prisma.empty}
      ${caps.txVehicleId ? Prisma.sql`, ${data.vehicleId as string | null}` : Prisma.empty}
    )
  `;
}

export async function updateTransactionForHousehold(
  householdId: string,
  id: string,
  patch: Partial<
    Pick<
      Transaction,
      | "amount"
      | "categoryId"
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
  existing: {
    amount: number;
    categoryId: string;
    owner: string;
    type: string;
    createdBy: string | null;
    note: string;
  },
  createdBy: string | null,
): Promise<void> {
  const caps = await getHouseholdDbCapabilities();
  const data = stripUnsupportedTransactionFields(
    {
      amount: patch.amount ?? existing.amount,
      categoryId: patch.categoryId ?? existing.categoryId,
      owner: patch.owner ?? existing.owner,
      type: patch.type ?? existing.type,
      createdBy,
      ...(patch.goalId !== undefined ? { goalId: patch.goalId } : {}),
      ...(patch.goalAmount !== undefined ? { goalAmount: patch.goalAmount } : {}),
      ...(patch.confirmed !== undefined ? { confirmed: patch.confirmed } : {}),
      ...(patch.recurringId !== undefined ? { recurringId: patch.recurringId } : {}),
      ...(patch.odometerKm !== undefined ? { odometerKm: patch.odometerKm } : {}),
      ...(patch.fuelLiters !== undefined ? { fuelLiters: patch.fuelLiters } : {}),
      ...(patch.vehicleId !== undefined ? { vehicleId: patch.vehicleId } : {}),
      note: patch.note !== undefined ? patch.note : existing.note,
    },
    caps,
  );

  if (canUsePrismaTransactionModel(caps)) {
    try {
      await prisma.transaction.update({ where: { id }, data: data as never });
      return;
    } catch (err) {
      if (!isMissingDbObject(err)) throw err;
    }
  }

  const sets: Prisma.Sql[] = [
    Prisma.sql`amount = ${Number(data.amount)}`,
    Prisma.sql`"categoryId" = ${String(data.categoryId)}`,
    Prisma.sql`owner = ${String(data.owner)}`,
    Prisma.sql`type = ${String(data.type)}::"TxType"`,
    Prisma.sql`"createdBy" = ${createdBy}`,
    Prisma.sql`"updatedAt" = NOW()`,
  ];
  if (patch.goalId !== undefined) sets.push(Prisma.sql`"goalId" = ${patch.goalId}`);
  if (patch.goalAmount !== undefined) sets.push(Prisma.sql`"goalAmount" = ${patch.goalAmount}`);
  if (patch.confirmed !== undefined) sets.push(Prisma.sql`confirmed = ${patch.confirmed}`);
  if (patch.recurringId !== undefined) sets.push(Prisma.sql`"recurringId" = ${patch.recurringId}`);
  if (caps.txOdometerKm && patch.odometerKm !== undefined) {
    sets.push(Prisma.sql`"odometerKm" = ${patch.odometerKm}`);
  }
  if (caps.txFuelLiters && patch.fuelLiters !== undefined) {
    sets.push(Prisma.sql`"fuelLiters" = ${patch.fuelLiters}`);
  }
  if (caps.txVehicleId && patch.vehicleId !== undefined) {
    sets.push(Prisma.sql`"vehicleId" = ${patch.vehicleId}`);
  }
  if (patch.note !== undefined) {
    sets.push(Prisma.sql`note = ${patch.note}`);
  }

  await prisma.$executeRaw`
    UPDATE "Transaction"
    SET ${Prisma.join(sets, ", ")}
    WHERE id = ${id} AND "householdId" = ${householdId}
  `;
}

export async function deleteTransactionForHousehold(
  householdId: string,
  id: string,
): Promise<void> {
  const caps = await getHouseholdDbCapabilities();
  const existing = await findTransactionInHousehold(householdId, id);
  if (!existing) return;
  const shouldDeletePartnerPair = isPartnerTransferLike(existing);
  const oppositeType = existing?.type === "income" ? "expense" : "income";

  if (canUsePrismaTransactionModel(caps)) {
    try {
      if (shouldDeletePartnerPair) {
        await prisma.transaction.deleteMany({
          where: {
            householdId,
            date: existing.date,
            amount: existing.amount,
            AND: [
              {
                OR: [
                  { id },
                  { categoryId: PARTNER_TRANSFER_CATEGORY_ID },
                  { note: { contains: "партн", mode: "insensitive" } },
                  { note: { contains: "partner", mode: "insensitive" } },
                  { note: { contains: "жене", mode: "insensitive" } },
                  { note: { contains: "жена", mode: "insensitive" } },
                  { note: { contains: "мужу", mode: "insensitive" } },
                  { note: { contains: "муж", mode: "insensitive" } },
                ],
              },
              {
                OR: [{ id }, { type: oppositeType }],
              },
            ],
          },
        });
      } else {
        await prisma.transaction.delete({ where: { id } });
      }
      return;
    } catch (err) {
      if (!isMissingDbObject(err)) throw err;
    }
  }
  if (shouldDeletePartnerPair) {
    await prisma.$executeRaw`
      DELETE FROM "Transaction"
      WHERE "householdId" = ${householdId}
        AND date = ${existing.date}
        AND amount = ${existing.amount}
        AND (
          id = ${id}
          OR "categoryId" = ${PARTNER_TRANSFER_CATEGORY_ID}
          OR LOWER(note) LIKE '%партн%'
          OR LOWER(note) LIKE '%partner%'
          OR LOWER(note) LIKE '%жене%'
          OR LOWER(note) LIKE '%жена%'
          OR LOWER(note) LIKE '%мужу%'
          OR LOWER(note) LIKE '%муж%'
        )
        AND (id = ${id} OR type = ${oppositeType})
    `;
    return;
  }
  await prisma.$executeRaw`
    DELETE FROM "Transaction"
    WHERE id = ${id} AND "householdId" = ${householdId}
  `;
}

export async function findTransactionInHousehold(
  householdId: string,
  id: string,
): Promise<TxRow | null> {
  const caps = await getHouseholdDbCapabilities();
  if (canUsePrismaTransactionModel(caps)) {
    try {
      const row = await prisma.transaction.findFirst({ where: { id, householdId } });
      return row ? ({ ...row, fuelLiters: (row as { fuelLiters?: number | null }).fuelLiters ?? null } as TxRow) : null;
    } catch (err) {
      if (!isMissingDbObject(err)) throw err;
    }
  }

  const list = await fetchTransactionsRaw(householdId, caps);
  const hit = list.find((t) => t.id === id);
  if (!hit) return null;
  return {
    id: hit.id,
    householdId,
    amount: hit.amount,
    type: hit.type,
    categoryId: hit.categoryId,
    currency: hit.currency,
    note: hit.note,
    date: hit.date,
    owner: hit.owner ?? "me",
    goalId: hit.goalId ?? null,
    goalAmount: hit.goalAmount ?? null,
    createdBy: hit.createdBy ?? null,
    confirmed: hit.confirmed !== false,
    recurringId: hit.recurringId ?? null,
    odometerKm: hit.odometerKm ?? null,
    fuelLiters: hit.fuelLiters ?? null,
    vehicleId: hit.vehicleId ?? null,
    createdAt: new Date(),
    updatedAt: new Date(hit.updatedAt ?? Date.now()),
  };
}

import { prisma } from "@/lib/db";

/** Какие опциональные объекты реально есть в подключённой БД (не в prisma/schema). */
export type HouseholdDbCapabilities = {
  txOdometerKm: boolean;
  txFuelLiters: boolean;
  txVehicleId: boolean;
  vehicleGarage: boolean;
  savingsGoalMonthlyContribution: boolean;
  savingsGoalKind: boolean;
  savingsGoalEmergencyMonths: boolean;
};

const DEFAULT_CAPS: HouseholdDbCapabilities = {
  txOdometerKm: false,
  txFuelLiters: false,
  txVehicleId: false,
  vehicleGarage: false,
  savingsGoalMonthlyContribution: false,
  savingsGoalKind: false,
  savingsGoalEmergencyMonths: false,
};

let cached: HouseholdDbCapabilities | null = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

export function isMissingDbObject(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("does not exist") ||
    msg.includes("P2022") ||
    msg.includes("P2021") ||
    msg.includes("Unknown column")
  );
}

/** Сброс кэша после ручной миграции (тесты / админ). */
export function resetDbCapabilitiesCache(): void {
  cached = null;
  cachedAt = 0;
}

export async function getHouseholdDbCapabilities(): Promise<HouseholdDbCapabilities> {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;

  try {
    const rows = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
      SELECT table_name::text AS table_name, column_name::text AS column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'Transaction' AND column_name IN ('odometerKm', 'fuelLiters', 'vehicleId'))
          OR (table_name = 'Household' AND column_name IN ('vehicleGarageMode', 'vehicleMemberPrefs'))
          OR (table_name = 'Vehicle' AND column_name = 'id')
          OR (table_name = 'SavingsGoal' AND column_name IN ('monthlyContribution', 'kind', 'emergencyMonths'))
        )
    `;

    const txCols = new Set(
      rows.filter((r) => r.table_name === "Transaction").map((r) => r.column_name),
    );
    const householdCols = new Set(
      rows.filter((r) => r.table_name === "Household").map((r) => r.column_name),
    );
    const savingsGoalCols = new Set(
      rows.filter((r) => r.table_name === "SavingsGoal").map((r) => r.column_name),
    );
    const hasVehicleTable = rows.some((r) => r.table_name === "Vehicle");

    cached = {
      txOdometerKm: txCols.has("odometerKm"),
      txFuelLiters: txCols.has("fuelLiters"),
      txVehicleId: txCols.has("vehicleId"),
      savingsGoalMonthlyContribution: savingsGoalCols.has("monthlyContribution"),
      savingsGoalKind: savingsGoalCols.has("kind"),
      savingsGoalEmergencyMonths: savingsGoalCols.has("emergencyMonths"),
      vehicleGarage:
        hasVehicleTable &&
        householdCols.has("vehicleGarageMode") &&
        householdCols.has("vehicleMemberPrefs"),
    };
  } catch {
    cached = DEFAULT_CAPS;
  }

  cachedAt = Date.now();
  return cached;
}

/** Prisma SELECT по Transaction безопасен только если все опциональные колонки на месте. */
export function canUsePrismaTransactionModel(caps: HouseholdDbCapabilities): boolean {
  return caps.txOdometerKm && caps.txFuelLiters && caps.txVehicleId;
}

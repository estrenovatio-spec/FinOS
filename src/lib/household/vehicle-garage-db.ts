import type { VehicleGarageMode } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  appVehicleToDb,
  dbVehicleToApp,
  garageModeFromDb,
  garageModeToDb,
  memberPrefsFromDb,
  memberPrefsToDb,
} from "@/lib/household/vehicle-mapper";
import {
  getHouseholdDbCapabilities,
  isMissingDbObject,
} from "@/lib/household/db-capabilities";
import { normalizeVehicle, normalizeVehicleGaragePrefs, normalizeVehicles } from "@/lib/vehicle";
import type { Vehicle, VehicleGaragePrefs } from "@/types/vehicle";

export type VehicleGarageSnapshot = {
  vehicles: Vehicle[];
  vehiclePrefs: VehicleGaragePrefs;
  available: boolean;
};

export class VehicleGarageDbNotConfiguredError extends Error {
  constructor() {
    super("vehicle_garage_not_configured");
    this.name = "VehicleGarageDbNotConfiguredError";
  }
}

const EMPTY: VehicleGarageSnapshot = {
  vehicles: [],
  vehiclePrefs: normalizeVehicleGaragePrefs(null),
  available: false,
};

async function fetchLegacyHouseholdVehicle(householdId: string): Promise<Vehicle[]> {
  try {
    const rows = await prisma.$queryRaw<
      {
        householdId: string;
        name: string;
        lastServiceOdometerKm: number;
        serviceIntervalKm: number;
        currentOdometerKm: number | null;
        serviceAlertsShown: unknown;
        updatedAt: Date;
      }[]
    >`
      SELECT *
      FROM "HouseholdVehicle"
      WHERE "householdId" = ${householdId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return [];
    const v = normalizeVehicle({
      id: `legacy-${row.householdId}`,
      name: row.name,
      lastServiceOdometerKm: row.lastServiceOdometerKm,
      serviceIntervalKm: row.serviceIntervalKm,
      currentOdometerKm: row.currentOdometerKm,
      serviceAlertsShown:
        row.serviceAlertsShown && typeof row.serviceAlertsShown === "object"
          ? (row.serviceAlertsShown as Vehicle["serviceAlertsShown"])
          : {},
      updatedAt: row.updatedAt.toISOString(),
    });
    return v ? [v] : [];
  } catch {
    return [];
  }
}

export async function fetchVehicleGarageForHousehold(
  householdId: string,
): Promise<VehicleGarageSnapshot> {
  const caps = await getHouseholdDbCapabilities();
  if (!caps.vehicleGarage) {
    const legacy = await fetchLegacyHouseholdVehicle(householdId);
    if (legacy.length > 0) {
      return {
        vehicles: legacy,
        vehiclePrefs: normalizeVehicleGaragePrefs(null),
        available: false,
      };
    }
    return EMPTY;
  }

  try {
    const household = await prisma.household.findUnique({
      where: { id: householdId },
      select: {
        vehicleGarageMode: true,
        vehicleMemberPrefs: true,
        vehicles: { orderBy: { name: "asc" } },
      },
    });
    if (!household) return { ...EMPTY, available: true };

    return {
      vehicles: household.vehicles.map(dbVehicleToApp),
      vehiclePrefs: memberPrefsFromDb(
        household.vehicleGarageMode,
        household.vehicleMemberPrefs,
      ),
      available: true,
    };
  } catch (err) {
    if (!isMissingDbObject(err)) throw err;
    console.warn("[household] Vehicle garage unavailable — optional SQL not applied");
    const legacy = await fetchLegacyHouseholdVehicle(householdId);
    return legacy.length > 0
      ? { vehicles: legacy, vehiclePrefs: normalizeVehicleGaragePrefs(null), available: false }
      : EMPTY;
  }
}

export async function saveVehicleGarage(
  householdId: string,
  vehicles: Vehicle[],
  vehiclePrefs: VehicleGaragePrefs,
): Promise<VehicleGarageSnapshot> {
  const caps = await getHouseholdDbCapabilities();
  if (!caps.vehicleGarage) {
    throw new VehicleGarageDbNotConfiguredError();
  }

  const normalized = normalizeVehicles(vehicles);
  const prefs = normalizeVehicleGaragePrefs(vehiclePrefs);

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.vehicle.findMany({
        where: { householdId },
        select: { id: true },
      });
      const keep = new Set(normalized.map((v) => v.id));
      const toDelete = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
      if (toDelete.length > 0) {
        if (caps.txVehicleId) {
          await tx.transaction.updateMany({
            where: { householdId, vehicleId: { in: toDelete } },
            data: { vehicleId: null },
          });
        }
        await tx.vehicle.deleteMany({ where: { id: { in: toDelete } } });
      }

      for (const v of normalized) {
        const data = appVehicleToDb(householdId, v);
        await tx.vehicle.upsert({
          where: { id: v.id },
          create: data,
          update: {
            name: data.name,
            lastServiceOdometerKm: data.lastServiceOdometerKm,
            serviceIntervalKm: data.serviceIntervalKm,
            currentOdometerKm: data.currentOdometerKm,
            serviceAlertsShown: data.serviceAlertsShown,
          },
        });
      }

      await tx.household.update({
        where: { id: householdId },
        data: {
          vehicleGarageMode: garageModeToDb(prefs.mode) as VehicleGarageMode,
          vehicleMemberPrefs: memberPrefsToDb(prefs),
        },
      });
    });
  } catch (err) {
    if (isMissingDbObject(err)) throw new VehicleGarageDbNotConfiguredError();
    throw err;
  }

  const saved = await fetchVehicleGarageForHousehold(householdId);
  return { ...saved, available: true };
}

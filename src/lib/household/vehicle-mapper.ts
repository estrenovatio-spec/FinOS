import type { Vehicle as DbVehicle, VehicleGarageMode } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { normalizeVehicle, normalizeVehicleGaragePrefs } from "@/lib/vehicle";
import type { Vehicle, VehicleGaragePrefs } from "@/types/vehicle";

export function dbVehicleToApp(row: DbVehicle): Vehicle {
  return (
    normalizeVehicle({
      id: row.id,
      name: row.name,
      lastServiceOdometerKm: row.lastServiceOdometerKm,
      serviceIntervalKm: row.serviceIntervalKm,
      currentOdometerKm: row.currentOdometerKm,
      serviceAlertsShown:
        row.serviceAlertsShown && typeof row.serviceAlertsShown === "object"
          ? (row.serviceAlertsShown as Vehicle["serviceAlertsShown"])
          : {},
      updatedAt: row.updatedAt.toISOString(),
    }) ?? {
      id: row.id,
      name: row.name,
      lastServiceOdometerKm: row.lastServiceOdometerKm,
      serviceIntervalKm: row.serviceIntervalKm,
      currentOdometerKm: row.currentOdometerKm,
      serviceAlertsShown: {},
    }
  );
}

export function appVehicleToDb(
  householdId: string,
  vehicle: Vehicle,
): Prisma.VehicleUncheckedCreateInput {
  return {
    id: vehicle.id,
    householdId,
    name: vehicle.name.trim() || "Авто",
    lastServiceOdometerKm: Math.max(0, Math.round(vehicle.lastServiceOdometerKm)),
    serviceIntervalKm: Math.max(500, Math.round(vehicle.serviceIntervalKm)),
    currentOdometerKm:
      vehicle.currentOdometerKm != null
        ? Math.max(0, Math.round(vehicle.currentOdometerKm))
        : null,
    serviceAlertsShown: (vehicle.serviceAlertsShown ?? {}) as Prisma.InputJsonValue,
  };
}

export function garageModeToDb(mode: VehicleGaragePrefs["mode"]): VehicleGarageMode {
  return mode === "split" ? "split" : "both";
}

export function garageModeFromDb(mode: VehicleGarageMode): VehicleGaragePrefs["mode"] {
  return mode === "split" ? "split" : "both";
}

export function memberPrefsToDb(prefs: VehicleGaragePrefs): Prisma.InputJsonValue {
  return {
    ...prefs.members,
    __fuelTrackingEnabled: prefs.fuelTrackingEnabled !== false,
  } as unknown as Prisma.InputJsonValue;
}

export function memberPrefsFromDb(
  mode: VehicleGarageMode,
  raw: unknown,
): VehicleGaragePrefs {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const { __fuelTrackingEnabled, ...members } = obj;
  return normalizeVehicleGaragePrefs({
    mode: garageModeFromDb(mode),
    members,
    fuelTrackingEnabled: __fuelTrackingEnabled,
  });
}

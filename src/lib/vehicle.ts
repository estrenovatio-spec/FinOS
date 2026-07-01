import type { Transaction } from "@/types";
import type {
  ServiceAlertLevel,
  Vehicle,
  VehicleGarageMode,
  VehicleGaragePrefs,
  VehicleMemberPref,
  VehicleServiceAlert,
} from "@/types/vehicle";

const FUEL_NOTE =
  /бензин|заправк|азс|топлив|дизел|пропан|электрозаряд|fuel|gas station|petrol|diesel/i;
const SERVICE_NOTE =
  /техобслуж|техобслуживание|ремонт авто|шиномонтаж|замена масла|автосервис|\bсто\b|то авто|car service|oil change/i;

export const MAX_VEHICLES_PER_HOUSEHOLD = 8;

export function makeVehicleId(): string {
  return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function defaultVehicle(name = "Авто 1"): Vehicle {
  return {
    id: makeVehicleId(),
    name,
    lastServiceOdometerKm: 0,
    serviceIntervalKm: 10_000,
    currentOdometerKm: null,
    serviceAlertsShown: {},
  };
}

export function normalizeVehicle(raw: Partial<Vehicle> | null | undefined): Vehicle | null {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id ?? "").trim() || makeVehicleId();
  const name = String(raw.name ?? "").trim() || "Авто";
  return {
    id,
    name,
    lastServiceOdometerKm: Math.max(0, Math.round(Number(raw.lastServiceOdometerKm) || 0)),
    serviceIntervalKm: Math.max(500, Math.round(Number(raw.serviceIntervalKm) || 10_000)),
    currentOdometerKm:
      raw.currentOdometerKm != null && Number.isFinite(Number(raw.currentOdometerKm))
        ? Math.max(0, Math.round(Number(raw.currentOdometerKm)))
        : null,
    serviceAlertsShown:
      raw.serviceAlertsShown && typeof raw.serviceAlertsShown === "object"
        ? { ...raw.serviceAlertsShown }
        : {},
    updatedAt: raw.updatedAt,
  };
}

export function normalizeVehicles(raw: unknown): Vehicle[] {
  if (!Array.isArray(raw)) return [];
  const out: Vehicle[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const v = normalizeVehicle(item as Partial<Vehicle>);
    if (!v || seen.has(v.id)) continue;
    seen.add(v.id);
    out.push(v);
    if (out.length >= MAX_VEHICLES_PER_HOUSEHOLD) break;
  }
  return out;
}

export function defaultVehicleGaragePrefs(): VehicleGaragePrefs {
  return { mode: "both", members: {}, fuelTrackingEnabled: true };
}

export function normalizeVehicleGaragePrefs(raw: unknown): VehicleGaragePrefs {
  if (!raw || typeof raw !== "object") return defaultVehicleGaragePrefs();
  const obj = raw as Record<string, unknown>;
  const mode: VehicleGarageMode = obj.mode === "split" ? "split" : "both";
  const members: Record<string, VehicleMemberPref> = {};
  if (obj.members && typeof obj.members === "object") {
    for (const [userId, pref] of Object.entries(obj.members as Record<string, unknown>)) {
      if (!pref || typeof pref !== "object") continue;
      const p = pref as Record<string, unknown>;
      members[userId] = {
        defaultVehicleId:
          typeof p.defaultVehicleId === "string" && p.defaultVehicleId.trim()
            ? p.defaultVehicleId.trim()
            : null,
        rarelyUsePartnerVehicles: Boolean(p.rarelyUsePartnerVehicles),
      };
    }
  }
  return {
    mode,
    members,
    fuelTrackingEnabled: obj.fuelTrackingEnabled !== false,
  };
}

export function isFuelExpense(
  tx: Pick<Transaction, "type" | "categoryId" | "note">,
): boolean {
  if (tx.type !== "expense" || tx.categoryId !== "transport") return false;
  const note = tx.note.trim();
  if (!note) return false;
  return FUEL_NOTE.test(note);
}

export function isVehicleServiceExpense(
  tx: Pick<Transaction, "type" | "categoryId" | "note">,
): boolean {
  if (tx.type !== "expense" || tx.categoryId !== "transport") return false;
  const note = tx.note.trim();
  if (!note) return false;
  return SERVICE_NOTE.test(note);
}

export function needsVehicleOdometerFlow(
  tx: Pick<Transaction, "type" | "categoryId" | "note">,
  vehicles: readonly Vehicle[],
  prefs: VehicleGaragePrefs = defaultVehicleGaragePrefs(),
): boolean {
  if (vehicles.length === 0) return false;
  if (isVehicleServiceExpense(tx)) return true;
  return prefs.fuelTrackingEnabled !== false && isFuelExpense(tx);
}

export function nextServiceOdometerKm(vehicle: Vehicle): number {
  return vehicle.lastServiceOdometerKm + vehicle.serviceIntervalKm;
}

export function kmUntilService(vehicle: Vehicle): number {
  const current = vehicle.currentOdometerKm ?? vehicle.lastServiceOdometerKm;
  return Math.max(0, nextServiceOdometerKm(vehicle) - current);
}

export function activeServiceAlert(vehicle: Vehicle): ServiceAlertLevel | null {
  const remaining = kmUntilService(vehicle);
  const shown = vehicle.serviceAlertsShown ?? {};
  if (remaining <= 0 && !shown["0"]) return 0;
  if (remaining <= 500 && !shown["500"]) return 500;
  if (remaining <= 1000 && !shown["1000"]) return 1000;
  return null;
}

export function collectServiceAlerts(vehicles: readonly Vehicle[]): VehicleServiceAlert[] {
  const out: VehicleServiceAlert[] = [];
  for (const v of vehicles) {
    const level = activeServiceAlert(v);
    if (level == null) continue;
    out.push({
      vehicleId: v.id,
      vehicleName: v.name,
      level,
      kmUntil: kmUntilService(v),
    });
  }
  return out;
}

export function markServiceAlertShown(
  vehicles: Vehicle[],
  vehicleId: string,
  level: ServiceAlertLevel,
): Vehicle[] {
  return vehicles.map((v) =>
    v.id !== vehicleId
      ? v
      : {
          ...v,
          serviceAlertsShown: {
            ...v.serviceAlertsShown,
            [String(level) as "1000" | "500" | "0"]: true,
          },
          updatedAt: new Date().toISOString(),
        },
  );
}

export function applyFuelOdometer(vehicle: Vehicle, odometerKm: number): Vehicle {
  const km = Math.max(0, Math.round(odometerKm));
  return {
    ...vehicle,
    currentOdometerKm: km,
    updatedAt: new Date().toISOString(),
  };
}

export function applyVehicleService(vehicle: Vehicle, odometerKm: number): Vehicle {
  const km = Math.max(0, Math.round(odometerKm));
  return {
    ...vehicle,
    lastServiceOdometerKm: km,
    currentOdometerKm: km,
    serviceAlertsShown: {},
    updatedAt: new Date().toISOString(),
  };
}

export function updateVehicleInList(
  vehicles: Vehicle[],
  vehicleId: string,
  patch: Partial<Vehicle>,
): Vehicle[] {
  return vehicles.map((v) =>
    v.id === vehicleId
      ? {
          ...v,
          ...patch,
          id: v.id,
          updatedAt: new Date().toISOString(),
        }
      : v,
  );
}

export function mergeVehicles(local: Vehicle[], remote: Vehicle[]): Vehicle[] {
  const map = new Map<string, Vehicle>();
  for (const v of remote) map.set(v.id, v);
  for (const v of local) {
    const existing = map.get(v.id);
    if (!existing) {
      map.set(v.id, v);
      continue;
    }
    const rt = existing.updatedAt ? Date.parse(existing.updatedAt) : 0;
    const lt = v.updatedAt ? Date.parse(v.updatedAt) : 0;
    if (lt >= rt) map.set(v.id, v);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function mergeVehicleGaragePrefs(
  local: VehicleGaragePrefs,
  remote: VehicleGaragePrefs,
): VehicleGaragePrefs {
  return {
    mode: remote.mode ?? local.mode,
    members: { ...local.members, ...remote.members },
    fuelTrackingEnabled: remote.fuelTrackingEnabled ?? local.fuelTrackingEnabled ?? true,
  };
}

/** Машина по умолчанию в форме заправки (не влияет на ТО-уведомления). */
export function guessDefaultVehicleId(
  vehicles: readonly Vehicle[],
  prefs: VehicleGaragePrefs,
  viewerUserId: string | null,
  partnerVehicleIds: readonly string[],
  lastUsedVehicleId: string | null,
): string | null {
  if (vehicles.length === 0) return null;
  if (vehicles.length === 1) return vehicles[0]!.id;

  const member = viewerUserId ? prefs.members[viewerUserId] : undefined;
  if (member?.rarelyUsePartnerVehicles && prefs.mode === "split") {
    const own =
      member.defaultVehicleId && vehicles.some((v) => v.id === member.defaultVehicleId)
        ? member.defaultVehicleId
        : vehicles.find((v) => !partnerVehicleIds.includes(v.id))?.id;
    if (own) return own;
  }

  if (prefs.mode === "split" && member?.defaultVehicleId) {
    if (vehicles.some((v) => v.id === member.defaultVehicleId)) {
      return member.defaultVehicleId;
    }
  }

  if (
    lastUsedVehicleId &&
    vehicles.some((v) => v.id === lastUsedVehicleId)
  ) {
    return lastUsedVehicleId;
  }

  return vehicles[0]!.id;
}

export function getMemberPref(
  prefs: VehicleGaragePrefs,
  userId: string | null,
): VehicleMemberPref {
  if (!userId) {
    return { defaultVehicleId: null, rarelyUsePartnerVehicles: false };
  }
  return (
    prefs.members[userId] ?? {
      defaultVehicleId: null,
      rarelyUsePartnerVehicles: false,
    }
  );
}

export function setMemberPref(
  prefs: VehicleGaragePrefs,
  userId: string,
  patch: Partial<VehicleMemberPref>,
): VehicleGaragePrefs {
  const prev = getMemberPref(prefs, userId);
  return {
    ...prefs,
    members: {
      ...prefs.members,
      [userId]: { ...prev, ...patch },
    },
  };
}

export function garageHasVehicles(vehicles: readonly Vehicle[] | null | undefined): boolean {
  return Array.isArray(vehicles) && vehicles.length > 0;
}

/** @deprecated use garageHasVehicles */
export function vehicleConfigured(
  vehicles: readonly Vehicle[] | null | undefined,
): boolean {
  return garageHasVehicles(vehicles);
}

/** Машины, у которых «основная» у партнёра (для rarelyUsePartnerVehicles). */
export function partnerDefaultVehicleIds(
  prefs: VehicleGaragePrefs,
  viewerUserId: string | null,
): string[] {
  const ids: string[] = [];
  for (const [uid, member] of Object.entries(prefs.members)) {
    if (!viewerUserId || uid === viewerUserId || !member.defaultVehicleId) continue;
    ids.push(member.defaultVehicleId);
  }
  return ids;
}

export function resolveRemoteGarage(
  remote: {
    vehicles?: unknown;
    vehicle?: Partial<Vehicle> | null;
    vehiclePrefs?: unknown;
  },
  localVehicles: Vehicle[],
  localPrefs: VehicleGaragePrefs,
): { vehicles: Vehicle[]; vehiclePrefs: VehicleGaragePrefs } {
  const fromList = normalizeVehicles(remote.vehicles);
  const legacyOne = normalizeVehicle(remote.vehicle ?? null);
  const remoteList = fromList.length > 0 ? fromList : legacyOne ? [legacyOne] : [];
  return {
    vehicles: mergeVehicles(localVehicles, remoteList),
    vehiclePrefs: mergeVehicleGaragePrefs(
      localPrefs,
      normalizeVehicleGaragePrefs(remote.vehiclePrefs ?? null),
    ),
  };
}

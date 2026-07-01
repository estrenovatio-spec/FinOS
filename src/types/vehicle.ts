/** Один автомобиль в семейном гараже (синхронизируется в облаке). */
export interface Vehicle {
  id: string;
  name: string;
  lastServiceOdometerKm: number;
  serviceIntervalKm: number;
  currentOdometerKm: number | null;
  serviceAlertsShown: Partial<Record<"1000" | "500" | "0", boolean>>;
  updatedAt?: string;
}

/** both — оба ездят на обеих; split — у каждого своя основная, в операции можно сменить */
export type VehicleGarageMode = "both" | "split";

export interface VehicleMemberPref {
  defaultVehicleId: string | null;
  /** Не подставлять машину партнёра по умолчанию (ТО-уведомления всё равно для всех) */
  rarelyUsePartnerVehicles: boolean;
}

export interface VehicleGaragePrefs {
  mode: VehicleGarageMode;
  members: Record<string, VehicleMemberPref>;
  fuelTrackingEnabled: boolean;
}

export type OdometerPromptKind = "fuel" | "service";

export interface PendingOdometerPrompt {
  transactionId: string;
  kind: OdometerPromptKind;
  vehicleId: string;
}

export type ServiceAlertLevel = 1000 | 500 | 0;

export interface VehicleServiceAlert {
  vehicleId: string;
  vehicleName: string;
  level: ServiceAlertLevel;
  kmUntil: number;
}

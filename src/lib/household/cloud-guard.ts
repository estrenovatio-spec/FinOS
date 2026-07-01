import { envTruthy } from "@/lib/payments/env-flags";

/** Server-side leave (removes HouseholdMember). Off by default — protects family cloud. */
export function isHouseholdLeaveAllowed(): boolean {
  return envTruthy("HOUSEHOLD_CLOUD_ALLOW_LEAVE");
}

export function assertHouseholdLeaveAllowed(): void {
  if (!isHouseholdLeaveAllowed()) {
    throw new Error("household_leave_forbidden");
  }
}

/** Full DB wipe via /api/admin/wipe-cloud. Requires explicit env + dedicated secret. */
export function isCloudWipeEnabled(): boolean {
  return envTruthy("CLOUD_WIPE_ENABLED");
}

export function assertCloudWipeEnabled(): void {
  if (!isCloudWipeEnabled()) {
    throw new Error("cloud_wipe_disabled");
  }
}

export const CLOUD_WIPE_CONFIRM_HEADER = "x-cloud-wipe-confirm";
export const CLOUD_WIPE_CONFIRM_VALUE = "DELETE_ALL_HOUSEHOLDS";

import { Prisma } from "@prisma/client";

const DB_ERROR_CODES = new Set(["P1000", "P1001", "P1002", "P1017", "P2021"]);

export function mapHouseholdApiError(error: unknown): { code: string; status: number } {
  if (error instanceof Prisma.PrismaClientKnownRequestError && DB_ERROR_CODES.has(error.code)) {
    return { code: "db_unavailable", status: 503 };
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return { code: "db_unavailable", status: 503 };
  }
  const msg = error instanceof Error ? error.message : String(error);
  if (/does not exist|Can't reach database|ECONNREFUSED|connection/i.test(msg)) {
    return { code: "db_unavailable", status: 503 };
  }
  if (error instanceof Error) {
    if (error.message === "already_in_household") {
      return { code: "already_in_household", status: 409 };
    }
    if (error.message === "household_not_found") {
      return { code: "household_not_found", status: 404 };
    }
    if (error.message === "invalid_code") {
      return { code: "invalid_code", status: 400 };
    }
    if (error.message === "subscription_required") {
      return { code: "subscription_required", status: 402 };
    }
    if (error.message === "household_leave_forbidden") {
      return { code: "household_leave_forbidden", status: 403 };
    }
    if (error.message === "cloud_wipe_disabled") {
      return { code: "cloud_wipe_disabled", status: 403 };
    }
  }
  return { code: "household_create_failed", status: 500 };
}

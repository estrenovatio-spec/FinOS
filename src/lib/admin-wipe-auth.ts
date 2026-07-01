import type { NextRequest } from "next/server";
import {
  assertCloudWipeEnabled,
  CLOUD_WIPE_CONFIRM_HEADER,
  CLOUD_WIPE_CONFIRM_VALUE,
} from "@/lib/household/cloud-guard";
import { getBearerToken } from "@/lib/admin-auth";

/** Wipe uses only CLOUD_WIPE_SECRET — never the session signing secret. */
export function getCloudWipeSecret(): string | null {
  const secret = process.env.CLOUD_WIPE_SECRET?.trim();
  return secret || null;
}

export function isCloudWipeAuthorized(req: NextRequest): boolean {
  try {
    assertCloudWipeEnabled();
  } catch {
    return false;
  }

  const secret = getCloudWipeSecret();
  if (!secret) return false;

  const token = getBearerToken(req);
  if (!token || token !== secret) return false;

  const confirm = req.headers.get(CLOUD_WIPE_CONFIRM_HEADER)?.trim();
  return confirm === CLOUD_WIPE_CONFIRM_VALUE;
}

import type { NextRequest } from "next/server";
import { getHouseholdSessionCookie } from "@/lib/auth/session-cookie";
import { verifyHouseholdSession } from "@/lib/household/token";

export function getBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}

export function requireSession(req: NextRequest) {
  const token = getBearerToken(req) ?? getHouseholdSessionCookie(req);
  if (!token) return null;
  return verifyHouseholdSession(token);
}

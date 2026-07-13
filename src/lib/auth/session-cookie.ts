import type { NextRequest, NextResponse } from "next/server";

export const HOUSEHOLD_SESSION_COOKIE = "finos_household_session";

function secureCookie(): boolean {
  return process.env.NODE_ENV === "production";
}

export function getHouseholdSessionCookie(req: NextRequest): string | null {
  return req.cookies.get(HOUSEHOLD_SESSION_COOKIE)?.value?.trim() || null;
}

export function setHouseholdSessionCookie(
  res: NextResponse,
  token: string,
): void {
  res.cookies.set(HOUSEHOLD_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearHouseholdSessionCookie(res: NextResponse): void {
  res.cookies.set(HOUSEHOLD_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

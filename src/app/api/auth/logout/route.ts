import { NextResponse } from "next/server";
import { clearHouseholdSessionCookie } from "@/lib/auth/session-cookie";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearHouseholdSessionCookie(response);
  return response;
}

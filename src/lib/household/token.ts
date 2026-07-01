import { createHmac, timingSafeEqual } from "crypto";

export interface HouseholdSessionPayload {
  userId: string;
  householdId: string;
  exp: number;
}

function secret(): string {
  const key =
    process.env.HOUSEHOLD_SESSION_SECRET?.trim() ||
    process.env.RATE_LIMIT_SECRET?.trim() ||
    "dev-household-secret-change-me";
  return key;
}

function b64url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(input: string): string {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString("utf8");
}

export function signHouseholdSession(payload: Omit<HouseholdSessionPayload, "exp">): string {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  const body = b64url(JSON.stringify({ ...payload, exp }));
  const sig = createHmac("sha256", secret()).update(body).digest("hex");
  return `${body}.${sig}`;
}

export function verifyHouseholdSession(token: string): HouseholdSessionPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = createHmac("sha256", secret()).update(body).digest("hex");
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(sig, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(fromB64url(body)) as HouseholdSessionPayload;
    if (!payload.userId || !payload.householdId || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

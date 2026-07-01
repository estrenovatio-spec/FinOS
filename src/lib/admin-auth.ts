import type { NextRequest } from "next/server";

/** Все админ-секреты из env (без дублей). Любой подходит для Bearer. */
export function listAdminSecrets(): string[] {
  const raw = [
    process.env.HOUSEHOLD_SESSION_SECRET,
    process.env.CLOUD_WIPE_SECRET,
    process.env.RATE_LIMIT_SECRET,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of raw) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function getBearerToken(req: NextRequest): string {
  const header = req.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export function isAdminAuthorized(req: NextRequest): boolean {
  const token = getBearerToken(req);
  if (!token) return false;
  return listAdminSecrets().includes(token);
}

export function requireAdminSecrets(): string[] | null {
  const secrets = listAdminSecrets();
  return secrets.length > 0 ? secrets : null;
}

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

/** Supabase pooler (:6543) needs pgbouncer=true for Prisma on serverless. */
export function resolveDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL?.trim();
  if (!url || url === '""' || url === "''") return undefined;
  try {
    const parsed = new URL(url);
    if (
      (url.includes("pooler.supabase.com") || url.includes(":6543")) &&
      !parsed.searchParams.has("pgbouncer")
    ) {
      parsed.searchParams.set("pgbouncer", "true");
    }
    if (!parsed.searchParams.has("connection_limit")) {
      parsed.searchParams.set("connection_limit", "1");
    }
    if (!parsed.searchParams.has("pool_timeout")) {
      parsed.searchParams.set("pool_timeout", "10");
    }
    return parsed.toString();
  } catch {
    if (
      (url.includes("pooler.supabase.com") || url.includes(":6543")) &&
      !url.includes("pgbouncer=true")
    ) {
      return url.includes("?") ? `${url}&pgbouncer=true&connection_limit=1&pool_timeout=10` : `${url}?pgbouncer=true&connection_limit=1&pool_timeout=10`;
    }
    if (!url.includes("connection_limit=")) {
      return url.includes("?") ? `${url}&connection_limit=1&pool_timeout=10` : `${url}?connection_limit=1&pool_timeout=10`;
    }
  }
  return url;
}

const databaseUrl = resolveDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export function isDatabaseConfigured(): boolean {
  const url = resolveDatabaseUrl();
  if (!url) return false;
  return /^postgres(ql)?:\/\//i.test(url);
}

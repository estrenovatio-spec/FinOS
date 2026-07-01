import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";

const WEB_LOGIN_TTL_MS = 5 * 60 * 1000;

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createWebLoginToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await prisma.webLoginToken.create({
    data: {
      userId,
      tokenHash: tokenHash(token),
      expiresAt: new Date(now.getTime() + WEB_LOGIN_TTL_MS),
    },
  });
  await prisma.webLoginToken.deleteMany({
    where: {
      userId,
      expiresAt: { lt: now },
    },
  });
  return token;
}

export async function consumeWebLoginToken(token: string): Promise<string | null> {
  const hash = tokenHash(token.trim());
  const now = new Date();
  const row = await prisma.webLoginToken.findUnique({
    where: { tokenHash: hash },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });
  if (!row || row.usedAt || row.expiresAt.getTime() < now.getTime()) return null;

  const updated = await prisma.webLoginToken.updateMany({
    where: {
      id: row.id,
      usedAt: null,
      expiresAt: { gt: now },
    },
    data: { usedAt: now },
  });
  return updated.count === 1 ? row.userId : null;
}

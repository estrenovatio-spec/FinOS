-- Одноразовые ссылки входа на компьютере из Telegram-бота.
-- Выполнить один раз в Supabase / Neon SQL Editor или через prisma db push.

CREATE TABLE IF NOT EXISTS "WebLoginToken" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebLoginToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "WebLoginToken_userId_idx" ON "WebLoginToken"("userId");
CREATE INDEX IF NOT EXISTS "WebLoginToken_expiresAt_idx" ON "WebLoginToken"("expiresAt");

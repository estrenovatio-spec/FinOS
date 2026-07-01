-- Личный бизнес-контур (не делится с партнёром в семье)
CREATE TABLE IF NOT EXISTS "UserBusinessLedger" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "UserBusinessLedger"
  ADD CONSTRAINT "UserBusinessLedger_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

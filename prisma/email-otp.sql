-- Email OTP support for web/email cloud login.
-- Project currently uses manual SQL migrations instead of prisma/migrations history.
-- Safe for existing Telegram users: keeps ids unchanged, makes telegramId nullable,
-- adds optional email fields, and creates EmailOtp only if it is missing.

ALTER TABLE "User"
  ALTER COLUMN "telegramId" DROP NOT NULL;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

CREATE TABLE IF NOT EXISTS "EmailOtp" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT,
  "email" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "requestedIpHash" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailOtp_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "EmailOtp_email_createdAt_idx"
  ON "EmailOtp"("email", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "EmailOtp_expiresAt_idx"
  ON "EmailOtp"("expiresAt");

CREATE INDEX IF NOT EXISTS "EmailOtp_requestedIpHash_createdAt_idx"
  ON "EmailOtp"("requestedIpHash", "createdAt" DESC);

-- Реферальная программа (код пользователя + связь пригласивший → приглашённый)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referredByUserId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_referralCode_key" ON "User"("referralCode");

DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_referredByUserId_fkey"
    FOREIGN KEY ("referredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Referral" (
    "id" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "referrerBonusDays" INTEGER NOT NULL,
    "referredBonusDays" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Referral_referredUserId_key" ON "Referral"("referredUserId");
CREATE INDEX IF NOT EXISTS "Referral_referrerUserId_idx" ON "Referral"("referrerUserId");

DO $$ BEGIN
  ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerUserId_fkey"
    FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredUserId_fkey"
    FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

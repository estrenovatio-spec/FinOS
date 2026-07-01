-- Реферал: pending → rewarded (опционально по дням учёта; по умолчанию — после оплаты подписки)
-- Безопасно запускать повторно (если тип уже есть — пропустит).

DO $$ BEGIN
  CREATE TYPE "ReferralStatus" AS ENUM ('pending', 'rewarded');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "status" "ReferralStatus" NOT NULL DEFAULT 'pending';
ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "rewardedAt" TIMESTAMP(3);

UPDATE "Referral"
SET "status" = 'rewarded', "rewardedAt" = COALESCE("rewardedAt", "createdAt")
WHERE "status" = 'pending' AND "rewardedAt" IS NULL;

CREATE TABLE IF NOT EXISTS "ReferralActivityDay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activityDate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralActivityDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReferralActivityDay_userId_activityDate_key"
  ON "ReferralActivityDay"("userId", "activityDate");
CREATE INDEX IF NOT EXISTS "ReferralActivityDay_userId_idx" ON "ReferralActivityDay"("userId");

DO $$ BEGIN
  ALTER TABLE "ReferralActivityDay" ADD CONSTRAINT "ReferralActivityDay_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

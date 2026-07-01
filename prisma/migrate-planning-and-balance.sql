-- Supabase → SQL Editor → Run (можно повторять)

ALTER TABLE "SavingsGoal" ADD COLUMN IF NOT EXISTS "monthlyContribution" DOUBLE PRECISION;
ALTER TABLE "SavingsGoal" ADD COLUMN IF NOT EXISTS "kind" TEXT;
ALTER TABLE "SavingsGoal" ADD COLUMN IF NOT EXISTS "emergencyMonths" INTEGER;

ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "goalId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "goalAmount" DOUBLE PRECISION;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "confirmed" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "recurringId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;

ALTER TABLE "RecurringTransaction" ADD COLUMN IF NOT EXISTS "skippedDates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Household" ADD COLUMN IF NOT EXISTS "balanceOffsets" JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Авто / гараж — только опционально: prisma/vehicle-garage-v2.sql (не трогает другие БД)

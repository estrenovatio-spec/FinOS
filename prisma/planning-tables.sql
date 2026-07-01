-- Planning features (idempotent — можно запускать повторно)
DO $$ BEGIN
  CREATE TYPE "SavingsGoalKind" AS ENUM ('custom', 'emergency');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RecurringFrequency" AS ENUM ('weekly', 'monthly', 'yearly');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SavingsGoal" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetAmount" DOUBLE PRECISION NOT NULL,
    "savedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deadline" TEXT,
    "monthlyContribution" DOUBLE PRECISION,
    "kind" "SavingsGoalKind" NOT NULL DEFAULT 'custom',
    "emergencyMonths" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CategoryBudget" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "monthlyLimit" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CategoryBudget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RecurringTransaction" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" "TxType" NOT NULL,
    "categoryId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "owner" TEXT NOT NULL DEFAULT 'me',
    "frequency" "RecurringFrequency" NOT NULL,
    "intervalMonths" INTEGER,
    "dayOfMonth" INTEGER,
    "nextRunDate" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "skippedDates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecurringTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SavingsGoal_householdId_id_key" ON "SavingsGoal"("householdId", "id");
CREATE INDEX IF NOT EXISTS "SavingsGoal_householdId_idx" ON "SavingsGoal"("householdId");

CREATE UNIQUE INDEX IF NOT EXISTS "CategoryBudget_householdId_categoryId_key" ON "CategoryBudget"("householdId", "categoryId");
CREATE INDEX IF NOT EXISTS "CategoryBudget_householdId_idx" ON "CategoryBudget"("householdId");

CREATE INDEX IF NOT EXISTS "RecurringTransaction_householdId_idx" ON "RecurringTransaction"("householdId");

DO $$ BEGIN
  ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_householdId_fkey"
    FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CategoryBudget" ADD CONSTRAINT "CategoryBudget_householdId_fkey"
    FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "SavingsGoal" ADD COLUMN IF NOT EXISTS "monthlyContribution" DOUBLE PRECISION;
ALTER TABLE "Household" ADD COLUMN IF NOT EXISTS "balanceOffsets" JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "RecurringTransaction" ADD COLUMN IF NOT EXISTS "intervalMonths" INTEGER;

ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "goalId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "goalAmount" DOUBLE PRECISION;

DO $$ BEGIN
  ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_householdId_fkey"
    FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

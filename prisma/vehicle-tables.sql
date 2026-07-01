-- Авто: пробег, ТО, уведомления (Supabase SQL Editor)

ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "odometerKm" INTEGER;

CREATE TABLE IF NOT EXISTS "HouseholdVehicle" (
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Авто',
    "lastServiceOdometerKm" INTEGER NOT NULL DEFAULT 0,
    "serviceIntervalKm" INTEGER NOT NULL DEFAULT 10000,
    "currentOdometerKm" INTEGER,
    "serviceAlertsShown" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HouseholdVehicle_pkey" PRIMARY KEY ("householdId")
);

DO $$ BEGIN
  ALTER TABLE "HouseholdVehicle" ADD CONSTRAINT "HouseholdVehicle_householdId_fkey"
    FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

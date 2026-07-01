-- ОПЦИОНАЛЬНО: гараж (2+ машин). Запускать только на БД, где нужен гараж.
-- Основное приложение (операции, баланс, копилки) — migrate-planning-and-balance.sql
-- См. prisma/MIGRATIONS.md

ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "vehicleId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "fuelLiters" DOUBLE PRECISION;

CREATE TYPE "VehicleGarageMode" AS ENUM ('both', 'split');

ALTER TABLE "Household" ADD COLUMN IF NOT EXISTS "vehicleGarageMode" "VehicleGarageMode" NOT NULL DEFAULT 'both';
ALTER TABLE "Household" ADD COLUMN IF NOT EXISTS "vehicleMemberPrefs" JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS "Vehicle" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lastServiceOdometerKm" INTEGER NOT NULL DEFAULT 0,
    "serviceIntervalKm" INTEGER NOT NULL DEFAULT 10000,
    "currentOdometerKm" INTEGER,
    "serviceAlertsShown" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Vehicle_householdId_idx" ON "Vehicle"("householdId");

DO $$ BEGIN
  ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_householdId_fkey"
    FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Миграция с одной машины HouseholdVehicle → Vehicle
INSERT INTO "Vehicle" (
    "id",
    "householdId",
    "name",
    "lastServiceOdometerKm",
    "serviceIntervalKm",
    "currentOdometerKm",
    "serviceAlertsShown",
    "createdAt",
    "updatedAt"
)
SELECT
    'v-' || substr(md5(hv."householdId"), 1, 12),
    hv."householdId",
    hv."name",
    hv."lastServiceOdometerKm",
    hv."serviceIntervalKm",
    hv."currentOdometerKm",
    hv."serviceAlertsShown",
    hv."createdAt",
    hv."updatedAt"
FROM "HouseholdVehicle" hv
WHERE NOT EXISTS (
    SELECT 1 FROM "Vehicle" v WHERE v."householdId" = hv."householdId"
);

UPDATE "Transaction" t
SET "vehicleId" = v."id"
FROM "Vehicle" v
WHERE t."householdId" = v."householdId"
  AND t."vehicleId" IS NULL
  AND t."odometerKm" IS NOT NULL
  AND t."categoryId" = 'transport';

-- DROP TABLE "HouseholdVehicle"; -- опционально, после проверки

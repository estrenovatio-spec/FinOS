import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  dbUnavailable,
  mapCloudGuardError,
  unauthorized,
} from "@/lib/api/household-response";
import { requireSession } from "@/lib/api/household-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { normalizeVehicleGaragePrefs, normalizeVehicles } from "@/lib/vehicle";
import {
  buildSyncPayload,
  saveVehicleGarageForHousehold,
  VehicleGarageDbNotConfiguredError,
} from "@/lib/household/service";

const vehicleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  lastServiceOdometerKm: z.number().finite().min(0),
  serviceIntervalKm: z.number().finite().min(500),
  currentOdometerKm: z.number().finite().min(0).nullable().optional(),
  serviceAlertsShown: z
    .object({
      "1000": z.boolean().optional(),
      "500": z.boolean().optional(),
      "0": z.boolean().optional(),
    })
    .optional(),
});

const garageSchema = z.object({
  vehicles: z.array(vehicleSchema).max(8),
  vehiclePrefs: z.object({
    mode: z.enum(["both", "split"]),
    members: z.record(
      z.string(),
      z.object({
        defaultVehicleId: z.string().nullable(),
        rarelyUsePartnerVehicles: z.boolean().optional(),
      }),
    ),
  }),
});

export async function PUT(req: NextRequest) {
  if (!isDatabaseConfigured()) return dbUnavailable();

  const session = requireSession(req);
  if (!session) return unauthorized();

  let body: z.infer<typeof garageSchema>;
  try {
    body = garageSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    await saveVehicleGarageForHousehold(
      session.userId,
      session.householdId,
      normalizeVehicles(body.vehicles),
      normalizeVehicleGaragePrefs(body.vehiclePrefs),
    );
    const sync = await buildSyncPayload(session.householdId, session.userId);
    return NextResponse.json({ ok: true, sync });
  } catch (e) {
    if (e instanceof VehicleGarageDbNotConfiguredError) {
      return NextResponse.json(
        {
          error: "vehicle_garage_not_configured",
          migrateHint: "prisma/vehicle-garage-v2.sql (опционально, только на этой БД)",
        },
        { status: 503 },
      );
    }
    const guard = mapCloudGuardError(e);
    if (guard) return guard;
    throw e;
  }
}

export async function DELETE(req: NextRequest) {
  if (!isDatabaseConfigured()) return dbUnavailable();

  const session = requireSession(req);
  if (!session) return unauthorized();

  try {
    await saveVehicleGarageForHousehold(session.userId, session.householdId, [], {
      mode: "both",
      members: {},
      fuelTrackingEnabled: true,
    });
    const sync = await buildSyncPayload(session.householdId, session.userId);
    return NextResponse.json({ ok: true, sync });
  } catch (e) {
    const guard = mapCloudGuardError(e);
    if (guard) return guard;
    throw e;
  }
}

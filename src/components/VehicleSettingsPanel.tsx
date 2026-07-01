"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fuelRubPer100Km } from "@/lib/vehicle-fuel-stats";
import { t } from "@/lib/i18n";
import { ensureCloudViewerUserId } from "@/lib/cloud/viewer-identity";
import { getMemberPref, kmUntilService, nextServiceOdometerKm } from "@/lib/vehicle";
import { SettingsAccordion } from "@/components/SettingsAccordion";
import { SettingsSection } from "@/components/SettingsSection";
import { useCloudStore } from "@/store/useCloudStore";
import { useStore } from "@/store/useStore";
import type { Vehicle, VehicleGaragePrefs } from "@/types/vehicle";

type DraftCar = {
  id: string;
  name: string;
  lastServiceKm: string;
  intervalKm: string;
  currentKm: string;
};

function toDraft(v: Vehicle): DraftCar {
  return {
    id: v.id,
    name: v.name,
    lastServiceKm: String(v.lastServiceOdometerKm),
    intervalKm: String(v.serviceIntervalKm),
    currentKm: v.currentOdometerKm != null ? String(v.currentOdometerKm) : "",
  };
}

function draftToVehicle(d: DraftCar, base?: Vehicle): Vehicle {
  const last = Math.max(0, Math.round(Number(d.lastServiceKm.replace(/\s/g, "")) || 0));
  const interval = Math.max(500, Math.round(Number(d.intervalKm.replace(/\s/g, "")) || 10_000));
  const currentRaw = d.currentKm.trim().replace(/\s/g, "");
  const current =
    currentRaw.length > 0 ? Math.max(0, Math.round(Number(currentRaw) || 0)) : null;
  return {
    id: d.id,
    name: d.name.trim() || "Авто",
    lastServiceOdometerKm: last,
    serviceIntervalKm: interval,
    currentOdometerKm: current,
    serviceAlertsShown: base?.serviceAlertsShown ?? {},
    updatedAt: new Date().toISOString(),
  };
}

export function VehicleSettingsPanel() {
  const locale = useStore((s) => s.locale);
  const vehicles = useStore((s) => s.vehicles);
  const vehiclePrefs = useStore((s) => s.vehiclePrefs);
  const transactions = useStore((s) => s.transactions);
  const addVehicle = useStore((s) => s.addVehicle);
  const removeVehicleById = useStore((s) => s.removeVehicleById);
  const saveVehicleGarage = useStore((s) => s.saveVehicleGarage);
  const setVehicleGarageMode = useStore((s) => s.setVehicleGarageMode);
  const setVehicleMemberPref = useStore((s) => s.setVehicleMemberPref);
  const cloudUserId = useCloudStore((s) => s.cloudUserId);
  const memberIds = useCloudStore((s) => s.householdMemberUserIds);
  const token = useCloudStore((s) => s.token);

  const cloudSync = Boolean(token);
  const viewerUserId = ensureCloudViewerUserId(cloudUserId ?? undefined);
  const [drafts, setDrafts] = useState<DraftCar[]>([]);
  const [prefs, setPrefs] = useState<VehicleGaragePrefs>(vehiclePrefs);
  const [garageDbHint, setGarageDbHint] = useState(false);

  useEffect(() => {
    setDrafts(vehicles.map(toDraft));
    setPrefs(vehiclePrefs);
  }, [vehicles, vehiclePrefs]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void fetch("/api/status")
      .then((r) => r.json())
      .then((data: { vehicleGarageTables?: boolean }) => {
        if (!cancelled) setGarageDbHint(!data.vehicleGarageTables);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  const fuelStats = useMemo(
    () =>
      vehicles.map((v) => ({
        id: v.id,
        stat: fuelRubPer100Km(v.id, transactions),
      })),
    [vehicles, transactions],
  );

  if (vehicles.length === 0) {
    return (
      <div className="space-y-2">
        {garageDbHint && cloudSync ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {t(locale, "vehicleGarageDbOptional")}
          </p>
        ) : null}
        <Button type="button" variant="secondary" className="w-full" onClick={() => addVehicle()}>
          {t(locale, "vehicleAdd")}
        </Button>
      </div>
    );
  }

  const saveAll = () => {
    const byId = new Map(vehicles.map((v) => [v.id, v]));
    const nextVehicles = drafts.map((d) => draftToVehicle(d, byId.get(d.id)));
    saveVehicleGarage(nextVehicles, prefs);
  };

  const myPref = getMemberPref(prefs, viewerUserId);

  return (
    <div className="space-y-3">
      {garageDbHint && cloudSync ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {t(locale, "vehicleGarageDbOptional")}
        </p>
      ) : null}

      {drafts.map((d, index) => {
        const vehicle = vehicles.find((v) => v.id === d.id);
        const remaining = vehicle ? kmUntilService(vehicle) : 0;
        const nextDue = vehicle ? nextServiceOdometerKm(vehicle) : 0;
        const fuel = fuelStats.find((f) => f.id === d.id)?.stat;
        const fuelLabel =
          prefs.fuelTrackingEnabled === false
            ? t(locale, "vehicleFuelTrackingOff")
            : fuel?.detail === "ok" && fuel.rubPer100Km != null
              ? t(locale, "vehicleFuelPer100", {
                  value: String(fuel.rubPer100Km),
                  liters: fuel.litersPer100Km != null ? String(fuel.litersPer100Km) : "—",
                })
            : t(locale, "vehicleFuelPer100Unknown");

        const carTitle = d.name.trim() || t(locale, "vehicleCarNumber", { n: String(index + 1) });

        return (
          <SettingsAccordion
            key={d.id}
            variant="nested"
            title={carTitle}
            description={fuelLabel}
          >
            <Input
              value={d.name}
              onChange={(e) =>
                setDrafts((prev) =>
                  prev.map((x) => (x.id === d.id ? { ...x, name: e.target.value } : x)),
                )
              }
              placeholder={t(locale, "vehicleNamePlaceholder")}
            />
            <label className="block text-xs text-muted-foreground">
              {t(locale, "vehicleLastServiceKm")}
            </label>
            <Input
              inputMode="numeric"
              value={d.lastServiceKm}
              onChange={(e) =>
                setDrafts((prev) =>
                  prev.map((x) => (x.id === d.id ? { ...x, lastServiceKm: e.target.value } : x)),
                )
              }
            />
            <label className="block text-xs text-muted-foreground">
              {t(locale, "vehicleIntervalKm")}
            </label>
            <Input
              inputMode="numeric"
              value={d.intervalKm}
              onChange={(e) =>
                setDrafts((prev) =>
                  prev.map((x) => (x.id === d.id ? { ...x, intervalKm: e.target.value } : x)),
                )
              }
            />
            <label className="block text-xs text-muted-foreground">
              {t(locale, "vehicleCurrentKmOptional")}
            </label>
            <Input
              inputMode="numeric"
              value={d.currentKm}
              onChange={(e) =>
                setDrafts((prev) =>
                  prev.map((x) => (x.id === d.id ? { ...x, currentKm: e.target.value } : x)),
                )
              }
              placeholder={t(locale, "vehicleCurrentKmPlaceholder")}
            />
            {vehicle ? (
              <p className="text-xs text-muted-foreground">
                {t(locale, "vehicleStatus", {
                  remaining: String(remaining),
                  nextDue: String(nextDue),
                })}
              </p>
            ) : null}
            {vehicles.length > 1 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => removeVehicleById(d.id)}
              >
                {t(locale, "vehicleRemoveOne")}
              </Button>
            ) : null}
          </SettingsAccordion>
        );
      })}

      {vehicles.length < 8 ? (
        <Button type="button" variant="secondary" className="w-full" onClick={() => addVehicle()}>
          {t(locale, "vehicleAddAnother")}
        </Button>
      ) : null}

      <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={prefs.fuelTrackingEnabled !== false}
          onChange={(e) => {
            const next = { ...prefs, fuelTrackingEnabled: e.target.checked };
            setPrefs(next);
            saveVehicleGarage(vehicles, next);
          }}
        />
        <span>
          <span className="block font-medium">{t(locale, "vehicleFuelTrackingToggle")}</span>
          <span className="block text-xs text-muted-foreground">
            {t(locale, "vehicleFuelTrackingHint")}
          </span>
        </span>
      </label>

      <SettingsAccordion variant="nested" title={t(locale, "vehicleGarageModeLabel")}>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="garage-mode"
            checked={prefs.mode === "both"}
            onChange={() => {
              const mode = "both" as const;
              setPrefs((p) => ({ ...p, mode }));
              setVehicleGarageMode(mode);
            }}
          />
          {t(locale, "vehicleGarageModeBoth")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="garage-mode"
            checked={prefs.mode === "split"}
            onChange={() => {
              const mode = "split" as const;
              setPrefs((p) => ({ ...p, mode }));
              setVehicleGarageMode(mode);
            }}
          />
          {t(locale, "vehicleGarageModeSplit")}
        </label>
        {prefs.mode === "split" && viewerUserId ? (
          <>
            <label className="block text-xs text-muted-foreground">
              {t(locale, "vehicleDefaultVehicle")}
            </label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={myPref.defaultVehicleId ?? ""}
              onChange={(e) => {
                const defaultVehicleId = e.target.value || null;
                const next = {
                  ...prefs,
                  members: {
                    ...prefs.members,
                    [viewerUserId]: {
                      ...myPref,
                      defaultVehicleId,
                    },
                  },
                };
                setPrefs(next);
                setVehicleMemberPref(viewerUserId, { defaultVehicleId });
              }}
            >
              <option value="">—</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={myPref.rarelyUsePartnerVehicles}
                onChange={(e) => {
                  const rarelyUsePartnerVehicles = e.target.checked;
                  setVehicleMemberPref(viewerUserId, { rarelyUsePartnerVehicles });
                  setPrefs((p) => ({
                    ...p,
                    members: {
                      ...p.members,
                      [viewerUserId]: {
                        ...getMemberPref(p, viewerUserId),
                        rarelyUsePartnerVehicles,
                      },
                    },
                  }));
                }}
              />
              {t(locale, "vehicleRarelyPartner")}
            </label>
          </>
        ) : null}
        {memberIds.length > 1 ? (
          <p className="text-xs text-muted-foreground">{t(locale, "vehicleToAlertsAll")}</p>
        ) : null}
      </SettingsAccordion>

      <Button type="button" className="w-full" onClick={saveAll}>
        {t(locale, "vehicleSaveGarage")}
      </Button>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTelegramBackHandler } from "@/hooks/useTelegramBackHandler";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { t } from "@/lib/i18n";
import { garageHasVehicles } from "@/lib/vehicle";
import { useStore } from "@/store/useStore";

export function VehicleOdometerDialog() {
  const locale = useStore((s) => s.locale);
  const pending = useStore((s) => s.pendingOdometerPrompt);
  const vehicles = useStore((s) => s.vehicles);
  const transactions = useStore((s) => s.transactions);
  const submitOdometerForTransaction = useStore((s) => s.submitOdometerForTransaction);
  const clearPendingOdometer = useStore((s) => s.clearPendingOdometer);

  const [km, setKm] = useState("");
  const [liters, setLiters] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const initializedPromptRef = useRef<string | null>(null);

  const open = Boolean(pending && garageHasVehicles(vehicles));
  const tx = pending ? transactions.find((t) => t.id === pending.transactionId) : null;
  const selected = useMemo(
    () => vehicles.find((v) => v.id === vehicleId),
    [vehicles, vehicleId],
  );

  useEffect(() => {
    if (!open || !pending) {
      setKm("");
      setLiters("");
      initializedPromptRef.current = null;
      return;
    }
    if (initializedPromptRef.current === pending.transactionId) return;
    initializedPromptRef.current = pending.transactionId;
    setVehicleId(pending.vehicleId);
    const v = vehicles.find((x) => x.id === pending.vehicleId);
    setKm(v?.currentOdometerKm != null ? String(v.currentOdometerKm) : "");
    const existingTx = transactions.find((item) => item.id === pending.transactionId);
    setLiters(existingTx?.fuelLiters != null ? String(existingTx.fuelLiters) : "");
  }, [open, pending, transactions, vehicles]);

  const title =
    pending?.kind === "service"
      ? t(locale, "vehicleOdometerServiceTitle")
      : t(locale, "vehicleOdometerFuelTitle");

  const save = () => {
    if (!pending || !vehicleId) return;
    const n = Number(String(km).replace(/\s/g, ""));
    if (!Number.isFinite(n) || n < 0) return;
    const litersRaw = liters.trim().replace(",", ".").replace(/\s/g, "");
    const fuelLiters =
      pending.kind === "fuel" && litersRaw.length > 0 ? Number(litersRaw) : null;
    if (pending.kind === "fuel" && fuelLiters != null && (!Number.isFinite(fuelLiters) || fuelLiters < 0)) {
      return;
    }
    submitOdometerForTransaction(pending.transactionId, vehicleId, n, fuelLiters);
  };

  const handleTelegramBack = useCallback(() => {
    if (!open) return false;
    clearPendingOdometer();
    return true;
  }, [open, clearPendingOdometer]);

  useTelegramBackHandler(handleTelegramBack, open);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && clearPendingOdometer()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {tx
            ? t(locale, "vehicleOdometerForTx", {
                amount: String(tx.amount),
                note: tx.note.slice(0, 60),
              })
            : ""}
        </p>
        {vehicles.length > 1 ? (
          <>
            <label className="text-xs text-muted-foreground">{t(locale, "vehiclePickInTx")}</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={vehicleId}
              onChange={(e) => {
                const id = e.target.value;
                setVehicleId(id);
                const v = vehicles.find((x) => x.id === id);
                if (v?.currentOdometerKm != null) setKm(String(v.currentOdometerKm));
              }}
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </>
        ) : selected ? (
          <p className="text-sm font-medium">{selected.name}</p>
        ) : null}
        <label className="text-xs text-muted-foreground">
          {t(locale, "vehicleOdometerLabel")}
        </label>
        <Input
          inputMode="numeric"
          autoFocus
          value={km}
          onChange={(e) => setKm(e.target.value)}
          placeholder="125000"
          onKeyDown={(e) => {
            if (e.key === "Enter" && pending?.kind !== "fuel") save();
          }}
        />
        {pending?.kind === "fuel" ? (
          <>
            <label className="text-xs text-muted-foreground">
              {t(locale, "vehicleFuelLitersLabel")}
            </label>
            <Input
              inputMode="decimal"
              value={liters}
              onChange={(e) => setLiters(e.target.value)}
              placeholder="45"
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
            />
          </>
        ) : null}
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={clearPendingOdometer}>
            {t(locale, "vehicleOdometerSkip")}
          </Button>
          <Button type="button" className="flex-1" onClick={save}>
            {t(locale, "vehicleOdometerSave")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

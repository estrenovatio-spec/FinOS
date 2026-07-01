"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { collectServiceAlerts, garageHasVehicles } from "@/lib/vehicle";
import { useStore } from "@/store/useStore";

export function VehicleMaintenanceBanner() {
  const locale = useStore((s) => s.locale);
  const vehicles = useStore((s) => s.vehicles);
  const dismissServiceAlert = useStore((s) => s.dismissServiceAlert);

  if (!garageHasVehicles(vehicles)) return null;

  const alerts = collectServiceAlerts(vehicles);
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2 px-3 pt-2">
      {alerts.map((alert) => {
        const text =
          alert.level === 0
            ? t(locale, "vehicleAlertDue", { name: alert.vehicleName })
            : t(locale, "vehicleAlertSoon", {
                name: alert.vehicleName,
                km: String(alert.kmUntil),
              });
        return (
          <div
            key={`${alert.vehicleId}-${alert.level}`}
            className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
            role="status"
          >
            <span className="flex-1">{text}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => dismissServiceAlert(alert.vehicleId, alert.level)}
              aria-label={t(locale, "vehicleAlertDismiss")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}

"use client";

import { BusinessTab } from "@/components/app/BusinessTab";
import { MoreTab } from "@/components/app/MoreTab";
import { useStore } from "@/store/useStore";

export function SettingsTab() {
  const locale = useStore((s) => s.locale);
  const businessModeEnabled = useStore((s) => s.businessModeEnabled);

  return (
    <div className="space-y-4">
      <MoreTab />
      {businessModeEnabled ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {locale === "ru" ? "Дополнительно" : "Additional"}
          </p>
          <BusinessTab />
        </div>
      ) : null}
    </div>
  );
}

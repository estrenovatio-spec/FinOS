"use client";

import { SettingsDialogNav } from "@/components/SettingsDialogNav";

export function SettingsTab() {
  return (
    <div className="space-y-3 py-1">
      <SettingsDialogNav open onOpenChange={() => {}} />
    </div>
  );
}

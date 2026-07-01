"use client";

import { useEffect, useState } from "react";
import { SettingsDialogNav } from "@/components/SettingsDialogNav";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { OPEN_SETTINGS_EVENT } from "@/lib/billing/trial-banner";

/** Настройки всегда в DOM — работает с вкладки «Ещё» и с шестерёнки в шапке. */
export function SettingsDialogHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const openSettings = () => setOpen(true);
    window.addEventListener(OPEN_SETTINGS_EVENT, openSettings);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, openSettings);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] max-w-sm overflow-y-auto px-4 pb-4 pt-3">
        <SettingsDialogNav open={open} onOpenChange={setOpen} />
      </DialogContent>
    </Dialog>
  );
}
